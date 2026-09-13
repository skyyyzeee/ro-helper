import type { Article, Chapter, Note, Point } from '../core/model';
import { cleanLines, type ParsedLaw, type ParseIssue } from './lawText';

/**
 * Charters, regulations and project rules written as numbered points instead of articles:
 * «Глава I. Общие положения» / «1.1. Текст» (уставы), «1. Текст» (положения СК), or no chapters at all
 * and «1.1 Текст | Demorgan 60 минут» under unnumbered section titles (правила проекта).
 * Every point, at any depth, is an article of its own — or, with `subpoints: 'list'`, a point at the third level
 * (5.1.1) is an item of its point's list (5.1), its lines joined into one.
 */

export interface PointsOptions {
  subpoints?: 'list';
}

/** Joins a line to the text before it: a heading without a full stop («Замечание (устное)») gets one. */
const joinLine = (text: string, line: string) => (/[.:;,!?—–-]$/.test(text) ? `${text} ${line}` : `${text}. ${line}`);

/** «Глава I. …», «ГЛАВА 2. …», «Глава I | …», «Раздел II. …». */
const CHAPTER = /^(?:Глава|Раздел)\s+([IVXLC]+|\d+)\s*(?:[.|]\s*(.*))?$/i;
/** «1. ОБЩИЕ ПОЛОЖЕНИЯ БОЛЬНИЦЫ»: a numbered heading in capitals. */
const CAPS_CHAPTER = /^(\d+)\.\s+([^a-zа-яё]{3,80})$/;
/** «1.1. …», «1.1 …», «1.1 | …», «1. …» — a bare «15 – …» is no point. */
const POINT = /^(\d{1,3}\.\d{1,3}(?:\.\d{1,3})*\.?|\d{1,3}\.)(?:\s+\|?\s*|\s*\|\s*)(\S.*)$/;
const ITEM = /^([а-яё]|\d+)\)\s+(.*)$/;
/** «2. Обязанности лидера»: in project rules written in «1.1» points, the title of the section numbered 2. */
const NUMBERED_SECTION = /^(\d{1,2})\.\s+([^.;!?]{2,80}?)\s*:?$/;
/**
 * «Примечание: …», «➤ Исключение к п.5.42.: …», «Пояснение: …» — and «Наказание: Строгий выговор» on the line under
 * a point, where the charters of Арбатский and Кутузовский write what Тверской puts after «|».
 */
const NOTE = /^➤?\s*(Примечани[ея]|Пояснени[ея]|Исключени[ея]|Дополнени[ея]|Наказани[ея]|Пример)[^:]{0,40}:\s*(.*)$/i;
const TOC = /^(?:Оглавление|Содержание)$/i;
const JUNK = /^(?:Нажмите, чтобы раскрыть\.\.\.|Спойлер:.*|\.)$/;
/** The signature of the head of the СК at the end of its regulations. */
const SIGNATURE = /^Председатель$/;
/** A short line that reads as a title: no sentence end, not a list item. */
const TITLE_LIKE = /^[^•\-—・\d][^.;,]{2,69}$/;

const ROMAN: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const romanValue: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

/** «XIV» → 14, «3» → 3. */
function ordinal(number: string): number {
  if (/^\d+$/.test(number)) return Number(number);
  const digits = [...number.toUpperCase()].map((ch) => romanValue[ch] ?? 0);
  return digits.reduce((sum, value, i) => sum + (value < (digits[i + 1] ?? 0) ? -value : value), 0);
}

function toRoman(n: number): string {
  let out = '';
  for (const [value, letters] of ROMAN) while (n >= value) (out += letters), (n -= value);
  return out;
}

/**
 * Ids stay unique: where numbers repeat, they carry the chapter (8-ФЗ numbers articles again in each chapter);
 * a number written twice in one chapter (ГИБДД 4.2.1) takes its place in the order: `…-4.2.1~2`.
 */
export function uniqueIds(articles: Article[], documentId: string, issues: ParseIssue[] = []): void {
  const numbers = articles.map((a) => a.number);
  if (new Set(numbers).size === numbers.length) return;
  const seen = new Map<string, number>();
  // The issues found while parsing name the article by its old id; they must follow it, or a manual
  // fix keyed by the final id would never resolve them.
  const renamed = new Map<string, string>();
  for (const a of articles) {
    const id = `${documentId}-${a.chapter ?? '0'}-${a.number}`;
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    const next = n > 1 ? `${id}~${n}` : id;
    renamed.set(a.id, next);
    a.id = next;
  }
  for (const issue of issues) {
    const next = issue.article && renamed.get(issue.article);
    if (next) issue.article = next;
  }
}

