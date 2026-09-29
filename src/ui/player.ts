import { useCallback, useEffect, useState } from 'react';
import type { PlatformAdapter } from '../platform/types';

/** What the player adds to their card, if they want (Q15): the name they play under and their position. */
export interface PlayerCard {
  gameName?: string;
  position?: string;
}

/** Settings key; synced with the account. */
export const PLAYER_KEY = 'player';
export const GAME_NAME_MAX = 40;
export const POSITION_MAX = 60;

/** The card as it is kept: trimmed, cut to size, without the fields left empty. */
export function tidyCard(card: PlayerCard): PlayerCard {
  const gameName = card.gameName?.trim().slice(0, GAME_NAME_MAX);
  const position = card.position?.trim().slice(0, POSITION_MAX);
  return { ...(gameName ? { gameName } : {}), ...(position ? { position } : {}) };
}

export function usePlayerCard(platform: Pick<PlatformAdapter, 'readSetting' | 'writeSetting'>): [PlayerCard, (next: PlayerCard) => void] {
  const [card, setCard] = useState<PlayerCard>({});
  useEffect(() => {
    let active = true;
    void platform.readSetting<PlayerCard>(PLAYER_KEY).then((saved) => {
      if (active && saved) setCard(tidyCard(saved));
    });
    return () => {
      active = false;
    };
  }, [platform]);
  const save = useCallback(
    (next: PlayerCard) => {
      const tidy = tidyCard(next);
      setCard(tidy);
      void platform.writeSetting(PLAYER_KEY, tidy);
    },
    [platform],
  );
  return [card, save];
}
