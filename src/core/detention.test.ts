import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data/bundled';
import type { Offender } from './administrative';
import type { Mode } from './calculator';
import { calculateDetention, type Charge } from './detention';

const rules = TVERSKOI_PACK.calculator!;
const doc = (id: string) => TVERSKOI_PACK.documents.find((d) => d.id === id)!;

/** «koap 9.8 ч1», «uk 87 ч1» → a charge from the real Тверской codes, with options. */
function charge(ref: string, options: Partial<Omit<Charge, 'article' | 'document' | 'part'>> = {}): Charge {
  const [documentId, number, partRef] = ref.split(' ');
  const document = doc(documentId);
  const article = document.articles.find((a) => a.number === number)!;
  const partNumber = partRef?.replace('ч', '');
  const part = partNumber ? article.parts.find((p) => p.number === partNumber)! : article.parts.find((p) => p.punishment)!;
  return { article, document, part, stage: 'done', ...options };
}
const calc = (charges: (string | Charge)[], offender: Offender = 'citizen', mode: Mode = 'custody') =>
  calculateDetention(
    charges.map((c) => (typeof c === 'string' ? charge(c) : c)),
    { mode, offender },
    rules,
  );
const admin = (...args: Parameters<typeof calc>) => calc(...args).administrative!;

describe('administrative charges (real Тверской КоАП and rules)', () => {
  it('writes the limit of each fine by default and adds the fines up (КоАП ст. 4.6)', () => {
    const result = admin(['koap 9.8 ч1', 'koap 9.9']);
    expect(result.items.map((r) => [r.choice, r.fine?.amount, r.fine?.fixed])).toEqual([
      ['fine', 10000, false],
      ['fine', 15000, true],
    ]);
    expect(result.fineTotal).toBe(25000);
    expect(result.explanation).toEqual(['Наказание назначается за каждое нарушение и складывается — КоАП ст. 4.6']);
    expect(admin(['koap 9.8 ч1']).explanation).toEqual([]);
  });

  it('checks a typed fine against both ends of the limit, with the least fine of КоАП ст. 3.5 ч. 2', () => {
    const typed = (amount: number, ref = 'koap 9.3 ч2') => admin([charge(ref, { amount })]).items[0].fine!;
    expect(typed(12000)).toMatchObject({ limit: { min: 5000, max: 18000 }, amount: 12000, fits: true });
    expect(typed(20000).fits).toBe(false);
    expect(typed(4000).fits).toBe(false);
    // «до 10 000» still cannot be less than 500.
    expect(typed(300, 'koap 9.8 ч1')).toMatchObject({ limit: { min: 500, max: 10000 }, fits: false });
    expect(admin([charge('koap 9.3 ч2', { amount: 20000 })]).outOfLimits).toHaveLength(1);
  });

  it('keeps each fine within the limit for the offender (КоАП ст. 3.5 ч. 1), not the total', () => {
    // КоАП 10.9 ч. 1 no longer goes over the cap since 20 October (its maximum came down to 100 000): ст. 5.5 ч. 3 does.
    const citizen = admin(['koap 5.5 ч3']);
    expect(citizen.items[0].fine!.limit).toEqual({ min: 90000, max: 100000 });
    expect(citizen.explanation).toEqual(['ст. 5.5 ч. 3: гражданину не более 100 000 ₽ — КоАП ст. 3.5']);
    expect(admin(['koap 5.5 ч3'], 'official').items[0].fine!.limit).toEqual({ min: 90000, max: 130000 });
    // Two fines together may be more than one fine may.
    expect(admin(['koap 5.5 ч3', 'koap 10.9 ч1']).fineTotal).toBe(200000);
  });

  it('takes the limits the article sets for the chosen offender', () => {
    expect(admin(['koap 5.5 ч1'], 'citizen').items[0].fine!.limit).toEqual({ min: 10000, max: 25000 });
    expect(admin(['koap 5.5 ч1'], 'official').items[0].fine!.limit).toEqual({ min: 30000, max: 50000 });
    // An untouched amount follows the limit; a typed one stays and is checked again.
    expect(admin(['koap 5.5 ч1'], 'official').items[0].fine!.amount).toBe(50000);
    expect(admin([charge('koap 5.5 ч1', { amount: 20000 })], 'official').items[0].fine).toMatchObject({ amount: 20000, fits: false });
  });

  it('keeps a charge that does not punish the offender, but counts it nowhere', () => {
    const result = admin(['koap 10.3 ч2', 'koap 9.8 ч1']);
    expect(result.items.map((r) => [r.applicable, r.choices])).toEqual([
      [false, []],
      [true, ['fine']],
    ]);
    expect(result.fineTotal).toBe(10000);
    expect(result.explanation).toEqual([]);
    expect(admin(['koap 10.3 ч2'], 'official').items[0].applicable).toBe(false);
    expect(admin(['koap 5.1 ч2'], 'official').items[0].fine!.limit).toEqual({ min: 50000, max: 120000 });
  });

  it('offers the article’s alternatives, a fine first even where the text puts the arrest first', () => {
    expect(admin(['koap 12.5 ч1']).items[0]).toMatchObject({ choices: ['arrest', 'fine'], choice: 'fine' });
    expect(admin(['koap 9.3 ч1']).items[0]).toMatchObject({ choices: ['warning', 'fine'], choice: 'fine' });
    expect(admin(['koap 9.3 ч3']).items[0]).toMatchObject({ choices: ['license-revocation'], choice: 'license-revocation' });
    // «штраф … и лишение …, либо арест … и лишение …»: the revocation goes with either.
    expect(admin(['koap 9.7 ч3']).items[0]).toMatchObject({ choices: ['fine', 'arrest'], choice: 'fine', additional: ['лишение права управления ТС'] });
  });

  it('adds up the days of arrest, with the bail of КоАП ст. 4.3 and the stars of the article', () => {
    const result = admin([charge('koap 5.5 ч1', { choice: 'arrest' }), charge('koap 7.2', { choice: 'arrest', days: 5 })]);
    expect(result.items.map((r) => r.arrest)).toEqual([
      { limit: { max: 20 }, days: 20, fixed: false, fits: true },
      { limit: { max: 10 }, days: 5, fixed: false, fits: true },
    ]);
    expect(result).toMatchObject({ arrestDays: 25, fineTotal: 0, stars: 2 });
    expect(result.bail).toEqual({ days: 25, perDay: 4000, amount: 100000 });
    expect(result.starsFrom?.article.number).toBe('5.5');

    expect(admin([charge('koap 7.2', { choice: 'arrest', days: 12 })]).items[0].arrest!.fits).toBe(false);
    // No arrest, no bail and no stars.
    expect(admin(['koap 5.5 ч1'])).toMatchObject({ bail: null, stars: 0, starsFrom: null });
  });

  it('lists punishments without an amount with their charges', () => {
    const result = admin([charge('koap 9.8 ч3', { choice: 'license-revocation' }), 'koap 9.3 ч3', charge('koap 9.3 ч1', { choice: 'warning' })]);
    expect(result.other).toEqual(['Предупреждение: ст. 9.3 ч. 1', 'Лишение права управления: ст. 9.8 ч. 3, ст. 9.3 ч. 3']);
    expect(result.fineTotal).toBe(0);
  });

  it('has no unpaid-fine multiple in the КоАП: the multiple lives in УК ст. 155', () => {
    const koap = doc('koap');
    expect(koap.articles.flatMap((a) => a.parts).some((p) => p.punishment?.alternatives.some((alt) => alt.kind === 'fine-multiple'))).toBe(false);
    expect(doc('uk').articles.find((a) => a.number === '155')!.parts[0].punishment?.alternatives).toContainEqual({ kind: 'fine-multiple', multiplier: 2, min: 3000 });
  });
});

