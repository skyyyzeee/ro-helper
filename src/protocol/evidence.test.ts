import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK as pack } from '../data/bundled';
import { articleText } from '../core';
import { buildContext } from './context';
import { withEvidence, SOURCE_CHARS } from './evidence';
import { labelSources } from './sources';
import { confirmedHallucinations } from './grade';
import { validateAnswer } from './validate';
import type { LegalAnswer } from './answer';

const document = pack.documents.find((d) => d.id === 'uk')!;
const original = document.articles.find((a) => a.number === '87')!;
const source = (text: string) => labelSources([{ document, article: { ...original, parts: [{ number: '1', text, points: [] }], notes: [] } }]);
const answer: LegalAnswer = { situation: 'Кража', facts: [], assumptions: [], norms: [{ source: 'S1', ref: 'УК ст. 87', part: '1', why: 'тайное хищение', fit: 'direct', charge: true, stage: 'done' }], violation: { text: 'кража', sources: ['S1'] }, punishment: null, procedure: [], uncertainty: [], questions: [], notFound: false };

describe('the evidence actually sent to analysis', () => {
  it('shares the exact bounded excerpt with the context and retains the original article for reading', () => {
    const sources = withEvidence(source('Тайное хищение. '.repeat(180) + 'Исключение: 987654.'));
    const context = buildContext({ pack, message: 'кража', sources });
    expect(sources[0].evidence?.text.length).toBe(SOURCE_CHARS);
    expect(context).toContain(sources[0].evidence!.text);
    expect(context).toContain('Источник передан не полностью');
    expect(context).not.toContain('987654');
    expect(articleText(sources[0].hit.article)).toContain('987654');
    const checked = validateAnswer(pack, sources, answer, 'law');
    expect(checked.status).toBe('likely');
    expect(checked.needsReview).toBe(true);
    const forced = { answer, sources, validation: { ...checked, status: 'confirmed' as const }, calculation: null, case: { facts: [], assumptions: [], norms: [], conclusion: '' }, scope: 'law' as const };
    expect(confirmedHallucinations(forced).some((issue) => issue.includes('неполный источник'))).toBe(true);
  });

  it('does not vouch for a number hidden outside the excerpt', () => {
    const sources = withEvidence(source('Тайное хищение. '.repeat(180) + 'Штраф 987654.'));
    const checked = validateAnswer(pack, sources, { ...answer, punishment: { text: 'Штраф 987654', sources: ['S1'] } }, 'law');
    expect(checked.issues.some((issue) => issue.includes('нет цифр 987654'))).toBe(true);
  });

  it('keeps complete evidence confirmed and ignores unrelated incomplete sources', () => {
    const short = withEvidence(source('Тайное хищение чужого имущества.'));
    const long = { ...withEvidence(source('Длинная статья. '.repeat(180)))[0], id: 'S2' };
    expect(short[0].evidence?.complete).toBe(true);
    expect(validateAnswer(pack, [...short, long], answer, 'law').status).toBe('confirmed');
  });

  it('retains validation of old saved sources without evidence metadata', () => {
    const old = source('Тайное хищение. '.repeat(180) + 'Штраф 987654.');
    expect(validateAnswer(pack, old, { ...answer, punishment: { text: 'Штраф 987654', sources: ['S1'] } }, 'law').issues).toEqual([]);
  });
});
