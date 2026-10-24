import { describe, expect, it } from 'vitest';
import { TVERSKOI_PACK } from '../data/bundled';
import { rulePunishments } from './AnswerView';

describe('a rule of the project on an answer', () => {
  it('gives a rule’s punishments one by one, as the administration hands them', () => {
    const rules = TVERSKOI_PACK.documents.find((d) => d.id === 'rules-main')!;
    const dm = rules.articles.find((a) => a.number === '5.1')!;
    expect(rulePunishments({ document: rules, article: dm })).toEqual(['Demorgan 120-140 минут', 'Ban 3-30 дней']);
  });
});
