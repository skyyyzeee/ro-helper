import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import type { Offender } from './administrative';
import type { Mode } from './calculator';
import { calculateDetention, type Charge } from './detention';

const rules = TVERSKOI_PACK.calculator!;
const doc = (id: string) => TVERSKOI_PACK.documents.find((d) => d.id === id)!;

/** «koap 8.6 ч1», «uk 65 ч1» → a charge from the real Тверской codes, with options. */
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
  it('writes the limit of each fine by default and adds the fines up (КоАП ст. 4.5)', () => {
    const result = admin(['koap 8.6 ч1', 'koap 8.7']);
    expect(result.items.map((r) => [r.choice, r.fine?.amount, r.fine?.fixed])).toEqual([
      ['fine', 10000, false],
      ['fine', 15000, true],
    ]);
    expect(result.fineTotal).toBe(25000);
    expect(result.explanation).toEqual(['Наказание назначается за каждое нарушение и складывается — КоАП ст. 4.5']);
    expect(admin(['koap 8.6 ч1']).explanation).toEqual([]);
  });

  it('checks a typed fine against both ends of the limit, with the least fine of КоАП ст. 3.5 ч. 2', () => {
    const typed = (amount: number, ref = 'koap 8.2 ч2') => admin([charge(ref, { amount })]).items[0].fine!;
    expect(typed(12000)).toMatchObject({ limit: { min: 5000, max: 18000 }, amount: 12000, fits: true });
    expect(typed(20000).fits).toBe(false);
    expect(typed(4000).fits).toBe(false);
    // «до 10 000» still cannot be less than 500.
    expect(typed(300, 'koap 8.6 ч1')).toMatchObject({ limit: { min: 500, max: 10000 }, fits: false });
    expect(admin([charge('koap 8.2 ч2', { amount: 20000 })]).outOfLimits).toHaveLength(1);
  });

  it('keeps each fine within the limit for the offender (КоАП ст. 3.5 ч. 1), not the total', () => {
    const citizen = admin(['koap 9.6 ч1']);
    expect(citizen.items[0].fine!.limit).toEqual({ min: 20000, max: 100000 });
    expect(citizen.explanation).toEqual(['ст. 9.6 ч. 1: гражданину не более 100 000 ₽ — КоАП ст. 3.5']);
    expect(admin(['koap 9.6 ч1'], 'official').items[0].fine!.limit).toEqual({ min: 20000, max: 150000 });
    // Two fines together may be more than one fine may.
    expect(admin(['koap 9.6 ч1', 'koap 9.6 ч2']).fineTotal).toBe(200000);
  });

  it('takes the limits the article sets for the chosen offender', () => {
    expect(admin(['koap 5.4 ч1'], 'citizen').items[0].fine!.limit).toEqual({ min: 10000, max: 25000 });
    expect(admin(['koap 5.4 ч1'], 'official').items[0].fine!.limit).toEqual({ min: 30000, max: 50000 });
    // An untouched amount follows the limit; a typed one stays and is checked again.
    expect(admin(['koap 5.4 ч1'], 'official').items[0].fine!.amount).toBe(50000);
    expect(admin([charge('koap 5.4 ч1', { amount: 20000 })], 'official').items[0].fine).toMatchObject({ amount: 20000, fits: false });
  });

  it('keeps a charge that does not punish the offender, but counts it nowhere', () => {
    const result = admin(['koap 5.5', 'koap 8.6 ч1']);
    expect(result.items.map((r) => [r.applicable, r.choices])).toEqual([
      [false, []],
      [true, ['fine']],
    ]);
    expect(result.fineTotal).toBe(10000);
    expect(result.explanation).toEqual([]);
    expect(admin(['koap 11.8'], 'official').items[0].applicable).toBe(false);
    expect(admin(['koap 5.1 ч2'], 'official').items[0].fine!.limit).toEqual({ min: 50000, max: 120000 });
  });

  it('offers the article’s alternatives, a fine first even where the text puts the arrest first', () => {
    expect(admin(['koap 11.4 ч1']).items[0]).toMatchObject({ choices: ['arrest', 'fine'], choice: 'fine' });
    expect(admin(['koap 8.2 ч1']).items[0]).toMatchObject({ choices: ['warning', 'fine'], choice: 'fine' });
    expect(admin(['koap 8.2 ч3']).items[0]).toMatchObject({ choices: ['license-revocation'], choice: 'license-revocation' });
    expect(admin(['koap 8.17']).items[0]).toMatchObject({ choice: 'evacuation', additional: ['оплата повышенного штрафа по тарифам спецстоянки'] });
  });

  it('adds up the days of arrest, with the bail of КоАП ст. 4.2.1 and the stars of the article', () => {
    const result = admin([charge('koap 5.4 ч1', { choice: 'arrest' }), charge('koap 7.1', { choice: 'arrest', days: 5 })]);
    expect(result.items.map((r) => r.arrest)).toEqual([
      { limit: { max: 20 }, days: 20, fixed: false, fits: true },
      { limit: { max: 10 }, days: 5, fixed: false, fits: true },
    ]);
    expect(result).toMatchObject({ arrestDays: 25, fineTotal: 0, stars: 2 });
    expect(result.bail).toEqual({ days: 25, perDay: 4000, amount: 100000 });
    expect(result.starsFrom?.article.number).toBe('5.4');

    expect(admin([charge('koap 7.1', { choice: 'arrest', days: 12 })]).items[0].arrest!.fits).toBe(false);
    // A fixed term has nothing to type.
    expect(admin([charge('koap 10.1', { choice: 'arrest', days: 3 })]).items[0].arrest).toMatchObject({ days: 15, fixed: true });
    // No arrest, no bail and no stars.
    expect(admin(['koap 5.4 ч1'])).toMatchObject({ bail: null, stars: 0, starsFrom: null });
  });

  it('lists punishments without an amount with their charges', () => {
    const result = admin([charge('koap 8.6 ч3', { choice: 'license-revocation' }), 'koap 8.2 ч3', charge('koap 8.2 ч1', { choice: 'warning' })]);
    expect(result.other).toEqual(['Предупреждение: ст. 8.2 ч. 1', 'Лишение права управления: ст. 8.6 ч. 3, ст. 8.2 ч. 3']);
    expect(result.fineTotal).toBe(0);
  });

  it('doubles an unpaid fine for КоАП 10.2, but not below 3 000', () => {
    const fine = (unpaid?: number) => admin([charge('koap 10.2', { unpaid })]).items[0].fine!;
    expect(fine(5000)).toMatchObject({ amount: 10000, multiplier: 2 });
    expect(fine(1000).amount).toBe(3000);
    expect(fine().amount).toBe(3000);
    expect(fine(80000).amount).toBe(100000); // still one fine of КоАП ст. 3.5
  });
});

