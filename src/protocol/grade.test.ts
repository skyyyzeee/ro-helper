// The exam's own gates, tested: if the checks ever let a made-up norm through as «Подтверждено», the exam must still
// see it; a forbidden article applied, or an AI call where the words decided, fails the case whatever else is right.
import { describe, expect, it } from 'vitest';
import type { SearchHit } from '../core';
import { TVERSKOI_PACK } from '../data/bundled';
import type { LegalAnswer } from './answer';
import { classify } from './classify';
import { confirmedHallucinations, gradeCase, gradeOfficerCheck, matchesRef } from './grade';
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

  it('counts a charged norm as the answer to a false claim, though only a severity branch fits directly', () => {
    const branched = analysisOf(answer({ norms: [{ ...answer().norms[0], fit: 'partial' }] }));
    expect(gradeCase({ server: 'tverskoi', situation: '…', category: 'FALSE_CLAIM', expect: ['УК 65'] }, branched)).toMatchObject({ pass: true, found: 'right' });
    expect(gradeCase({ server: 'tverskoi', situation: '…', expect: ['УК 65'] }, branched).found).toBe('partly');
    const forbidden = analysisOf(answer({ norms: [...answer().norms, { ...answer().norms[0], source: 'S2', ref: 'УК ст. 66', fit: 'partial', part: undefined }] }));
    expect(gradeCase({ server: 'tverskoi', situation: '…', category: 'FALSE_CLAIM', expect: ['УК 65'], forbid: ['УК 66'] }, forbidden).hardGates).toEqual(['применена запрещённая статья: УК 66']);
  });

  it('wants a question back for an ambiguous case, not a guess', () => {
    expect(gradeCase({ server: 'tverskoi', situation: '…', behavior: 'clarify' }, analysisOf(answer())).pass).toBe(false);
    const asks = analysisOf(answer({ norms: [], questions: [{ question: 'Что он сделал?', options: ['Украл', 'Ударил'] }] }));
    expect(gradeCase({ server: 'tverskoi', situation: '…', behavior: 'clarify' }, asks).pass).toBe(true);
  });
});

describe('a check of an officer, as the exam weighs it', () => {
  const ids = Object.fromEntries(sources.map((s) => [s.hit.article.number, s.id]));
  const lawyer = { server: 'tverskoi', situation: '…', mode: 'lawyer' as const, expect: ['УК 65'] };

  it('passes when the expected article is what a judged item stands on, with the verdicts wanted', () => {
    const grade = gradeOfficerCheck({ ...lawyer, verdicts: ['lawful'] }, [{ verdict: 'lawful', sources: [ids['65']] }], sources, 1);
    expect(grade.pass).toBe(true);
    expect(grade.found).toBe('right');
  });

  it('an item on no source counts for nothing, and a verdict wanted twice needs two items', () => {
    expect(gradeOfficerCheck(lawyer, [{ verdict: 'unclear', sources: [ids['65']] }], sources, 1).found).toBe('missed');
    const once = [{ verdict: 'unlawful', sources: [ids['65']] }];
    expect(gradeOfficerCheck({ ...lawyer, verdicts: ['unlawful', 'unlawful'] }, once, sources, 1).pass).toBe(false);
  });

  it('a verdict it may not give, or a second AI call, fails it whatever else is right', () => {
    const items = [{ verdict: 'violation', sources: [ids['65']] }];
    expect(gradeOfficerCheck({ ...lawyer, noVerdict: ['violation'] }, items, sources, 1).hardGates).toEqual(['вердикт, которого быть не должно: violation']);
    expect(gradeOfficerCheck(lawyer, items, sources, 2).pass).toBe(false);
  });
});

describe('an expected article, by its label or by its id', () => {
  const ruleOf = (documentId: string, number: string): SearchHit => {
    const doc = pack.documents.find((d) => d.id === documentId)!;
    return { document: doc, article: doc.articles.find((a) => a.number === number)! };
  };

  it('tells apart the rules a label shares: «rules-main-5.1» is DM of the project, not 5.1 of the state factions', () => {
    const dm = ruleOf('rules-main', '5.1');
    const state = ruleOf('rules-gov', '5.1');
    expect(matchesRef('Правила 5.1', [state])).toBe(true);
    expect(matchesRef('rules-main-5.1', [state])).toBe(false);
    expect(matchesRef('rules-main-5.1', [dm])).toBe(true);
    expect(matchesRef('УК 65|rules-main-5.1', [hit('65')])).toBe(true);
  });
});
