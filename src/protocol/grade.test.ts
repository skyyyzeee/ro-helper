// The exam's own gates, tested: if the checks ever let a made-up norm through as «Подтверждено», the exam must still
// see it; a forbidden article applied, or an AI call where the words decided, fails the case whatever else is right.
import { describe, expect, it } from 'vitest';
import type { SearchHit } from '../core';
import { TVERSKOI_PACK } from '../data';
import type { LegalAnswer } from './answer';
import { classify } from './classify';
import { confirmedHallucinations, gradeCase } from './grade';
import type { Analysis, Outcome } from './pipeline';
import { labelSources } from './sources';
import { validateAnswer } from './validate';

const pack = TVERSKOI_PACK;
const hit = (number: string): SearchHit => {
  const doc = pack.documents.find((d) => d.id === 'uk')!;
  return { document: doc, article: doc.articles.find((a) => a.number === number)! };
};
const sources = labelSources([hit('65'), hit('66')]);
const answer = (patch: Partial<LegalAnswer> = {}): LegalAnswer => ({
  situation: 'Кража.',
  facts: [],
  assumptions: [],
  norms: [{ source: 'S1', ref: 'УК ст. 65', part: '1', why: 'тайное хищение', fit: 'direct', charge: true, stage: 'done' }],
  violation: { text: 'кража', sources: ['S1'] },
  punishment: { text: 'штраф до 50 000 ₽ либо 30 мес', sources: ['S1'] },
  procedure: [],
  uncertainty: [],
  questions: [],
  notFound: false,
  ...patch,
});
const analysisOf = (a: LegalAnswer, forceConfirmed = false): Outcome => {
  const validation = validateAnswer(pack, sources, a, 'law');
  const analysis: Analysis = {
    answer: a,
    sources,
    validation: forceConfirmed ? { ...validation, status: 'confirmed', needsReview: false, issues: [] } : validation,
    calculation: null,
    scope: 'law',
    aiCalls: 2,
    case: { facts: [], assumptions: [], norms: [], conclusion: '' },
  };
  return { kind: 'analysis', analysis, classification: classify(pack, 'украли телефон') };
};

describe('the exam\'s hard gates', () => {
  it('passes an honest, grounded answer', () => {
    expect(gradeCase({ server: 'tverskoi', situation: '…', expect: ['УК 65'] }, analysisOf(answer()))).toMatchObject({ pass: true, hardGates: [], found: 'right' });
  });

  it('sees a made-up figure, a statement with no source, a stray article — even if the checks had let them pass', () => {
    const made = analysisOf(answer({ punishment: { text: 'лишение свободы на 77 месяцев', sources: ['S1'] }, situation: 'Это статья 777.' }), true);
    if (made.kind !== 'analysis') throw new Error('analysis expected');
    expect(confirmedHallucinations(made.analysis).join(' ')).toMatch(/цифры не из источников: 77.*статья не из источников: 777/);
    const unsourced = analysisOf(answer({ violation: { text: 'кража', sources: [] } }), true);
    const graded = gradeCase({ server: 'tverskoi', situation: '…', expect: ['УК 65'] }, unsourced);
    expect(graded.pass).toBe(false);
    expect(graded.hardGates[0]).toMatch(/подтверждённая выдумка: утверждение без источника/);
  });

  it('fails a case whose forbidden article was applied — the player\'s «45», another server\'s «10.2»', () => {
    const graded = gradeCase({ server: 'tverskoi', situation: '…', expect: ['УК 65'], forbid: ['УК 66'] }, analysisOf(answer({ norms: [...answer().norms, { ...answer().norms[0], source: 'S2', ref: 'УК ст. 66', part: undefined }] })));
    expect(graded).toMatchObject({ pass: false, hardGates: ['применена запрещённая статья: УК 66'] });
  });

  it('fails an AI call where the words alone decided, and not where the AI had to be asked', () => {
    const byWords: Outcome = { kind: 'system', reason: 'out_of_scope', text: '', classification: { type: 'out_of_scope', why: 'вопрос не об игре' }, aiCalls: 1 };
    expect(gradeCase({ server: 'tverskoi', situation: '…', behavior: 'system' }, byWords).hardGates).toEqual(['вызов ИИ там, где он не нужен']);
    const asked: Outcome = { ...byWords, classification: { type: 'out_of_scope', why: 'так решил ИИ' } };
    expect(gradeCase({ server: 'tverskoi', situation: '…', behavior: 'system' }, asked)).toMatchObject({ pass: true, hardGates: [] });
  });

  it('wants a question back for an ambiguous case, not a guess', () => {
    expect(gradeCase({ server: 'tverskoi', situation: '…', behavior: 'clarify' }, analysisOf(answer())).pass).toBe(false);
    const asks = analysisOf(answer({ norms: [], questions: [{ question: 'Что он сделал?', options: ['Украл', 'Ударил'] }] }));
    expect(gradeCase({ server: 'tverskoi', situation: '…', behavior: 'clarify' }, asks).pass).toBe(true);
  });
});