describe('detention: both codes together', () => {
  it('calculates each code on its own', () => {
    const result = calc(['uk 65 ч1', 'koap 8.6 ч1']);
    expect(result.criminal).toMatchObject({ term: 30 });
    expect(result.criminal!.items).toHaveLength(1);
    expect(result.administrative).toMatchObject({ fineTotal: 10000 });
    expect(calc(['uk 65 ч1']).administrative).toBeNull();
    expect(calc(['koap 8.6 ч1']).criminal).toBeNull();
  });

  it('sets the most stars of the term and the arrests', () => {
    expect(calc(['uk 65 ч1', charge('koap 5.4 ч1', { choice: 'arrest' })]).stars).toEqual({ count: 3, months: 30, from: 'criminal' });
    expect(calc(['uk 56 ч1', charge('koap 11.8', { choice: 'arrest' })]).stars).toEqual({
      count: 3,
      months: 30,
      from: 'administrative',
      note: 'по ст. 11.8 КоАП (арест)',
    });
    // Only an arrest is served: a fine sets no stars.
    expect(calc([charge('koap 5.4 ч1', { choice: 'arrest' })]).stars).toMatchObject({ count: 2, from: 'administrative' });
    expect(calc(['koap 5.4 ч1']).stars).toBeNull();
    expect(calc(['uk 57'], 'citizen', 'fine').stars).toBeNull();
  });

  it('writes the charges criminal first, in article order, parts and stages included', () => {
    const line = calc([
      'koap 8.12',
      'koap 8.6 ч2',
      charge('uk 88 ч1'),
      charge('uk 65 ч1', { stage: 'attempt' }),
      'koap 8.6 ч1',
      charge('uk 104', { stage: 'preparation' }),
    ]).charge;
    expect(line).toBe('ст. 65 ч. 1 (покушение), 88 ч. 1, 104 (приготовление) УК; ст. 8.6 ч. 1, 8.6 ч. 2, 8.12 ч. 1 КоАП');
  });

  it('keeps absorbed charges in the line and leaves out those that do not punish the offender', () => {
    expect(calc(['uk 65 ч1', 'uk 88 ч1']).charge).toBe('ст. 65 ч. 1, 88 ч. 1 УК');
    expect(calc(['koap 5.5', 'koap 7.1']).charge).toBe('ст. 7.1 КоАП');
    expect(calc(['koap 5.5']).charge).toBe('');
  });
});
