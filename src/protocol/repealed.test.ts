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

  it('does not silently repair an explicit repealed reference to a different active source', () => {
    const active = document.articles.find((a) => a.number === '52')!;
    const given = labelSources([{ document, article: active }]);
    const answer = parseAnswer(JSON.stringify({ situation: 'Задержание', norms: [{ source: 'S1', ref: 'УПК ст. 81.4', fit: 'direct', why: 'порядок задержания' }] }));
    expect(validateAnswer(pack, given, answer, 'law').norms[0].issues.join(' ')).toContain('утратила силу');
  });

  it('rejects a repealed norm in a restored or misbehaving answer, even with a real source id', () => {
    const answer = parseAnswer(JSON.stringify({ situation: 'Задержание', norms: [{ source: 'S1', ref: 'УПК ст. 81.4', fit: 'direct', charge: true, why: 'основание' }] }));
    const checked = validateAnswer(pack, legacy, answer, 'law');
    expect(checked.status).not.toBe('confirmed');
    expect(checked.norms[0].hit).toBeUndefined();
    expect(checked.issues.join(' ')).toContain('утратила силу');
    expect(calculateCharges(pack, checked)).toBeNull();
  });
  it('excludes the newly repealed KoAP articles and part while retaining active parts', () => {
    const original = pack.documents.find((d) => d.id === 'koap')!;
    const scoped = packInScope(pack, 'law').documents.find((d) => d.id === 'koap')!;
    for (const number of ['9.23', '10.1', '10.4']) {
      expect(original.articles.find((a) => a.number === number)?.title).toBe('Утратила силу');
      expect(scoped.articles.some((a) => a.number === number)).toBe(false);
    }
    const whole = original.articles.find((a) => a.number === '12.5')!;
    expect(scoped.articles.find((a) => a.number === '12.5')?.parts.map((p) => p.number)).toEqual(['1', '2']);
    expect(whole.parts.map((p) => p.number)).toEqual(['1', '2', '3']);
    const given = labelSources([{ document: original, article: whole }]);
    const answer = parseAnswer(JSON.stringify({ situation: 'Документы', norms: [{ source: 'S1', ref: 'КоАП ст. 12.5', part: '1, 3', charge: true, fit: 'direct', why: 'отказ предъявить документы' }] }));
    const checked = validateAnswer(pack, given, answer, 'law');
    expect(checked.norms[0].hit).toBeUndefined();
    expect(checked.issues.join(' ')).toContain('утратила силу');
    expect(calculateCharges(pack, checked)).toBeNull();
    const legacyPart = labelSources([{ document: original, article: whole, part: whole.parts[2] }]);
    expect(sourcesBlock(legacyPart)).not.toContain('12.5');
    expect(groundItems([{ text: 'Основание', sources: ['S1'] }], legacyPart, 'law')[0].sources).toEqual([]);
  });

  it('rejects claims that cite a repealed source without listing a norm', () => {
    const answer = parseAnswer(JSON.stringify({ situation: 'Задержание', norms: [], verdict: { answer: 'yes', text: 'Задержание законно', sources: ['S1'] } }));
    const checked = validateAnswer(pack, legacy, answer, 'law');
    expect(checked.status).not.toBe('confirmed');
    expect(checked.issues.join(' ')).toContain('утратил силу');
  });

});