describe('detention: both codes together', () => {
  it('calculates each code on its own', () => {
    const result = calc(['uk 87 ч1', 'koap 9.8 ч1']);
    expect(result.criminal).toMatchObject({ term: 30 });
    expect(result.criminal!.items).toHaveLength(1);
    expect(result.administrative).toMatchObject({ fineTotal: 10000 });
    expect(calc(['uk 87 ч1']).administrative).toBeNull();
    expect(calc(['koap 9.8 ч1']).criminal).toBeNull();
  });

  it('sets the most stars of the term and the arrests', () => {
    expect(calc(['uk 87 ч1', charge('koap 5.5 ч1', { choice: 'arrest' })]).stars).toEqual({ count: 3, months: 30, from: 'criminal' });
    // With the most an arrest gives being two stars, a tie keeps the criminal term.
    expect(calc(['uk 81 ч1', charge('koap 5.5 ч1', { choice: 'arrest' })]).stars).toEqual({ count: 2, months: 20, from: 'criminal' });
    // Only an arrest is served: a fine sets no stars.
    expect(calc([charge('koap 5.5 ч1', { choice: 'arrest' })]).stars).toMatchObject({ count: 2, from: 'administrative' });
    expect(calc(['koap 5.5 ч1']).stars).toBeNull();
    expect(calc(['uk 76'], 'citizen', 'fine').stars).toBeNull();
  });

  it('writes the charges criminal first, in article order, parts and stages included', () => {
    const line = calc([
      'koap 9.18',
      'koap 9.8 ч2',
      charge('uk 136 ч1'),
      charge('uk 87 ч1', { stage: 'attempt' }),
      'koap 9.8 ч1',
      charge('uk 159', { stage: 'preparation' }),
    ]).charge;
    expect(line).toBe('ст. 87 ч. 1 (покушение), 136 ч. 1, 159 (приготовление) УК; ст. 9.8 ч. 1, 9.8 ч. 2, 9.18 ч. 1 КоАП');
  });

  it('keeps absorbed charges in the line and leaves out those that do not punish the offender', () => {
    expect(calc(['uk 87 ч1', 'uk 136 ч1']).charge).toBe('ст. 87 ч. 1, 136 ч. 1 УК');
    expect(calc(['koap 10.3 ч2', 'koap 7.2']).charge).toBe('ст. 7.2 КоАП');
    expect(calc(['koap 10.3 ч2']).charge).toBe('');
  });
});
