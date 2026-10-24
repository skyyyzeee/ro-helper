/**
 * Every key of the assistant in one list, as «Клавиши» shows them and the overlay registers them: a key set for two
 * things works for the one first in the list only — the other is told so beside it, and is not registered at all.
 */
export interface KeyUse {
  id: string;
  /** What the key does, as the settings say: «Быстрый поиск». */
  label: string;
  /** Empty when off. */
  hotkey: string;
}

/** «alt+q» and «Alt+Q» are the same keys. */
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** For each key that an earlier one in the list already holds: what holds it, by the later one's id. */
export function clashes(uses: KeyUse[]): Map<string, string> {
  const found = new Map<string, string>();
  uses.forEach((use, i) => {
    if (!use.hotkey) return;
    const first = uses.slice(0, i).find((other) => other.hotkey && same(other.hotkey, use.hotkey));
    if (first) found.set(use.id, first.label);
  });
  return found;
}

/** Whether a key is free of the ones listed: the overlay registers a key only so. */
export const freeOf = (hotkey: string, held: string[]): boolean => !!hotkey && !held.some((other) => other && same(other, hotkey));
