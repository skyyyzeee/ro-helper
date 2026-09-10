import { penalParts } from './format';
import type { Article, LawDocument, Part, ServerPack } from './model';

export interface SearchHit {
  article: Article;
  document: LawDocument;
  /**
   * Set when the hit is one part of an article: the user asked for a part («ч 1»), or the article
   * has several parts with different punishments — each of those is a hit of its own.
   */
  part?: Part;
}

const SKIP = new Set(['ст', 'ст.', 'статья']);
const NUMBER = /^\d+(?:\.\d+)*\.?$/;
const PART_WORD = /^(?:ч|ч\.|часть)$/;
/** «ч1», «ч.1» typed without a space. */
const PART_GLUED = /^ч\.?(\d+)$/;

/** Exact number first, then its sub-articles (65 → 65.1), then numbers that merely start with it (6 → 60). */
function numberScore(articleNumber: string, query: string): number {
  if (articleNumber === query) return 3;
  if (articleNumber.startsWith(query + '.')) return 2;
  if (articleNumber.startsWith(query)) return 1;
  return 0;
}

interface Query {
  scope?: LawDocument;
  number?: string;
  part?: string;
}

function parseQuery(pack: ServerPack, query: string): Query | null {
  const tokens = query.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter((t) => t && !SKIP.has(t));
  const parsed: Query = {};
  let expectPart = false;

  for (const token of tokens) {
    const glued = token.match(PART_GLUED);
    const doc = pack.documents.find((d) => d.aliases.includes(token));
    if (glued && parsed.number) parsed.part = glued[1];
    else if (PART_WORD.test(token) && parsed.number) expectPart = true;
    else if (expectPart && /^\d+$/.test(token)) {
      parsed.part = token;
      expectPart = false;
    } else if (doc && !parsed.scope && !parsed.number) parsed.scope = doc;
    else if (NUMBER.test(token) && !parsed.number) parsed.number = token.replace(/\.$/, '');
    else return null; // an unknown word: nothing matches until word search exists
  }
  return parsed;
}

/**
 * Finds articles by number, optionally with a document alias and a part:
 * «65», «ук 65», «ст. 50.1», «коап 8.6 ч 1». Word search comes later; a query without a number returns nothing yet.
 */
export function searchArticles(pack: ServerPack, query: string): SearchHit[] {
  const parsed = parseQuery(pack, query);
  if (!parsed?.number) return [];
  const { scope, number, part: partNumber } = parsed;

  const hits: (SearchHit & { score: number; order: number })[] = [];
  let order = 0;
  for (const document of pack.documents) {
    if (scope && document !== scope) continue;
    for (const article of document.articles) {
      const score = numberScore(article.number, number);
      order++;
      if (!score) continue;

      if (partNumber) {
        // A part only narrows the exact article the user named.
        const part = score === 3 ? article.parts.find((p) => p.number === partNumber) : undefined;
        if (part) hits.push({ article, document, part, score, order });
        continue;
      }
      const penal = penalParts(article);
      if (penal.length > 1) penal.forEach((part) => hits.push({ article, document, part, score, order }));
      else hits.push({ article, document, score, order });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  return hits.map(({ article, document, part }) => (part ? { article, document, part } : { article, document }));
}
