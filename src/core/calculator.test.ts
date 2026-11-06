import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data/bundled';
import { calculateCriminal, crimeCategory, fineFits, type ChargeItem, type Mode, type Stage } from './calculator';
import type { CalculatorRules } from './model';

const rules = TVERSKOI_PACK.calculator!;
const uk = TVERSKOI_PACK.documents.find((d) => d.id === 'uk')!;

/** «87», «87 ч2», «136 ч1 attempt» → a charge from the real УК. */
function charge(ref: string, stage: Stage = 'done', wantedLevel?: number): ChargeItem {
  const [number, partRef] = ref.split(' ');
  const article = uk.articles.find((a) => a.number === number)!;
  const partNumber = partRef?.replace('ч', '');
  const part = partNumber ? article.parts.find((p) => p.number === partNumber)! : article.parts.find((p) => p.punishment)!;
  return { article, document: uk, part, stage, wantedLevel };
}
const calc = (refs: (string | ChargeItem)[], mode: Mode = 'custody', r: CalculatorRules = rules) =>
  calculateCriminal(refs.map((ref) => (typeof ref === 'string' ? charge(ref) : ref)), mode, r);

describe('criminal calculator (real Тверской УК and rules)', () => {
  it('gives one charge its own term, stars and bail', () => {
    const result = calc(['87 ч1']);
    expect(result).toMatchObject({ mode: 'custody', term: 30, stars: 3, starsMonths: 30, capped: false });
    expect(result.bail).toEqual({ category: 'средней тяжести', amount: 75000 });
    expect(result.explanation).toEqual([]);
  });

  it('lets the strictest charge absorb the rest (УК ст. 59 ч. 2)', () => {
    const result = calc(['87 ч1', '136 ч1']);
    expect(result.term).toBe(40);
    expect(result.items.map((r) => r.absorbed)).toEqual([true, false]);
    expect(result.explanation).toEqual(['ст. 136 ч. 1 поглощает ст. 87 ч. 1 — УК ст. 59 ч. 2']);
    // Grave crime: no bail.
    expect(result.bail).toEqual({ category: 'тяжкое', amount: null });
  });

  it('adds ст. 159 once on top of the strictest punishment (УК ст. 59 ч. 4)', () => {
    const result = calc(['87 ч1', '159']);
    expect(result.term).toBe(60);
    expect(result.items.map((r) => [r.absorbed, r.stacked])).toEqual([[false, false], [false, true]]);
    expect(result.explanation[0]).toBe('ст. 159 добавлена к самому строгому один раз — УК ст. 59 ч. 4; её можно и поглотить — УК ст. 59 ч. 2');
    // 60 months is more than five stars can stand for.
    expect(result).toMatchObject({ stars: 5, starsMonths: 50 });

    expect(calc(['159']).term).toBe(30); // alone it is just the strictest charge
    expect(calc(['81 ч1', '159', '87 ч1']).explanation[0]).toBe('ст. 87 ч. 1 поглощает ст. 81 — УК ст. 59 ч. 2');
  });

  it('reduces an attempt to ¾ and a preparation to ½, rounding down (УК ст. 56)', () => {
    const attempt = calc([charge('87 ч1', 'attempt')]);
    expect(attempt).toMatchObject({ term: 22, stars: 2, starsMonths: 20 });
    expect(attempt.explanation).toEqual(['ст. 87 ч. 1: покушение — не более ¾ наказания, УК ст. 56 ч. 3']);
    expect(calc([charge('87 ч1', 'preparation')]).term).toBe(15);
    // The category (and so the bail) follows the article, not the reduced term.
    expect(attempt.bail).toEqual({ category: 'средней тяжести', amount: 75000 });
    expect(calc([charge('87 ч1', 'attempt')], 'fine').fineLimit).toEqual({ max: 37500 });
  });

  it('caps the total term (УК ст. 49 ч. 3), with the cap taken from the rules', () => {
    // With the real 100-month cap, 50 + 30 never reaches it; a lower cap shows the rule works.
    expect(calc(['70 ч1', '159']).capped).toBe(false);
    const result = calc(['70 ч1', '159'], 'custody', { ...rules, maxTotalMonths: { value: 70, basis: 'УК ст. 49 ч. 3' } });
    expect(result).toMatchObject({ term: 70, capped: true });
    expect(result.explanation.at(-1)).toBe('Срок ограничен 70 мес — УК ст. 49 ч. 3');
  });

  it('turns months into stars by the rules (1 ★ = 10 мес)', () => {
    expect(calc(['81 ч1'])).toMatchObject({ term: 20, stars: 2 });
    expect(calc(['70 ч1'])).toMatchObject({ term: 50, stars: 5 });
    const tenStars = { ...rules, stars: { ...rules.stars!, monthsPerStar: 5, max: 10 } };
    expect(calc(['81 ч1'], 'custody', tenStars)).toMatchObject({ stars: 4, starsMonths: 20 });
  });

  it('takes the term of ст. 153 from the wanted level', () => {
    expect(calc([charge('153', 'done', 2)]).term).toBe(20);
    expect(calc(['153']).term).toBe(50); // the part's highest level when none is chosen
  });

  it('sets the fine limit by the strictest fine, with ст. 159 added on top', () => {
    expect(calc(['87 ч1', '76'], 'fine')).toMatchObject({ mode: 'fine', fineLimit: { min: 25000, max: 100000 } });
    expect(calc(['87 ч1', '76', '159'], 'fine').fineLimit).toEqual({ min: 25000, max: 140000 });
    expect(fineFits(30000, { min: 25000, max: 100000 })).toBe(true);
    expect(fineFits(20000, { min: 25000, max: 100000 })).toBe(false);
    expect(fineFits(120000, { min: 25000, max: 100000 })).toBe(false);
  });

  it('refuses a fine when a charge has none, and custody when none has a term', () => {
    const noFine = calc(['87 ч1', '136 ч2'], 'fine');
    expect(noFine.mode).toBe('custody');
    expect(noFine.fineUnavailable.map((r) => r.item.article.number)).toEqual(['136']);

    const fineOnly = charge('81 ч1');
    const noTerm = calc([{ ...fineOnly, part: { ...fineOnly.part, punishment: { alternatives: [{ kind: 'fine', min: 20000, max: 100000 }], additional: [] } } }], 'custody');
    expect(noTerm.mode).toBe('fine');
    expect(noTerm.fineLimit).toEqual({ min: 20000, max: 100000 });
  });

  it('warns about federal and military jurisdiction, not about shared jurisdiction', () => {
    expect(calc(['124 ч1', '87 ч1']).warnings).toEqual(['ст. 124 — федеральная подследственность — дело ФСБ']);
    expect(calc(['164']).warnings).toEqual(['ст. 164 — военная подследственность — дело военной полиции']);
    expect(calc(['87 ч1']).warnings).toEqual([]);
  });

  it('knows the crime categories of УК ст. 13 from the articles’ terms', () => {
    const name = (ref: string) => crimeCategory(charge(ref), rules).label;
    expect(['81 ч1', '87 ч1', '87 ч2', '70 ч1'].map(name)).toEqual(['небольшой тяжести', 'средней тяжести', 'тяжкое', 'особо тяжкое']);
    expect(calc(['81 ч1']).bail).toEqual({ category: 'небольшой тяжести', amount: 50000 });
  });
});
