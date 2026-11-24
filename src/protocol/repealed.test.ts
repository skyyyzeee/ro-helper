import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK as pack } from '../data/bundled';
import { packInScope, labelSources } from './sources';
import { sourcesBlock } from './context';
import { groundItems } from './check';
import { validateAnswer, calculateCharges } from './validate';
import { parseAnswer } from './answer';

const document = pack.documents.find((d) => d.id === 'upk')!;
const article = document.articles.find((a) => a.number === '81.4')!;
const legacy = labelSources([{ document, article }]);

describe('repealed laws are not AI authorities', () => {
  it('keeps the repeal notice in the public pack but removes it from every AI scope', () => {
    expect(article.title).toBe('Утратила силу');
    for (const scope of ['law', 'mixed'] as const) {
      const upk = packInScope(pack, scope).documents.find((d) => d.id === 'upk')!;
      for (const number of ['81.1', '81.2', '81.4', '81.5', '82.1']) expect(upk.articles.some((a) => a.number === number)).toBe(false);
      expect(upk.articles.some((a) => a.number === '81')).toBe(true);
    }
  });

  it('does not render an old repealed source into a new model context', () => {
    expect(sourcesBlock(legacy)).not.toContain('81.4');
    const result = groundItems([{ text: 'Основание задержания', sources: ['S1'] }], legacy, 'law')[0];
    expect(result.sources).toEqual([]);
    expect(result.issues).toContain('статья утратила силу');
  });

  it('rejects a repealed norm in a restored or misbehaving answer, even with a real source id', () => {
    const answer = parseAnswer(JSON.stringify({ situation: 'Задержание', norms: [{ source: 'S1', ref: 'УПК ст. 81.4', fit: 'direct', charge: true, why: 'основание' }] }));
    const checked = validateAnswer(pack, legacy, answer, 'law');
    expect(checked.status).not.toBe('confirmed');
    expect(checked.norms[0].hit).toBeUndefined();
    expect(checked.issues.join(' ')).toContain('утратила силу');
    expect(calculateCharges(pack, checked)).toBeNull();
  });
});
