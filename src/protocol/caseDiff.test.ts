import { describe, expect, it } from 'vitest';
import { diffCases } from './caseDiff';
import type { CaseState } from './context';

const state = (patch: Partial<CaseState> = {}): CaseState => ({
  facts: ['украл телефон у прохожего', 'он не сотрудник'],
  assumptions: [],
  norms: ['УК ст. 65 «Кража»'],
  conclusion: 'Это кража.',
  ...patch,
});

describe('«было → стало»: what a change of the case changed, with no AI', () => {
  it('pairs a corrected fact with the one it replaced, and tells the articles, the punishment and the conclusion', () => {
    const diff = diffCases(
      { case: state(), punishment: '30 мес · 3★' },
      {
        case: state({ facts: ['украл телефон у прохожего', 'он сотрудник МВД (изменено)'], norms: ['УК ст. 65 «Кража»', 'УК ст. 84 «Превышение должностных полномочий»'], conclusion: 'Кража сотрудником.' }),
        punishment: '40 мес · 4★',
      },
    );
    expect(diff).toEqual({
      facts: [{ was: 'он не сотрудник', now: 'он сотрудник МВД' }],
      norms: { added: ['УК ст. 84 «Превышение должностных полномочий»'], removed: [] },
      punishment: { was: '30 мес · 3★', now: '40 мес · 4★' },
      conclusion: { was: 'Это кража.', now: 'Кража сотрудником.' },
    });
  });

  it('tells a new fact and a dropped one apart, and an article no longer applying', () => {
    const diff = diffCases({ case: state() }, { case: state({ facts: ['украл телефон у прохожего', 'был в маске', 'ночью'], norms: [] }) });
    expect(diff?.facts).toEqual([{ now: 'был в маске' }, { now: 'ночью' }, { was: 'он не сотрудник' }]);
    expect(diff?.norms.removed).toEqual(['УК ст. 65 «Кража»']);
  });

  it('is nothing when only the wording moved: the same facts, articles and count', () => {
    expect(diffCases({ case: state(), punishment: '30 мес' }, { case: state({ facts: ['Украл телефон у прохожего.', 'он не сотрудник (изменено)'], conclusion: 'Это кража!' }), punishment: '30 мес' })).toBeNull();
  });
});
