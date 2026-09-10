import { describe, expect, it } from 'vitest';
import { parseLeadingTags, parsePunishment, splitPenalty } from './sanctions';

describe('sanction parsing', () => {
  it('reports an alternative it cannot read instead of dropping it', () => {
    const { punishment, unparsed } = parsePunishment('штрафом в размере до 10.000 рублей либо исправительными работами на срок 6 месяцев');
    expect(punishment.alternatives).toEqual([{ kind: 'fine', max: 10000 }]);
    expect(unparsed).toEqual(['исправительными работами на срок 6 месяцев']);
  });

  it('reports trailing text after a known sanction', () => {
    const { unparsed } = parsePunishment('лишением свободы на срок 30 месяцев условно');
    expect(unparsed).toEqual(['лишением свободы на срок 30 месяцев условно']);
  });

  it('reads tags in any order, with an explicit part number', () => {
    expect(parseLeadingTags('[В] 1. [★★] Текст')).toEqual({ jurisdiction: ['В'], number: '1', stars: { min: 2, max: 2 }, rest: 'Текст' });
    expect(parseLeadingTags('[Р/Ф/В] [★★★] Текст')).toMatchObject({ jurisdiction: ['Р', 'Ф', 'В'], stars: { min: 3, max: 3 } });
  });

  it('splits offence from sanction with or without «наказывается»', () => {
    expect(splitPenalty('Деяние, — наказывается штрафом в размере 5.000 рублей.')).toEqual({
      offence: 'Деяние',
      clause: 'штрафом в размере 5.000 рублей.',
    });
    expect(splitPenalty('Деяние, — лишением свободы на срок 40 месяцев.').clause).toBe('лишением свободы на срок 40 месяцев.');
    expect(splitPenalty('Просто текст').clause).toBeNull();
  });
});
