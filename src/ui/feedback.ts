// The player's mark of an answer: 👍, 👎, or «Исправить» with what is right. Sent to the AI server only on a press,
// with no id of the player — the question, the app's answer (its articles and status) and the mark (PRIVACY.md).
// The admins read the marks to improve the search, the synonyms and the exam; nothing changes by itself.
import { refOf, type Analysis } from '../protocol';
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
}

/** What goes to the AI server: the mark, the question and the app's answer — nothing about the player. */
export function markBody({ vote, correction, question, analysis, server }: Mark) {
  return {
    vote,
    question: question.slice(0, 600),
    server,
    app: APP_VERSION,
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

export type MarkFilter = 'all' | 'down' | 'fixed';

/** A mark as the server keeps it. */
export interface KeptMark {
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
