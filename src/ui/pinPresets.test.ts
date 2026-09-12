import { describe, expect, it } from 'vitest';
import type { PinCard, PinGroup } from '../platform/types';
import { CALCULATOR_ID } from './pinLayout';
import { applyPreset, cardCount, deletePreset, nextPresetName, readPresets, savePreset } from './pinPresets';

const card = (id: string): PinCard => ({ id, kind: 'article', heading: id, lines: [] });
const total: PinCard = { id: CALCULATOR_ID, kind: 'calculator', heading: '30 мес', lines: [] };
const block = (id: string, ...cards: PinCard[]): PinGroup => ({ id, x: 10, y: 20, cards });

describe('sets of pinned cards', () => {
  it('saves what is pinned under a name, or the next free one, without the calculator', () => {
    let presets = savePreset([], 'Патруль', [block('a', card('a')), block('t', total)]);
    expect(presets).toEqual([{ id: 'p1', name: 'Патруль', groups: [block('a', card('a'))] }]);
    presets = savePreset(presets, '  ', [block('b', card('b'))]);
    expect(presets.map((p) => p.name)).toEqual(['Патруль', 'Набор 2']);
    expect(nextPresetName(presets)).toBe('Набор 3');
  });

  it('saves over a set of the same name instead of making a second one', () => {
    let presets = savePreset([], 'Патруль', [block('a', card('a'))]);
    presets = savePreset(presets, 'патруль', [block('a', card('a'), card('b'))]);
    expect(presets).toHaveLength(1);
    expect(cardCount(presets[0].groups)).toBe(2);
  });

  it('puts a set in place of what is pinned, leaving the total of the detention under way', () => {
    const [preset] = savePreset([], 'Обыск', [block('a', card('a'))]);
    expect(applyPreset([block('x', card('x'))], preset)).toEqual([block('a', card('a'))]);
    const applied = applyPreset([block('x', card('x'), total)], preset);
    expect(applied.map((g) => g.cards.map((c) => c.id))).toEqual([['a'], [CALCULATOR_ID]]);
  });

  it('never gives the kept total the id of a block of the set', () => {
    const [preset] = savePreset([], 'Обыск', [block(CALCULATOR_ID, card('a'), total)]);
    const applied = applyPreset([block('t', total)], preset);
    expect(new Set(applied.map((g) => g.id)).size).toBe(2);
  });

  it('deletes a set, and reads back only what is one', () => {
    const presets = savePreset(savePreset([], 'А', [block('a', card('a'))]), 'Б', [block('b', card('b'))]);
    expect(deletePreset(presets, 'p1').map((p) => p.name)).toEqual(['Б']);
    expect(readPresets([...presets, { name: 'без id' }, null, 'строка'])).toEqual(presets);
    expect(readPresets(undefined)).toEqual([]);
  });
});
