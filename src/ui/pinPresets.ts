import type { PinGroup } from '../platform/types';
import { CALCULATOR_ID, hasCard, keepableGroups, restoreGroups } from './pinLayout';

/** A set of pinned cards saved under a name — «Патруль», «Обыск» — to put back over the game at once. */
export interface PinPreset {
  id: string;
  name: string;
  groups: PinGroup[];
}

/** Settings key: each server keeps its own sets, its articles being its own. */
export const presetsKey = (server: string) => `pin-presets:${server}`;

export const cardCount = (groups: PinGroup[]): number => groups.reduce((n, group) => n + group.cards.length, 0);

/** «Набор 1», «Набор 2»: the first number no set is called by yet. */
export function nextPresetName(presets: PinPreset[]): string {
  for (let n = presets.length + 1; ; n++) {
    const name = `Набор ${n}`;
    if (!presets.some((preset) => preset.name === name)) return name;
  }
}

/**
 * Saves what is pinned now as a set, without the calculator's total — that belongs to one detention.
 * A name already taken is saved over, so the same set can be corrected.
 */
export function savePreset(presets: PinPreset[], name: string, groups: PinGroup[]): PinPreset[] {
  const title = name.trim() || nextPresetName(presets);
  const kept = keepableGroups(groups);
  const same = presets.find((preset) => preset.name.toLowerCase() === title.toLowerCase());
  if (same) return presets.map((preset) => (preset === same ? { ...preset, groups: kept } : preset));
  let n = presets.length + 1;
  while (presets.some((preset) => preset.id === `p${n}`)) n++;
  return [...presets, { id: `p${n}`, name: title, groups: kept }];
}

export const deletePreset = (presets: PinPreset[], id: string): PinPreset[] => presets.filter((preset) => preset.id !== id);

/**
 * Puts a set over the game in place of what is pinned. A calculator's total pinned for the detention under
 * way stays where it is.
 */
export function applyPreset(current: PinGroup[], preset: PinPreset): PinGroup[] {
  const total = current.find((group) => hasCard([group], CALCULATOR_ID));
  const card = total?.cards.find((c) => c.id === CALCULATOR_ID);
  const cards = restoreGroups(preset.groups);
  if (!total || !card) return cards;
  // A block of the set may still carry the id of a total it once held.
  const id = cards.some((group) => group.id === CALCULATOR_ID) ? `${CALCULATOR_ID}~now` : CALCULATOR_ID;
  return [...cards, { id, x: total.x, y: total.y, cards: [card] }];
}

/** Sets read back from the settings: anything that is not one is dropped. */
export function readPresets(saved: unknown): PinPreset[] {
  if (!Array.isArray(saved)) return [];
  return saved.filter(
    (preset): preset is PinPreset => !!preset && typeof preset.id === 'string' && typeof preset.name === 'string' && Array.isArray(preset.groups),
  );
}
