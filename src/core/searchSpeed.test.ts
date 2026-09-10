import { beforeAll, describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import type { ServerPack } from './model';
import { searchArticles } from './search';

// The full Тверской corpus is ~1.3M characters; today's pack is ~0.3M. Six copies stand in for it with room to spare.
const big: ServerPack = {
  ...TVERSKOI_PACK,
  documents: Array.from({ length: 6 }, (_, copy) =>
    TVERSKOI_PACK.documents.map((d) => ({ ...d, id: `${d.id}${copy}`, articles: d.articles.map((a) => ({ ...a, id: `${a.id}${copy}` })) })),
  ).flat(),
};

describe('search speed', () => {
  beforeAll(() => {
    searchArticles(big, 'кража'); // builds the index once, as the app does on first use
  });

  it('answers every keystroke well within a frame on a corpus larger than the full Тверской one', () => {
    const queries = ['превышение скорости', 'незаконное проникновение', 'кража группой лиц', 'крожа', 'коап 8.6 ч 1'];
    let keystrokes = 0;
    const start = performance.now();
    for (const query of queries) {
      for (let i = 1; i <= query.length; i++) {
        searchArticles(big, query.slice(0, i));
        keystrokes++;
      }
    }
    const perKeystroke = (performance.now() - start) / keystrokes;
    expect(perKeystroke).toBeLessThan(16);
  });
});
