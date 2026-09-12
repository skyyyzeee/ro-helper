import { describe, expect, it } from 'vitest';
import { ARBATSKIY_PACK } from '../data';
import { calculateCriminal, type ChargeItem, type Mode, type Stage } from './calculator';
import { calculateDetention } from './detention';

const rules = ARBATSKIY_PACK.calculator!;
const uk = ARBATSKIY_PACK.documents.find((d) => d.id === 'uk')!;
const koap = ARBATSKIY_PACK.documents.find((d) => d.id === 'koap')!;

/** «6.3», «6.1 ч2» → a charge from the real Арбатский УК. */
function charge(ref: string, stage: Stage = 'done'): ChargeItem {
  const [number, partRef] = ref.split(' ');
  const article = uk.articles.find((a) => a.number === number)!;
  const partNumber = partRef?.replace('ч', '');
  const part = partNumber ? article.parts.find((p) => p.number === partNumber)! : article.parts.find((p) => p.punishment)!;
  return { article, document: uk, part, stage };
}
const calc = (refs: (string | ChargeItem)[], mode: Mode = 'custody', priority?: number) =>
  calculateCriminal(refs.map((ref) => (typeof ref === 'string' ? charge(ref) : ref)), mode, rules, priority);

describe('the Арбатский calculator: the terms add up', () => {
  it('adds the terms of the charges instead of absorbing them (УК ст. 5.10 ч. 1)', () => {
    const result = calc(['6.3', '10.1']);
    expect(result.combine).toBe('sum');
    expect(result.term).toBe(50); // 20 + 30
    expect(result.items.some((r) => r.absorbed)).toBe(false);
    expect(result.explanation[0]).toBe('Наказания складываются: ст. 6.3 + ст. 10.1 — УК ст. 5.10 ч. 1');
  });

  it('caps the total at 50 months (УК ст. 5.10 ч. 3)', () => {
    const result = calc(['6.1 ч1', '6.2']); // 50 + 30
    expect(result).toMatchObject({ term: 50, capped: true });
    expect(result.explanation.at(-1)).toBe('Срок ограничен 50 мес — УК ст. 5.10 ч. 3');
  });

  it('reduces an attempt and a preparation before adding them up (УК ст. 5.14)', () => {
    expect(calc([charge('6.3', 'attempt')]).term).toBe(15); // ¾ of 20
    expect(calc([charge('6.3', 'preparation'), charge('6.3')]).term).toBe(30); // ½ of 20, plus 20
  });

  it('takes bail from the wanted priority the officer sets (УК ст. 5.20 ч. 2)', () => {
    expect(calc(['6.3']).bail).toEqual({ category: 'приоритет розыска 1', amount: 25000 });
    expect(calc(['6.3'], 'custody', 4).bail).toEqual({ category: 'приоритет розыска 4', amount: 100000 });
  });

  it('has no stars: the laws do not tie the wanted level to the term', () => {
    expect(rules.stars).toBeUndefined();
    const result = calculateDetention([{ ...charge('6.3'), choice: undefined }], { mode: 'custody', offender: 'citizen' }, rules);
    expect(result.stars).toBeNull();
    expect(result.criminal?.term).toBe(20);
  });

  it('adds up the fines of both codes and writes the charge line', () => {
    // ст. 6.6 (до 50.000 ₽) and ст. 6.8 (до 60.000 ₽): in a sum the limits add up too.
    const fine = calc(['6.6', '6.8'], 'fine');
    expect(fine.mode).toBe('fine');
    expect(fine.fineLimit).toEqual({ min: undefined, max: 110000 });

    const speeding = koap.articles.find((a) => a.parts.some((p) => p.punishment))!;
    const result = calculateDetention(
      [charge('6.3'), { article: speeding, document: koap, part: speeding.parts.find((p) => p.punishment)!, stage: 'done' }],
      { mode: 'custody', offender: 'citizen' },
      rules,
    );
    expect(result.charge).toBe(`ст. 6.3 УК; ст. ${speeding.number} КоАП`);
    expect(result.administrative?.fineTotal).toBeGreaterThan(0);
  });
});
