import { penalParts } from './format';
import type { Article, LawDocument, Part, ServerPack } from './model';
import { cachedStem, matchWord, wordIndex, words, type WordMatcher } from './wordIndex';

export interface SearchHit {
  article: Article;
  document: LawDocument;
  /**
   * Set when the hit is one part of an article: the user asked for a part («ч 1»), or the article
   * has several parts with different punishments — each of those is a hit of its own.
   */
  part?: Part;
}

export interface SearchOptions {
  /** Documents of the user's organisation; they rank above the rest. */
  boostDocuments?: string[];
  limit?: number;
}

/** Scores: a number match outranks any words; in words, title > synonym > text. */
const SCORE = { number: 1000, title: 30, synonymInTitle: 25, synonym: 20, text: 10, organisation: 5, penalCode: 3 };

const SKIP = new Set(['ст', 'ст.', 'статья']);
const NUMBER = /^\d+(?:\.\d+)*\.?$/;
const PART_WORD = /^(?:ч|ч\.|часть)$/;
/** «ч1», «ч.1» typed without a space. */
const PART_GLUED = /^ч\.?(\d+)$/;

interface Query {
  scope?: LawDocument;
  number?: string;
  part?: string;
  words: string[];
  /** The last word is still being typed, so it may be the start of a longer word. */
  typing: boolean;
}

function parseQuery(pack: ServerPack, raw: string): Query {
  const tokens = raw.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter((t) => t && !SKIP.has(t));
  const query: Query = { words: [], typing: !/\s$/.test(raw) };
  let expectPart = false;

  for (const token of tokens) {
    const glued = token.match(PART_GLUED);
    const doc = pack.documents.find((d) => d.aliases.includes(token));
    if (glued && query.number) query.part = glued[1];
    else if (PART_WORD.test(token) && query.number) expectPart = true;
    else if (expectPart && /^\d+$/.test(token)) {
      query.part = token;
      expectPart = false;
    } else if (doc && !query.scope) query.scope = doc;
    else if (NUMBER.test(token) && !query.number) query.number = token.replace(/\.$/, '');
    else query.words.push(...words(token));
  }
  return query;
}

/** Exact number first, then its sub-articles (65 → 65.1), then numbers that merely start with it (6 → 60). */
function numberScore(articleNumber: string, query: string): number {
  if (articleNumber === query) return 3;
  if (articleNumber.startsWith(query + '.')) return 2;
  if (articleNumber.startsWith(query)) return 1;
  return 0;
}

const stemsOf = (text: string) => new Set(words(text).map(cachedStem));

interface Fields {
  title: Set<string>;
  text: Set<string>;
}

function fieldsOf(article: Article, part?: Part): Fields {
  const partText = (p: Part) => [p.text, ...p.points.map((point) => point.text)].join(' ');
  const notes = article.notes.map((note) => note.text).join(' ');
  const text = part ? `${partText(part)} ${notes}` : [article.group ?? '', ...article.parts.map(partText), notes].join(' ');
  return { title: stemsOf(article.title), text: stemsOf(text) };
}

/** Best score of one query word in an entry; 0 when it does not occur. */
function wordScore(matcher: WordMatcher, fields: Fields): number {
  let best = 0;
  for (const [s, factor] of matcher.stems) {
    if (fields.title.has(s)) best = Math.max(best, SCORE.title * factor);
    else if (fields.text.has(s)) best = Math.max(best, SCORE.text * factor);
  }
  for (const phrase of matcher.phrases) {
    if (!phrase.length) continue;
    if (phrase.every((s) => fields.title.has(s))) best = Math.max(best, SCORE.synonymInTitle);
    else if (phrase.every((s) => fields.title.has(s) || fields.text.has(s))) best = Math.max(best, SCORE.synonym);
  }
  return best;
}

/** Sum of word scores, or 0 if any word is missing. */
function wordsScore(matchers: WordMatcher[], fields: Fields): number {
  let total = 0;
  for (const matcher of matchers) {
    const score = wordScore(matcher, fields);
    if (!score) return 0;
    total += score;
  }
  return total;
}

/**
 * Finds articles by number and/or words: «65», «ук 65», «коап 8.6 ч 1», «кражу», «превышение скорости», «8.6 скорость».
 * Words match by stem, by the start of the word being typed, by synonym and with a typo or two.
 */
export function searchArticles(pack: ServerPack, raw: string, options: SearchOptions = {}): SearchHit[] {
  const query = parseQuery(pack, raw);
  if (!query.number && !query.words.length) return [];
  const index = wordIndex(pack);
  const matchers = query.words.map((word, i) => matchWord(index, word, query.typing && i === query.words.length - 1));
  const boost = new Set(options.boostDocuments ?? []);
  const bonus = (document: LawDocument) =>
    (boost.has(document.id) ? SCORE.organisation : 0) + (document.kind === 'penal-code' ? SCORE.penalCode : 0);

  const hits: (SearchHit & { score: number; order: number })[] = [];
  const consider = (article: Article, document: LawDocument, part: Part | undefined, base: number, order: number, fields?: Fields) => {
    const words = matchers.length ? wordsScore(matchers, fields ?? fieldsOf(article, part)) : 0;
    if (matchers.length && !words) return;
    hits.push({ article, document, part, score: base + words + bonus(document), order });
  };

  if (query.number) {
    let order = 0;
    for (const document of pack.documents) {
      if (query.scope && document !== query.scope) continue;
      for (const article of document.articles) {
        order++;
        const score = numberScore(article.number, query.number);
        if (!score) continue;
        const base = SCORE.number * score;
        if (query.part) {
          // A part only narrows the exact article the user named.
          const part = score === 3 ? article.parts.find((p) => p.number === query.part) : undefined;
          if (part) consider(article, document, part, base, order);
          continue;
        }
        const penal = penalParts(article);
        if (penal.length > 1) penal.forEach((part) => consider(article, document, part, base, order));
        else consider(article, document, undefined, base, order);
      }
    }
  } else {
    // Candidates: entries containing anything the first word can match.
    const [first] = matchers;
    const candidates = new Set<number>();
    for (const s of first.stems.keys()) index.postings.get(s)?.forEach((i) => candidates.add(i));
    for (const phrase of first.phrases) index.postings.get(phrase[0])?.forEach((i) => candidates.add(i));
    for (const i of candidates) {
      const entry = index.entries[i];
      if (query.scope && entry.document !== query.scope) continue;
      consider(entry.article, entry.document, entry.part, 0, entry.order, entry);
    }
  }

  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  return hits.slice(0, options.limit ?? 50).map(({ article, document, part }) => (part ? { article, document, part } : { article, document }));
}
