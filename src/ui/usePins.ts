import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { PlatformAdapter, PinGroup } from '../platform/types';
import { keepableGroups, restoreGroups, surfaceNow, type Surface } from './pinLayout';

/** What is pinned over the game, per server: blocks of cards where the player put them. */
export const pinsKey = (server: string) => `pins:${server}`;

export interface Pins {
  /** The blocks of cards over the game, each where the player dragged it. */
  groups: PinGroup[];
  setGroups: Dispatch<SetStateAction<PinGroup[]>>;
  /** The screen the cards are laid out on, now: where a new block may go. */
  surface: () => Surface;
}

/**
 * Pinned over the game (roadmap 2А, out of Overlay.tsx): any number of cards, each where the player dragged it, kept
 * per server for the next launch. The saved ones are read for the server in use; while they are, nothing is written
 * back. Every change goes to the pin window and to the settings; what the player does on the cards themselves —
 * moving, joining, closing — comes back from the pin window.
 */
export function usePins(platform: PlatformAdapter, server: string): Pins {
  const [groups, setGroups] = useState<PinGroup[]>([]);
  const [ready, setReady] = useState(false);
  const pins = pinsKey(server);
  const groupsNow = useRef(groups);
  groupsNow.current = groups;
  useEffect(() => {
    let active = true;
    setReady(false);
    // What is on screen now is of the server before; what gets pinned while the saved ones are read is not.
    const before = new Set(groupsNow.current.map((group) => group.id));
    void platform.readSetting<PinGroup[]>(pins).then((saved) => {
      if (!active) return;
      // The calculator's card belongs to a detention that is long over.
      const restored = Array.isArray(saved) ? keepableGroups(restoreGroups(saved)) : [];
      // The quick search can pin the calculator before the saved cards are read: it stays, beside them.
      setGroups((now) => [...restored, ...now.filter((group) => !before.has(group.id) && !restored.some((r) => r.id === group.id))]);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [platform, pins]);
  useEffect(() => {
    if (!ready) return;
    void platform.setPins(groups);
    void platform.writeSetting(pins, keepableGroups(groups));
  }, [ready, groups, platform, pins]);
  // Moving, joining and closing happen on the cards themselves.
  useEffect(() => platform.onPinsChanged(setGroups), [platform]);
  return { groups, setGroups, surface: () => surfaceNow(platform.kind === 'browser') };
}
