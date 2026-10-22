import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data/bundled';
import { parseAnswer } from './answer';
import { analysisPrompt } from './prompt';
import { validateAnswer } from './validate';
import { isClosedQuestion } from './verdict';
import { labelSources } from './sources';

describe('a question answered yes or no', () => {
  it('is told by a modal word and «ли»', () => {
    for (const q of [
      'Обязан ли сотрудник гибдд представиться до требования выйти из машины?',
      'можно ли стрелять в зелёной зоне',
      'Имеет ли право полицейский обыскать машину без понятых',
      'законно ли меня задержали без объяснения причин',
      'должен ли я отдавать документы',
      'Вправе ли сотрудник надеть наручники?',
    ])
      expect(isClosedQuestion(q), q).toBe(true);
    for (const q of ['что будет за кражу', 'у меня украли телефон', 'сколько штраф за парковку', 'когда ли он придёт', 'обязанности сотрудника гибдд'])
      expect(isClosedQuestion(q), q).toBe(false);
  });

  it('asks the model for the verdict first, only then', () => {
    const pack = TVERSKOI_PACK;
    expect(analysisPrompt(pack, 'quick', 'law', undefined, true)).toMatch(/"situation"[^\n]*\n\s*"verdict"/);
    expect(analysisPrompt(pack, 'quick', 'law', undefined, true)).toContain('ВОПРОС ЗАКРЫТЫЙ');
    expect(analysisPrompt(pack, 'quick', 'law')).not.toContain('"verdict"');
  });

  it('shows «да» or «нет» only where the verdict stands on its sources', () => {
    const pack = TVERSKOI_PACK;
    const uk = pack.documents.find((d) => d.id === 'uk')!;
    const sources = labelSources([{ document: uk, article: uk.articles.find((a) => a.number === '65')! }]);
    const theft = { id: sources[0].id, ref: 'УК ст. 65' };
    const base = {
      situation: 'Это кража.',
      facts: [],
      assumptions: [],
      norms: [{ source: theft.id, ref: theft.ref, part: '1', why: 'тайное хищение', fit: 'direct', charge: true, stage: 'done' }],
      violation: { text: 'кража', sources: [theft.id] },
      punishment: null,
      procedure: [],
      uncertainty: [],
      questions: [],
      notFound: false,
    };
    const of = (verdict: unknown) => validateAnswer(pack, sources, parseAnswer(JSON.stringify({ ...base, verdict }))).verdict;
    expect(of({ answer: 'yes', text: 'Да, это кража.', sources: [theft.id] })).toBe('yes');
    expect(parseAnswer(JSON.stringify({ ...base, verdict: { answer: 'yes', text: 'Да, это кража.', sources: [theft.id] } })).verdict?.text).toBe('это кража.');
    // No source, a source never given, or a word other than the three: no «да» shown.
    expect(of({ answer: 'yes', text: 'это кража', sources: [] })).toBe('clarify');
    expect(of({ answer: 'no', text: 'не кража', sources: ['S99'] })).toBe('clarify');
    expect(of({ answer: 'maybe', text: 'может быть', sources: [theft.id] })).toBeUndefined();
  });
});
