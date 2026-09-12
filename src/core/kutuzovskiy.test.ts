import { describe, expect, it } from 'vitest';
import { KUTUZOVSKIY_PACK } from '../data';
import { calculateCriminal, type ChargeItem, type Mode, type Stage } from './calculator';
import { formatRubles } from './format';
import { calculateDetention } from './detention';

const rules = KUTUZOVSKIY_PACK.calculator!;
const uk = KUTUZOVSKIY_PACK.documents.find((d) => d.id === 'uk')!;

/** «10.3» → a charge from the real Кутузовский УК, where an article carries one punishment. */
function charge(number: string, stage: Stage = 'done'): ChargeItem {
  const article = uk.articles.find((a) => a.number === number)!;
  return { article, document: uk, part: article.parts.find((p) => p.punishment)!, stage };
}
const calc = (numbers: (string | ChargeItem)[], mode: Mode = 'custody') =>
  calculateCriminal(numbers.map((n) => (typeof n === 'string' ? charge(n) : n)), mode, rules);

describe('the Кутузовский calculator', () => {
  it('reads the article: the jurisdiction in the heading, the wanted priority and the term', () => {
    const theft = charge('10.3');
    expect(theft.article.title).toMatch(/^Кража/);
    expect(theft.part.jurisdiction).toEqual(['Ф', 'Р']);
    expect(theft.part.stars).toEqual({ min: 3, max: 3 });
    expect(theft.part.punishment?.alternatives).toEqual([{ kind: 'imprisonment', months: 30 }]);
  });

  it('keeps a criminal record as an addition to the punishment', () => {
    const robbery = charge('10.6');
    expect(robbery.part.punishment?.additional).toContain('запись о судимости');
  });

  it('lets the strictest charge absorb the rest (УК ст. 5.2 ч. 3)', () => {
    const result = calc(['10.1', '10.3']); // 10 and 30 months
    expect(result.combine).toBe('absorption');
    expect(result.term).toBe(30);
    expect(result.explanation[0]).toBe('ст. 10.3 поглощает ст. 10.1 — УК ст. 5.2 ч. 3');
  });

  it('adds ст. 17.3 on top of the strictest punishment (УК ст. 5.2 ч. 4)', () => {
    // ст. 10.1 — 10 месяцев, ст. 17.3 — 30: together 40, under the cap.
    const withInsult = calc(['10.1', '17.3']);
    expect(withInsult.term).toBe(40);
    expect(withInsult.explanation.some((line) => line.includes('добавлена к самому строгому один раз'))).toBe(true);
  });

  it('caps the total at 50 months (УК ст. 5.2 ч. 4)', () => {
    const result = calc(['10.3', '17.3']); // 30 + 30
    expect(result).toMatchObject({ term: 50, capped: true });
    expect(result.explanation.at(-1)).toBe('Срок ограничен 50 мес — УК ст. 5.2 ч. 4');
  });

  it('takes the wanted level from the articles, not from the term (УК ст. 5.7 ч. 4)', () => {
    expect(calc(['10.1']).stars).toBe(1); // приоритет розыска 1, though the term is only 10 months
    expect(calc(['10.1', '10.3']).stars).toBe(3); // the highest priority of the charges
  });

  it('counts bail as 25 000 ₽ for every full year of the term (УК ст. 5.10)', () => {
    const per = formatRubles(25000);
    expect(calc(['10.3']).bail).toEqual({ category: `2 × ${per}`, amount: 50000 }); // 30 мес → 2 года
    expect(calc(['10.1']).bail).toEqual({ category: `0 × ${per}`, amount: 0 }); // 10 мес — меньше года
  });

  it('knows the Следственный комитет among the jurisdictions, and says nothing about a shared one', () => {
    expect(rules.jurisdictionWarnings['С']).toContain('Следственного комитета');
    // ст. 10.3 is Ф/Р: either service may take it, so there is nothing to warn about.
    const result = calculateDetention([charge('10.3')], { mode: 'custody', offender: 'citizen' }, rules);
    expect(result.criminal?.warnings).toEqual([]);
    expect(result.charge).toBe('ст. 10.3 УК');
  });
});
