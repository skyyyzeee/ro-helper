import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { penalParts, type Article, type Part, type SearchHit, type ServerPack } from '../core';
import type { PlatformAdapter } from '../platform/types';

/** The most recent articles kept. */
export const RECENT_LIMIT = 20;

/** Settings keys: each server keeps its own lists. */
export const favoritesKey = (server: string) => `favorites:${server}`;
export const recentKey = (server: string) => `recent:${server}`;

/**
 * What the calculator, the favourites and the recent list hold for an article and a part of it:
 * one of several punished parts, or the article as a whole when it has at most one.
 */
export function entryPart(article: Article, part?: Part): Part | undefined {
  const punished = penalParts(article);
  if (punished.length <= 1) return undefined;
  return part?.punishment ? part : punished[0];
}

/** Stable key of a hit, the same however the article was found: `uk-65#1`, `uk-104#`. */
export const hitKey = (hit: SearchHit) => `${hit.article.id}#${entryPart(hit.article, hit.part)?.number ?? ''}`;

/** A hit for what a key stands for, or undefined when the pack no longer has it. */
export function useHitLookup(pack: ServerPack): (key: string) => SearchHit | undefined {
  const articles = useMemo(() => {
    const byId = new Map<string, Omit<SearchHit, 'part'>>();
    for (const document of pack.documents) for (const article of document.articles) byId.set(article.id, { article, document });
    return byId;
  }, [pack]);
  return useCallback(
    (key: string) => {
      const [id, number] = key.split('#');
      const found = articles.get(id);
      if (!found) return undefined;
      if (!number) return entryPart(found.article) ? undefined : found;
      const part = found.article.parts.find((p) => p.number === number);
      return part?.punishment && entryPart(found.article, part) === part ? { ...found, part } : undefined;
    },
    [articles],
  );
}

/** A list of keys kept in the settings: loaded once, saved on every change. */
export function useStoredKeys(platform: PlatformAdapter, settingKey: string): [string[], (update: (list: string[]) => string[]) => void] {
  const [list, setList] = useState<string[]>([]);
  const current = useRef<string[]>([]);
  const touched = useRef(false);

  useEffect(() => {
    touched.current = false;
    let active = true;
    void platform.readSetting<string[]>(settingKey).then((saved) => {
      if (!active || touched.current || !Array.isArray(saved)) return;
      current.current = saved;
      setList(saved);
    });
    return () => {
      active = false;
    };
  }, [platform, settingKey]);

  const update = useCallback(
    (change: (list: string[]) => string[]) => {
      touched.current = true;
      const next = change(current.current);
      current.current = next;
      setList(next);
      void platform.writeSetting(settingKey, next);
    },
    [platform, settingKey],
  );
  return [list, update];
}
