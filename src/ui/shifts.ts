import { useCallback, useEffect, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import type { PlatformAdapter } from '../platform/types';
import { APP_VERSION } from './about';
import { aiServerOf, deviceOf } from './ai';
import { AUTO_KEY } from './updates';

/**
 * The player's shifts at the game's jobs: started and finished in the assistant, the sum typed at the end — what the
 * job paid an hour. Kept on this computer; shared, anonymously, only when the player turns it on (PRIVACY.md), for
 * the median every job pays on the server.
 */
export interface Shift {
  job: string;
  server: string;
  /** Epoch ms. */
  startedAt: number;
  endedAt: number;
  earned: number;
  /** A bonus hour of the job was on when it started or ended. */
  bonus?: boolean;
}

/** The shift going on: what job, on what server, since when. */
export interface ActiveShift {
  job: string;
  server: string;
  startedAt: number;
}

export const SHIFT_KEY = 'earn.shift';
export const SHIFTS_KEY = 'earn.shifts';
/** Sharing the rubles an hour with the server's summary: off unless turned on. */
export const SHARE_KEY = 'earn.share';
const SUMMARY_KEY = (server: string) => `earn.summary:${server}`;
/** The shifts kept on this computer. */
const MOST_KEPT = 200;
/** The server's summary is asked again after this long. */
const SUMMARY_MS = 30 * 60_000;

/** A job's pay an hour on the server, by the shifts players shared: the median and the middle half. */
export interface JobRate {
  median: number;
  low: number;
  high: number;
  shifts: number;
}

/** Whole minutes between two moments. */
export const minutesOf = (from: number, to: number) => Math.max(0, Math.round((to - from) / 60_000));
/** Rubles an hour of a shift. */
export const perHour = (shift: Pick<Shift, 'startedAt' | 'endedAt' | 'earned'>) => {
  const minutes = minutesOf(shift.startedAt, shift.endedAt);
  return minutes ? Math.round((shift.earned / minutes) * 60) : 0;
};

/** What this player's own shifts at a job paid an hour on average, and how many there were. */
export function myRate(shifts: Shift[], job: string, server: string): { perHour: number; shifts: number } | null {
  const mine = shifts.filter((s) => s.job === job && s.server === server && minutesOf(s.startedAt, s.endedAt) >= 1);
  if (!mine.length) return null;
  const earned = mine.reduce((sum, s) => sum + s.earned, 0);
  const minutes = mine.reduce((sum, s) => sum + minutesOf(s.startedAt, s.endedAt), 0);
  return { perHour: Math.round((earned / minutes) * 60), shifts: mine.length };
}

/** Sends a finished shift to the AI server: the server, the job, its length and sum — nothing about the player. */
export async function shareShift(platform: PlatformAdapter, shift: Shift): Promise<void> {
  const response = await fetch(`${await aiServerOf(platform)}/v1/earnings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device': await deviceOf(platform) },
    body: JSON.stringify({ server: shift.server, job: shift.job, minutes: minutesOf(shift.startedAt, shift.endedAt), earned: shift.earned, bonus: !!shift.bonus, app: APP_VERSION }),
  });
  if (!response.ok) throw new Error(`earnings: ${response.status}`);
}

/**
 * The shift going on and the ones finished, on this computer: start, finish with the sum earned, or call off. A
 * finished shift is shared with the server's summary only when the player turned sharing on.
 */
export function useShifts() {
  const platform = usePlatform();
  const [active, setActive] = useState<ActiveShift | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [share, setShareState] = useState(false);
  useEffect(() => {
    void Promise.all([platform.readSetting<ActiveShift>(SHIFT_KEY), platform.readSetting<Shift[]>(SHIFTS_KEY), platform.readSetting<boolean>(SHARE_KEY)]).then(([now, done, sharing]) => {
      if (now && typeof now.job === 'string' && typeof now.startedAt === 'number') setActive(now);
      if (Array.isArray(done)) setShifts(done);
      setShareState(sharing === true);
    });
  }, [platform]);

  const start = useCallback(
    (job: string, server: string) => {
      const shift = { job, server, startedAt: Date.now() };
      setActive(shift);
      void platform.writeSetting(SHIFT_KEY, shift);
    },
    [platform],
  );
  const cancel = useCallback(() => {
    setActive(null);
    void platform.writeSetting(SHIFT_KEY, null);
  }, [platform]);
  const finish = useCallback(
    (earned: number, bonus: boolean) => {
      if (!active) return null;
      const shift: Shift = { ...active, endedAt: Date.now(), earned, ...(bonus ? { bonus } : {}) };
      setActive(null);
      void platform.writeSetting(SHIFT_KEY, null);
      setShifts((now) => {
        const next = [shift, ...now].slice(0, MOST_KEPT);
        void platform.writeSetting(SHIFTS_KEY, next);
        return next;
      });
      // Too short to tell an hour's pay: kept here, not sent.
      if (share && minutesOf(shift.startedAt, shift.endedAt) >= 10) void shareShift(platform, shift).catch(() => undefined);
      return shift;
    },
    [active, platform, share],
  );
  const setShare = useCallback(
    (on: boolean) => {
      setShareState(on);
      void platform.writeSetting(SHARE_KEY, on);
    },
    [platform],
  );
  return { active, shifts, share, start, finish, cancel, setShare };
}

/**
 * What each job pays an hour on the server, by the shifts players shared: asked from the AI server at most every
 * half hour, while the automatic checks are on, and kept for offline.
 */
export function useServerRates(server: string): Record<string, JobRate> {
  const platform = usePlatform();
  const [rates, setRates] = useState<Record<string, JobRate>>({});
  useEffect(() => {
    let stopped = false;
    void (async () => {
      const kept = await platform.readSetting<{ at: number; jobs: Record<string, JobRate> }>(SUMMARY_KEY(server));
      if (stopped) return;
      setRates(kept?.jobs ?? {});
      if (kept && Date.now() - kept.at < SUMMARY_MS) return;
      if ((await platform.readSetting<boolean>(AUTO_KEY)) === false) return;
      try {
        const response = await fetch(`${await aiServerOf(platform)}/v1/earnings?server=${encodeURIComponent(server)}`);
        if (!response.ok) return;
        const { jobs } = (await response.json()) as { jobs?: Record<string, JobRate> };
        if (stopped || !jobs) return;
        setRates(jobs);
        await platform.writeSetting(SUMMARY_KEY(server), { at: Date.now(), jobs });
      } catch {
        // Offline: what was asked before stays.
      }
    })();
    return () => {
      stopped = true;
    };
  }, [platform, server]);
  return rates;
}

/** «42 000 ₽/ч». */
export const rateText = (rubles: number) => `${rubles.toLocaleString('ru-RU')} ₽/ч`;
