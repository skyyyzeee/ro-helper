import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data/bundled';
import { explainEmpty } from './empty';
import { searchArticles } from './search';

const pack = TVERSKOI_PACK;
const finds = (query: string, document?: string) => searchArticles(pack, query, document ? { document } : {}).length > 0;

describe('what a search that found nothing tells (roadmap 1В)', () => {
  it('says nothing of a query that finds something, or of none at all', () => {
    expect(explainEmpty(pack, 'кража ')).toBeNull();
    expect(explainEmpty(pack, '   ')).toBeNull();
  });

  it('tells how many documents were looked through, and which words the laws do not hold at all', () => {
    const empty = explainEmpty(pack, 'кража пылесоса ')!;
    expect(empty.documents).toBe(pack.documents.length);
    expect(empty.words).toEqual([
      { word: 'кража', known: true },
      { word: 'пылесоса', known: false },
    ]);
    // Without the word the laws do not hold, the query finds something.
    expect(empty.tries[0]).toEqual({ query: 'кража', label: 'без «пылесоса»' });
  });

  it('offers a word of the laws close to one they do not hold', () => {
    const empty = explainEmpty(pack, 'кржа ')!;
    expect(empty.words).toEqual([{ word: 'кржа', known: false }]);
    expect(empty.tries.map((t) => t.label)).toContain('кража');
    for (const t of empty.tries) expect(finds(t.query)).toBe(true);
  });

  it('offers every document when the search was narrowed to one', () => {
    const empty = explainEmpty(pack, 'превышение скорости ', { document: 'uk' })!;
    expect(empty.scope?.id).toBe('uk');
    expect(empty.documents).toBe(1);
    expect(empty.tries).toContainEqual({ query: 'превышение скорости', label: 'во всех документах', everywhere: true });
    expect(finds('превышение скорости')).toBe(true);
  });

  it('offers the article whole when the part asked for is not in it', () => {
    const empty = explainEmpty(pack, 'ук 65 ч 9')!;
    expect(empty.number).toBe('65');
    expect(empty.tries).toContainEqual({ query: 'ук 65', label: 'без «ч. 9»' });
  });

  it('offers only what does find something, and three at most', () => {
    for (const query of ['кража пылесоса ', 'кржа ', 'абвгд ', 'ук 999 ']) {
      const empty = explainEmpty(pack, query);
      expect(empty).not.toBeNull();
      expect(empty!.tries.length).toBeLessThanOrEqual(3);
      for (const t of empty!.tries) expect(finds(t.query)).toBe(true);
    }
  });
});
