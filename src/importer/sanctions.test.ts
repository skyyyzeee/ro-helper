import { describe, expect, it } from 'vitest';
import { parseAdministrativeSanction, parseLeadingTags, parsePunishment, splitPenalty } from './sanctions';

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

  it('reads КоАП segments for each subject and reports what it cannot read', () => {
    const { punishment, unparsed } = parseAdministrativeSanction(
      'наложение административного штрафа на граждан в размере до 5.000 рублей; на должностных лиц - от 10.000 до 20.000 рублей или конфискацию орудия.',
    );
    expect(punishment.alternatives).toEqual([
      { kind: 'fine', max: 5000, subject: 'citizen' },
      { kind: 'fine', min: 10000, max: 20000, subject: 'official' },
    ]);
    expect(unparsed).toEqual(['конфискацию орудия']);
  });

  it('takes a suspension of the business for a mandatory add-on (КоАП Тверского 10.5 ч. 2 before 21 September)', () => {
    const { punishment, unparsed } = parseAdministrativeSanction(
      'наложение административного штрафа в размере от 40.000 до 110.000 рублей с административным приостановлением деятельности данного юридического лица на срок до трех месяцев.',
    );
    expect(punishment.alternatives).toEqual([{ kind: 'fine', min: 40000, max: 110000 }]);
    expect(punishment.additional).toEqual(['приостановление деятельности юрлица до 3 мес']);
    expect(unparsed).toEqual([]);
  });

  it('reads «и (или)» between alternatives (КоАП Тверского 9.7 ч. 1 from 6 November)', () => {
    const { punishment, unparsed } = parseAdministrativeSanction(
      'наложение административного штрафа в размере от 10 000 до 30 000 рублей и (или) лишение права управления транспортными средствами.',
    );
    expect(punishment.alternatives).toEqual([{ kind: 'fine', min: 10000, max: 30000 }, { kind: 'license-revocation' }]);
    expect(unparsed).toEqual([]);
  });

  it('takes «и лишение права управления» after each alternative for one add-on (КоАП Тверского 9.7 ч. 3 from 6 November)', () => {
    const { punishment, unparsed } = parseAdministrativeSanction(
      'наложение административного штрафа в размере от 20 000 до 30 000 рублей и лишение права управления транспортными средствами, либо административный арест на срок до 20 суток и лишение права управления транспортными средствами.',
    );
    expect(punishment.alternatives).toEqual([{ kind: 'fine', min: 20000, max: 30000 }, { kind: 'arrest', max: 20 }]);
    expect(punishment.additional).toEqual(['лишение права управления ТС']);
    expect(unparsed).toEqual([]);
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
