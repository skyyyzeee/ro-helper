import { formatPunishment } from './format';
import type { Article, ArticleChange, ChangeEntry, DocumentChange, LawDocument, ServerPack } from './model';

/** An article as text for comparing and showing: parts with their numbers, lists, punishments, notes. */
export function articleText(article: Article): string {
  const lines: string[] = [];
  for (const part of article.parts) {
    lines.push((part.number ? `${part.number}. ` : '') + part.text);
    for (const point of part.points) lines.push(`${point.marker}) ${point.text}`);
    if (part.punishment) lines.push(`Наказание: ${formatPunishment(part.punishment)}`);
  }
  for (const note of article.notes) lines.push(`${note.label}: ${note.text}`);
  return lines.filter(Boolean).join('\n');
}

const sameArticle = (a: Article, b: Article) => a.title === b.title && articleText(a) === articleText(b);

function diffDocument(before: LawDocument, after: LawDocument): ArticleChange[] {
  const old = new Map(before.articles.map((a) => [a.id, a]));
  const now = new Map(after.articles.map((a) => [a.id, a]));
  const changes: ArticleChange[] = [];
  for (const a of after.articles) {
    const was = old.get(a.id);
    if (!was) changes.push({ kind: 'added', articleId: a.id, after: a });
    else if (!sameArticle(was, a)) changes.push({ kind: 'changed', articleId: a.id, before: was, after: a });
  }
  for (const a of before.articles) if (!now.has(a.id)) changes.push({ kind: 'removed', articleId: a.id, before: a });
  return changes;
}

/**
 * What changed from one version of the laws to the next, document by document: articles added, removed
 * and changed (with the text before and after). A document that came or went is one change, not its articles.
 */
export function diffPacks(before: Pick<ServerPack, 'documents'>, after: Pick<ServerPack, 'documents'>): DocumentChange[] {
  const old = new Map(before.documents.map((d) => [d.id, d]));
  const now = new Set(after.documents.map((d) => d.id));
  const head = (d: LawDocument) => ({ documentId: d.id, short: d.short, title: d.title });
  const result: DocumentChange[] = [];
  for (const d of after.documents) {
    const was = old.get(d.id);
    if (!was) result.push({ ...head(d), kind: 'added', articles: [] });
    else {
      const articles = diffDocument(was, d);
      if (articles.length) result.push({ ...head(d), kind: 'changed', articles });
    }
  }
  for (const d of before.documents) if (!now.has(d.id)) result.push({ ...head(d), kind: 'removed', articles: [] });
  return result;
}

/** Updates the user has not seen yet: newer than the version they last saw. */
export function changesSince(pack: Pick<ServerPack, 'changes'>, seenVersion: string): ChangeEntry[] {
  return pack.changes.filter((entry) => entry.version > seenVersion);
}

/** Updates within the last `days` days (by the time of the edit). */
export function recentChanges(pack: Pick<ServerPack, 'changes'>, now: Date, days: number): ChangeEntry[] {
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  return pack.changes.filter((entry) => Date.parse(entry.version) >= since);
}

/** Articles added or changed in these updates, by id, with the newest change of each. */
export function changedArticles(entries: ChangeEntry[]): Map<string, { change: ArticleChange; entry: ChangeEntry; document: DocumentChange }> {
  const result = new Map<string, { change: ArticleChange; entry: ChangeEntry; document: DocumentChange }>();
  for (const entry of entries) {
    for (const document of entry.documents) {
      for (const change of document.articles) {
        if (change.kind !== 'removed' && !result.has(change.articleId)) result.set(change.articleId, { change, entry, document });
      }
    }
  }
  return result;
}

export interface WordDiff {
  text: string;
  kind: 'same' | 'removed' | 'added';
}

/** Words and the spaces and line breaks between them, so the text comes back exactly when joined. */
const tokens = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];

/**
 * The words of `before` and `after`, each marked as kept, removed or added (a longest common subsequence
 * of words). Very long texts that differ throughout are compared as one removal and one addition.
 */
export function diffWords(before: string, after: string): WordDiff[] {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length * b.length > 4_000_000) {
    return [
      { text: before, kind: 'removed' },
      { text: after, kind: 'added' },
    ];
  }
  // lcs[i][j]: length of the common subsequence of a[i..] and b[j..].
  const width = b.length + 1;
  const lcs = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] = a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const out: WordDiff[] = [];
  const push = (text: string, kind: WordDiff['kind']) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(a[i], 'same');
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) push(a[i++], 'removed');
    else push(b[j++], 'added');
  }
  while (i < a.length) push(a[i++], 'removed');
  while (j < b.length) push(b[j++], 'added');
  return out;
}
