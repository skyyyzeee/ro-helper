import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '../account/AccountContext';
import type { SearchHit } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { AUTO_KEY } from './updates';

/** The top as last asked, per server: for offline and a quick start. */
const popularKey = (server: string) => `popular:${server}`;
/** Asked again after this long. */
const EVERY_MS = 60 * 60_000;
/** So many on the home screen. */
export const POPULAR_SHOWN = 5;

/**
 * «Популярное у игроков» on the home screen (skyze): the articles opened most on the server over the last week, by
 * everyone — the anonymous counts (PRIVACY.md). Asked at most every hour while the automatic checks are on; an article
 * the laws no longer have is left out. Nothing until enough players have opened enough.
 */
export function usePopular(server: string, lookup: (key: string) => SearchHit | undefined): SearchHit[] {
  const platform = usePlatform();
  const { popularArticles } = useAccount();
  const [keys, setKeys] = useState<string[]>([]);
  useEffect(() => {
    let stopped = false;
    void (async () => {
      const kept = await platform.readSetting<{ at: number; keys: string[] }>(popularKey(server));
      if (stopped) return;
      setKeys(kept?.keys ?? []);
      if (kept && Date.now() - kept.at < EVERY_MS) return;
      if ((await platform.readSetting<boolean>(AUTO_KEY)) === false) return;
      try {
        const top = (await popularArticles(server)).map((row) => row.article);
        if (stopped) return;
        setKeys(top);
        await platform.writeSetting(popularKey(server), { at: Date.now(), keys: top });
      } catch {
        // Offline, or the base not ready for it yet: what was asked before stays.
      }
    })();
    return () => {
      stopped = true;
    };
  }, [platform, server, popularArticles]);
  return useMemo(() => keys.flatMap((key) => lookup(key) ?? []).slice(0, POPULAR_SHOWN), [keys, lookup]);
}
