import type { Article, LawDocument, ServerPack } from './model';

export interface SearchHit {
  article: Article;
  document: LawDocument;
}

const SKIP = new Set(['ст', 'ст.', 'статья']);
const NUMBER = /^\d+(?:\.\d+)*\.?$/;

/** Exact number first, then its sub-articles (65 → 65.1), then numbers that merely start with it (6 → 60). */
function numberScore(articleNumber: string, query: string): number {
  if (articleNumber === query) return 3;
  if (articleNumber.startsWith(query + '.')) return 2;
  if (articleNumber.startsWith(query)) return 1;
  return 0;
}

/**
 * Finds articles by number, optionally prefixed with a document alias: «65», «ук 65», «ст. 50.1».
 * Word search comes later; a query without a number returns nothing yet.
 */
export function searchArticles(pack: ServerPack, query: string): SearchHit[] {
  const tokens = query.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter((t) => t && !SKIP.has(t));
  let scope: LawDocument | undefined;
  let number: string | undefined;

  for (const token of tokens) {
    const doc = pack.documents.find((d) => d.aliases.includes(token));
    if (doc && !scope) scope = doc;
    else if (NUMBER.test(token) && !number) number = token.replace(/\.$/, '');
    else return []; // an unknown word: nothing matches until word search exists
  }
  if (!number) return [];

  const hits: (SearchHit & { score: number; order: number })[] = [];
  let order = 0;
  for (const document of pack.documents) {
    if (scope && document !== scope) continue;
    for (const article of document.articles) {
      const score = numberScore(article.number, number);
      if (score) hits.push({ article, document, score, order });
      order++;
    }
  }
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  return hits.map(({ article, document }) => ({ article, document }));
}
