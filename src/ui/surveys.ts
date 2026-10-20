import { useCallback, useEffect, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import type { PlatformAdapter } from '../platform/types';
import { APP_VERSION } from './about';
import { aiServerOf, deviceOf } from './ai';
import { LAWS_BASE } from './laws';
import { AUTO_KEY } from './updates';

/**
 * A short poll (the team's ask, as Discord and Telegram reach few): one question, ready answers, never required.
 * The team adds it to `src/data/surveys.json` on `main`; installed copies fetch the file as they fetch the laws.
 */
export interface Survey {
  /** Never reused: an answered poll stays answered by it. */
  id: string;
  question: string;
  answers: string[];
  /** The last day it is asked (YYYY-MM-DD), inclusive. */
  until?: string;
  /** For these servers only; for all without it. */
  servers?: string[];
}

export const SURVEYS_URL = `${LAWS_BASE}/surveys.json`;
/** The file as last fetched, asked offline too. */
const CACHE_KEY = 'surveys.cache';
/** The polls this computer answered or put off: each is asked once. */
export const ANSWERED_KEY = 'surveys.answered';

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** The poll to ask here: well-formed, not past its day, for this server, not answered or put off. */
export function nextSurvey(list: unknown, server: string, answered: string[]): Survey | null {
  if (!Array.isArray(list)) return null;
  return (
    list
      .filter((s): s is Survey => !!s && typeof s.id === 'string' && typeof s.question === 'string' && Array.isArray(s.answers) && s.answers.length > 1)
      .filter((s) => !answered.includes(s.id))
      .filter((s) => !s.until || s.until >= today())
      .find((s) => !Array.isArray(s.servers) || s.servers.includes(server)) ?? null
  );
}

/** Sends an answer to the AI server: the poll, the answer, the version and the server — nothing about the player. */
export async function sendAnswer(platform: PlatformAdapter, survey: Survey, answer: string, server: string): Promise<void> {
  const response = await fetch(`${await aiServerOf(platform)}/v1/survey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device': await deviceOf(platform) },
    body: JSON.stringify({ survey: survey.id, answer, app: APP_VERSION, server }),
  });
  if (!response.ok) throw new Error(`survey: ${response.status}`);
}

/**
 * The poll to ask on the home screen, if any: answering sends the answer and puts the poll away, «Не сейчас» only
 * puts it away. The file is fetched at start, as the laws, and only while the automatic checks are on.
 */
export function useSurvey(server: string): { current: Survey | null; answer: (value: string) => void; skip: () => void; answered: string | null } {
  const platform = usePlatform();
  const [list, setList] = useState<unknown>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    void Promise.all([platform.readSetting<unknown>(CACHE_KEY), platform.readSetting<string[]>(ANSWERED_KEY)]).then(([cached, ids]) => {
      if (stopped) return;
      if (cached) setList((now: unknown) => now ?? cached);
      setDone(Array.isArray(ids) ? ids : []);
    });
    void (async () => {
      if ((await platform.readSetting<boolean>(AUTO_KEY)) === false) return;
      try {
        const file = JSON.parse(await platform.download(SURVEYS_URL)) as { surveys?: unknown };
        if (stopped) return;
        setList(file.surveys ?? []);
        await platform.writeSetting(CACHE_KEY, file.surveys ?? []);
      } catch {
        // Offline, or no file: what was fetched before stays.
      }
    })();
    return () => {
      stopped = true;
    };
  }, [platform]);

  const current = done ? nextSurvey(list, server, done) : null;
  const putAway = useCallback(
    (id: string) => {
      setDone((ids) => {
        const next = [...(ids ?? []), id];
        void platform.writeSetting(ANSWERED_KEY, next);
        return next;
      });
    },
    [platform],
  );
  const answer = useCallback(
    (value: string) => {
      if (!current) return;
      // Thanked at once; an answer that could not be sent is not asked for again.
      setAnswered(value);
      putAway(current.id);
      void sendAnswer(platform, current, value, server).catch(() => undefined);
    },
    [current, platform, putAway, server],
  );
  const skip = useCallback(() => current && putAway(current.id), [current, putAway]);
  return { current, answer, skip, answered };
}
