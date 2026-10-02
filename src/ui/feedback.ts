// The player's mark of an answer: 👍, 👎, or «Исправить» with what is right. Sent to the AI server only on a press,
// with no id of the player — the question, the app's answer (its articles and status) and the mark (PRIVACY.md).
// The admins read the marks to improve the search, the synonyms and the exam; nothing changes by itself.
import { refOf, type Analysis, type QueryAlias } from '../protocol';
import type { PlatformAdapter } from '../platform/types';
import { APP_VERSION } from './about';
import { aiServerOf, deviceOf } from './ai';

export type Vote = 'up' | 'down';

export interface Mark {
  vote: Vote;
  /** What is right instead, in the player's words: only with 👎. */
  correction?: string;
  /** The question the answer was to. */
  question: string;
  analysis: Analysis;
  /** The server's id: «tverskoi». */
  server: string;
  /** What the question was taken for: legal, server_rule… */
  type?: string;
}

/** What goes to the AI server: the mark, the question and the app's answer — nothing about the player. */
export function markBody({ vote, correction, question, analysis, server, type }: Mark) {
  return {
    vote,
    question: question.slice(0, 600),
    server,
    app: APP_VERSION,
    ...(type ? { type } : {}),
    scope: analysis.scope,
    status: analysis.validation.status,
    norms: analysis.validation.norms.filter((n) => n.hit && !n.issues.length).map((n) => refOf(n.hit!)),
    ...(vote === 'down' && correction?.trim() ? { correction: correction.trim().slice(0, 1000) } : {}),
  };
}

/** Sends a mark; says why when it could not. */
export async function sendMark(platform: PlatformAdapter, mark: Mark): Promise<void> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15_000);
  try {
    const response = await fetch(`${await aiServerOf(platform)}/v1/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device': await deviceOf(platform) },
      body: JSON.stringify(markBody(mark)),
      signal: abort.signal,
    });
    if (!response.ok) {
      const said = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(said?.error ?? 'Не удалось отправить отзыв — попробуйте позже.');
    }
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError' && !(error instanceof TypeError)) throw error;
    throw new Error('Нет связи с сервером — отзыв не отправлен.');
  } finally {
    clearTimeout(timer);
  }
}

// ——— The admins' reading ———

/** The admins' key for reading the marks: on this computer only, never synced. */
export const ADMIN_TOKEN_SETTING = 'ai.admin-token';

export type MarkFilter = 'all' | 'down' | 'fixed' | 'raw' | 'approved' | 'recheck' | 'rejected';

export type ReviewStatus = 'approved' | 'rejected' | 'recheck';

/** The admins' word on a mark, and the normal form they gave it (docs/AI_DATASET.md). */
export interface Review {
  id: string;
  status: ReviewStatus;
  at?: string;
  /** The players' expression and the same in the words of the base: a line of the dictionary. */
  phrase?: string;
  normalized?: string;
  scope?: 'law' | 'server_rule';
  intent?: string;
  /** The right articles: «УК 65» — an approved example for the exam. */
  expected?: string[];
}

/** A mark as the server keeps it. */
export interface KeptMark {
  id?: string;
  type?: string;
  review?: Review;
  at: string;
  server: string;
  app: string;
  vote: Vote;
  question: string;
  scope: string;
  status: string;
  norms: string[];
  correction?: string;
}

/** The latest marks, newest first, read with the admins' key. */
export async function readMarks(platform: PlatformAdapter, token: string, filter: MarkFilter): Promise<{ marks: KeptMark[]; today: number }> {
  let response: Response;
  try {
    response = await fetch(`${await aiServerOf(platform)}/v1/feedback?filter=${filter}&limit=200`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error('Нет связи с сервером ИИ.');
  }
  if (response.status === 403) throw new Error('Сервер не принял ключ администратора — проверьте его или нажмите «Сменить ключ».');
  if (!response.ok) throw new Error(`Сервер ИИ не отдал отзывы (код ${response.status}).`);
  const body = (await response.json()) as { marks?: KeptMark[]; today?: number };
  return { marks: body.marks ?? [], today: body.today ?? 0 };
}

/** Gives the admins' word on a mark. */
export async function reviewMark(platform: PlatformAdapter, token: string, review: Review): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${await aiServerOf(platform)}/v1/feedback/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(review),
    });
  } catch {
    throw new Error('Нет связи с сервером ИИ.');
  }
  if (!response.ok) throw new Error(response.status === 403 ? 'Сервер не принял ключ администратора.' : `Не сохранилось (код ${response.status}).`);
}

// ——— The players' dictionary ———

/** The approved expressions, with when they were fetched: kept on this computer, fetched again every few hours. */
export const ALIASES_SETTING = 'ai.aliases';
const ALIASES_FRESH = 6 * 3600_000;

/** The approved expressions of the players: from this computer, or from the AI server when they are old or missing. */
export async function loadAliases(platform: PlatformAdapter, now = Date.now()): Promise<QueryAlias[]> {
  const kept = await platform.readSetting<{ at: number; aliases: QueryAlias[] }>(ALIASES_SETTING);
  if (kept && now - kept.at < ALIASES_FRESH) return kept.aliases;
  try {
    const response = await fetch(`${await aiServerOf(platform)}/v1/aliases`);
    if (!response.ok) return kept?.aliases ?? [];
    const body = (await response.json()) as { aliases?: QueryAlias[] };
    const aliases = (body.aliases ?? []).filter((a) => typeof a?.phrase === 'string' && typeof a?.normalized === 'string').slice(0, 2000);
    await platform.writeSetting(ALIASES_SETTING, { at: now, aliases });
    return aliases;
  } catch {
    // Offline: what was kept, or none — the search works without it.
    return kept?.aliases ?? [];
  }
}
