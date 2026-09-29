import { useCallback, useEffect, useRef } from 'react';
import { USAGE_PENDING_KEY, USAGE_SHARE_KEY } from '../account/usage';
import type { PlatformAdapter } from '../platform/types';

/** What the player did in the helper: seen in their profile only (Q8). */
export interface Stats {
  /** Articles opened. */
  opened: number;
  /** Searches: a query typed into an empty field. */
  searches: number;
  /** Punishments worked out: the calculator started with a first article. */
  calculations: number;
  /** How often each article was opened or put into the calculator, by its key (`uk-65#1`). */
  articles: Record<string, number>;
}

export type StatEvent = { kind: 'open'; article: string } | { kind: 'charge'; article: string } | { kind: 'search' } | { kind: 'calculation' };

/** This computer, told from the player's others: its counts are its own, so two computers never undo each other's. */
export const DEVICE_KEY = 'device.id';
/** The computers the player's counts come from; synced. */
export const DEVICES_KEY = 'stats.devices';
export const statsKey = (device: string) => `stats:${device}`;

export const EMPTY_STATS: Stats = { opened: 0, searches: 0, calculations: 0, articles: {} };

type Settings = Pick<PlatformAdapter, 'readSetting' | 'writeSetting'>;

/** This computer's id, made the first time. */
async function deviceId(platform: Settings): Promise<string> {
  const saved = await platform.readSetting<string>(DEVICE_KEY);
  if (saved) return saved;
  const made = crypto.randomUUID();
  await platform.writeSetting(DEVICE_KEY, made);
  return made;
}

/** The player's counts from all their computers together. */
export async function totalStats(platform: Settings): Promise<Stats> {
  const devices = (await platform.readSetting<string[]>(DEVICES_KEY)) ?? [];
  const total: Stats = { ...EMPTY_STATS, articles: {} };
  for (const device of devices) {
    const stats = await platform.readSetting<Stats>(statsKey(device));
    if (!stats) continue;
    total.opened += stats.opened ?? 0;
    total.searches += stats.searches ?? 0;
    total.calculations += stats.calculations ?? 0;
    for (const [article, n] of Object.entries(stats.articles ?? {})) total.articles[article] = (total.articles[article] ?? 0) + n;
  }
  return total;
}

/** The articles most used, most first. */
export const topArticles = (stats: Stats, count: number) =>
  Object.entries(stats.articles)
    .sort(([, a], [, b]) => b - a)
    .slice(0, count);

/** The day in the player's time zone, for the author's counts. */
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/**
 * Counts what the player does: into this computer's stats, and — unless turned off — into the anonymous
 * counts of the day for the author (the event and the server, nothing of the player or of the articles).
 */
export function useStats(platform: Settings, server: string): (event: StatEvent) => void {
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const device = useRef<Promise<string> | null>(null);

  useEffect(() => {
    device.current = deviceId(platform).then(async (id) => {
      const devices = (await platform.readSetting<string[]>(DEVICES_KEY)) ?? [];
      if (!devices.includes(id)) await platform.writeSetting(DEVICES_KEY, [...devices, id]);
      return id;
    });
  }, [platform]);

  return useCallback(
    (event: StatEvent) => {
      // One at a time: counts read, added to and written back never cross.
      queue.current = queue.current.then(async () => {
        const id = await (device.current ?? deviceId(platform));
        const key = statsKey(id);
        const stats = { ...EMPTY_STATS, ...((await platform.readSetting<Stats>(key)) ?? {}) };
        stats.articles = { ...stats.articles };
        if (event.kind === 'open') stats.opened += 1;
        if (event.kind === 'search') stats.searches += 1;
        if (event.kind === 'calculation') stats.calculations += 1;
        if (event.kind === 'open' || event.kind === 'charge') stats.articles[event.article] = (stats.articles[event.article] ?? 0) + 1;
        await platform.writeSetting(key, stats);

        if (event.kind === 'charge' || (await platform.readSetting<boolean>(USAGE_SHARE_KEY)) === false) return;
        const pending = (await platform.readSetting<Record<string, number>>(USAGE_PENDING_KEY)) ?? {};
        const counter = `${today()}|${server}|${event.kind}`;
        pending[counter] = (pending[counter] ?? 0) + 1;
        await platform.writeSetting(USAGE_PENDING_KEY, pending);
      }).catch(() => undefined);
    },
    [platform, server],
  );
}