/** «Примечания» → «Примечание». */
const noteLabel = (word: string) => {
  const w = word.toLowerCase();
  return w.startsWith('пример') ? 'Пример' : w.charAt(0).toUpperCase() + w.slice(1, -1) + 'е';
};

export function parsePointsText(text: string, documentId: string, options: PointsOptions = {}): ParsedLaw {
  const lines = cleanLines(text);
  const chapters: Chapter[] = [];
  const articles: Article[] = [];
  const header: string[] = [];
  const footer: string[] = [];
  const issues: ParseIssue[] = [];
  const explicitChapters = lines.some((line) => CHAPTER.test(line) || CAPS_CHAPTER.test(line));
  // Where points are «1.1», a bare «1.» is an item of a list inside a point (МВД: «1. Генерал»).
  const dotted = lines.some((line) => /^\d+\.\d+/.test(line));
  let chapter: Chapter | undefined;
  let group: string | undefined;
  let article: Article | undefined;
  let note: Note | undefined;
  /** With sub-points as a list: the item being written, to which its following lines are joined. */
  let item: Point | undefined;
  let ended = false;
  const filled = new Set<Chapter>();
  /** Project rules: section titles written as «2. Название», by the section's number. */
  const sectionTitles = new Map<string, string>();
  const chapterOf = new Map<Article, Chapter>();

  /** Title-like lines at the end of the last point, which belong to what follows it; within a chapter, only «…:» sub-headings. */
  const popTitles = (colonOnly: boolean): string[] => {
    const popped: string[] = [];
    const parts = article?.parts ?? [];
    while (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (last.number || last.points.length || !TITLE_LIKE.test(last.text) || (colonOnly && !last.text.endsWith(':'))) break;
      popped.unshift(parts.pop()!.text);
    }
    return popped;
  };

  /**
   * Project rules: the title of the section a point opens, among the last lines of the point before it —
   * «Игровые чаты» / «Запрещено нарушение общих положений игрового чата:» (a sub-heading) /
   * «Методы расправы» / «Захват территории — способ …» (the section's introduction).
   */
  const popSectionTitle = (): { title: string; subheading?: string; preface: string[] } => {
    const parts = article?.parts ?? [];
    let start = parts.length;
    while (start > 1 && parts.length - start < 3 && !parts[start - 1].number && !parts[start - 1].points.length) start--;
    const at = parts.slice(start).findIndex((p) => TITLE_LIKE.test(p.text));
    if (at === -1) return { title: '', preface: [] };
    const [title, ...rest] = parts.splice(start + at).map((p) => p.text);
    const subheading = rest[0]?.endsWith(':') && TITLE_LIKE.test(rest[0]) ? rest.shift()!.replace(/:$/, '') : undefined;
    return { title: title.replace(/:$/, ''), subheading, preface: rest };
  };

  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if (ended) {
      footer.push(line);
      continue;
    }
    if (JUNK.test(line) || TOC.test(line)) continue;
    if (SIGNATURE.test(line) && article) {
      ended = true;
      footer.push(line);
      continue;
    }
    if ((m = line.match(CHAPTER)) || (m = line.match(CAPS_CHAPTER))) {
      chapter = { number: m[1], title: (m[2] ?? '').replace(/\.$/, ''), ...(/^раздел/i.test(line) ? { kind: 'section' as const } : {}), preface: [] };
      chapters.push(chapter);
      group = undefined;
      article = undefined;
      note = undefined;
      item = undefined;
      continue;
    }
    if (!explicitChapters && dotted && (m = line.match(NUMBERED_SECTION))) {
      sectionTitles.set(m[1], m[2]);
      continue;
    }
    if ((m = line.match(POINT)) && (!dotted || m[1].includes('.', m[1].indexOf('.') + 1) || /^\d+\.\d/.test(m[1]))) {
      const number = m[1].replace(/\.$/, '');
      if (options.subpoints === 'list' && article && number.startsWith(`${article.number}.`)) {
        item = { marker: number, text: m[2] };
        article.parts[article.parts.length - 1].points.push(item);
        note = undefined;
        continue;
      }
      item = undefined;
      if (!explicitChapters) {
        // Project rules: the chapter is the point's first number, titled by the line before its first point.
        const first = number.split('.')[0];
        if (chapter?.number !== first && sectionTitles.has(first)) {
          // Titled by its own «2. Название» line: the lines before the point stay with the point before it.
          chapter = { number: first, title: sectionTitles.get(first)!, kind: 'section', preface: [] };
          chapters.push(chapter);
          group = undefined;
        } else if (chapter?.number !== first) {
          const { title, subheading, preface } = popSectionTitle();
          // The rules call them sections: «р. 11, п. 4».
          chapter = { number: first, title, kind: 'section', preface };
          chapters.push(chapter);
          group = subheading;
        }
      }
      const subheading = popTitles(true).at(-1);
      if (subheading) group = subheading.replace(/:$/, '');
      // A charter's point 4.1 opens chapter IV even where only the table of contents names it (ГИБДД);
      // only the next chapter, so a point numbered out of place (8.2 inside IV) stays where it stands.
      const first = Number(number.split('.')[0]);
      if (explicitChapters && number.includes('.') && chapter && first === ordinal(chapter.number) + 1) {
        const own = [...chapters].reverse().find((c) => ordinal(c.number) === first);
        if (own) {
          chapter = own;
          group = undefined;
        }
      }
      const [body, ...punishment] = m[2].split(/\s+\|\s+/);
      article = { id: `${documentId}-${number}`, number, title: '', chapter: chapter?.number, parts: [{ text: body, points: [] }], notes: [] };
      if (group) article.group = group;
      if (punishment.length) article.notes.push({ label: 'Наказание', text: punishment.join(' | ') });
      articles.push(article);
      if (chapter) {
        filled.add(chapter);
        chapterOf.set(article, chapter);
      }
      note = undefined;
      continue;
    }
    if (!article) {
      if (chapter) chapter.preface.push(line);
      else header.push(line);
      continue;
    }
    if ((m = line.match(NOTE))) {
      note = { label: noteLabel(m[1]), text: m[2] };
      article.notes.push(note);
      item = undefined;
      continue;
    }
    if (item) {
      item.text = joinLine(item.text, line);
      continue;
    }
    if ((m = line.match(ITEM))) {
      article.parts[article.parts.length - 1].points.push({ marker: m[1], text: m[2] });
      note = undefined;
      continue;
    }
    // A plain line: continues an open note, unless it reads as a title (the next section's), otherwise a paragraph.
    if (note && !TITLE_LIKE.test(line)) note.text = `${note.text} ${line}`.trim();
    else {
      note = undefined;
      article.parts.push({ text: line, points: [] });
    }
  }

  // Project rules: the first section's title is the last line before the first point.
  if (!explicitChapters && chapters[0] && !chapters[0].title && header.length && TITLE_LIKE.test(header.at(-1)!)) {
    chapters[0].title = header.pop()!.replace(/:$/, '');
  }

  // A table of contents lists the chapters before they come: those empty copies go. What is left
  // follows its points, so a chapter known only from the contents (ГИБДД IV–X) stands in its place.
  const firstPoint = (c: Chapter) => articles.findIndex((a) => chapterOf.get(a) === c);
  const kept = chapters
    .filter((c, i) => filled.has(c) || c.preface.length || !chapters.slice(i + 1).some((later) => later.number === c.number))
    .map((c, i) => ({ c, order: filled.has(c) ? firstPoint(c) : Number.MAX_SAFE_INTEGER, i }))
    .sort((a, b) => a.order - b.order || a.i - b.i)
    .map(({ c }) => c);

  // Two filled chapters with one number (a typo: «Раздел II» twice) are told apart by their points.
  const seen = new Set<string>();
  for (const c of kept) {
    if (seen.has(c.number) && filled.has(c)) {
      const own = articles.filter((a) => chapterOf.get(a) === c);
      const first = Number(own[0]?.number.split('.')[0]);
      const number = /^[IVXLC]+$/i.test(c.number) && first ? toRoman(first) : String(first || c.number);
      if (!seen.has(number)) {
        c.number = number;
        for (const a of own) a.chapter = number;
      }
    }
    seen.add(c.number);
  }

  uniqueIds(articles, documentId, issues);
  return { chapters: kept, articles, header, footer, issues };
}
