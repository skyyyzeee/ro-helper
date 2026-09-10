import { penalParts } from './format';
import type { Article, LawDocument, Part, ServerPack } from './model';
import { stem } from './stem';

/** Words too common to search by. */
const STOP_WORDS = new Set(
  'без более бы был была были было быть вне для его ее если есть же или иной иные иных как когда кроме ли либо лица лицо лицом между настоящего настоящей него нее них ним ними при про так также такой такого такие таких то того тоже только том тот указанных чем что чтобы это этого этой этом эти этих'.split(' '),
);

/** Lower-case words of a text, «ё» as «е»; digits and words shorter than three letters dropped. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/** One searchable unit: an article, or one punished part of an article that has several. */
export interface Entry {
  article: Article;
  document: LawDocument;
  part?: Part;
  title: Set<string>;
  text: Set<string>;
  /** Position in the pack, for stable ordering. */
  order: number;
}

export interface WordIndex {
  entries: Entry[];
  /** Stem → entries whose title or text contains it. */
  postings: Map<string, number[]>;
  vocabulary: string[];
  /** Synonym key stem → phrases, each phrase as its list of stems. */
  synonyms: Map<string, string[][]>;
}

/** Stems repeat a lot across the corpus; caching them makes building the index several times faster. */
const stemCache = new Map<string, string>();
export function cachedStem(word: string): string {
  let s = stemCache.get(word);
  if (s === undefined) {
    s = stem(word);
    stemCache.set(word, s);
  }
  return s;
}

const stems = (text: string) => new Set(words(text).map(cachedStem));

function partText(part: Part): string {
  return [part.text, ...part.points.map((point) => point.text)].join(' ');
}

function buildIndex(pack: ServerPack): WordIndex {
  const entries: Entry[] = [];
  for (const document of pack.documents) {
    for (const article of document.articles) {
      const title = stems(article.title);
      const notes = article.notes.map((note) => note.text).join(' ');
      const penal = penalParts(article);
      if (penal.length > 1) {
        for (const part of penal) {
          entries.push({ article, document, part, title, text: stems(`${partText(part)} ${notes}`), order: entries.length });
        }
      } else {
        const text = [article.group ?? '', ...article.parts.map(partText), notes].join(' ');
        entries.push({ article, document, title, text: stems(text), order: entries.length });
      }
    }
  }

  const postings = new Map<string, number[]>();
  entries.forEach((entry, i) => {
    for (const s of new Set([...entry.title, ...entry.text])) {
      const list = postings.get(s);
      if (list) list.push(i);
      else postings.set(s, [i]);
    }
  });

  const synonyms = new Map<string, string[][]>();
  for (const [key, phrases] of Object.entries(pack.synonyms ?? {})) {
    const keyStem = cachedStem(words(key)[0] ?? key.toLowerCase());
    const list = synonyms.get(keyStem) ?? [];
    for (const phrase of phrases) list.push(words(phrase).map(cachedStem));
    synonyms.set(keyStem, list);
  }

  return { entries, postings, vocabulary: [...postings.keys()], synonyms };
}

const cache = new WeakMap<ServerPack, WordIndex>();

/** The word index of a pack, built on first use. */
export function wordIndex(pack: ServerPack): WordIndex {
  let index = cache.get(pack);
  if (!index) {
    index = buildIndex(pack);
    cache.set(pack, index);
  }
  return index;
}

/** Optimal string alignment distance, giving up once it exceeds `limit`. */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prev2[j - 2] + 1);
      row.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

/** How one query word may match: stems with a confidence factor, and synonym phrases. */
export interface WordMatcher {
  stems: Map<string, number>;
  phrases: string[][];
}

/** Confidence of a match: the start of a word being typed, or a word with a typo, counts for less. */
export const MATCH = { exact: 1, prefix: 0.6, typo: 0.5 };

/**
 * Stems a query word can match: its own stem; for the word being typed, stems it is the start of;
 * and the phrases of its synonyms. Only a word the laws do not contain is read as a typo: stems
 * within one edit (words of 5+ letters) or two (8+), keeping the first letter.
 */
export function matchWord(index: WordIndex, word: string, typing: boolean): WordMatcher {
  const own = cachedStem(word);
  const matched = new Map<string, number>();
  const put = (s: string, factor: number) => matched.set(s, Math.max(matched.get(s) ?? 0, factor));
  const known = index.postings.has(own);
  if (known) put(own, MATCH.exact);

  const limit = known ? 0 : word.length >= 8 ? 2 : word.length >= 5 ? 1 : 0;
  for (const s of index.vocabulary) {
    if (s === own) continue;
    if (typing && word.length >= 3 && (s.startsWith(word) || s.startsWith(own))) put(s, MATCH.prefix);
    else if (limit && s[0] === own[0] && distance(own, s, limit) <= limit) put(s, MATCH.typo);
  }
  return { stems: matched, phrases: index.synonyms.get(own) ?? [] };
}
