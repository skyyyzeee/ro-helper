import type { PlatformAdapter } from '../platform/types';
import type { ArticleCount, UsageCount } from './types';

/** Anonymous counts for the author, not yet sent: `<day>|<server>|<event>` → how many (Q17). */
export const USAGE_PENDING_KEY = 'usage.pending';
/** Whether they are sent at all: on unless the player turns it off. */
export const USAGE_SHARE_KEY = 'usage.share';
/** When they were last sent. */
const USAGE_SENT_KEY = 'usage.sent';
/** Sent at most this often. */
const EVERY_MS = 60 * 60 * 1000;
/** The server takes the last week only. */
const KEPT_DAYS = 7;

const dayOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Sends the counts gathered here to the author's, at most once an hour; what was sent is taken off, what
 * came meanwhile stays. Turned off, nothing is sent and what was waiting is dropped. Throws when offline.
 */
export async function sendUsage(
  platform: Pick<PlatformAdapter, 'readSetting' | 'writeSetting'>,
  send: (counts: UsageCount[]) => Promise<void>,
  now = new Date(),
): Promise<void> {
  if ((await platform.readSetting<boolean>(USAGE_SHARE_KEY)) === false) {
    if (await platform.readSetting(USAGE_PENDING_KEY)) await platform.writeSetting(USAGE_PENDING_KEY, {});
    return;
  }
  const last = await platform.readSetting<string>(USAGE_SENT_KEY);
  if (last && now.getTime() - Date.parse(last) < EVERY_MS) return;
  const oldest = dayOf(new Date(now.getTime() - KEPT_DAYS * 24 * 3600 * 1000));
  const pending = (await platform.readSetting<Record<string, number>>(USAGE_PENDING_KEY)) ?? {};
  const counts = Object.entries(pending)
    .map(([key, count]) => {
      const [day, server, event] = key.split('|');
      return { day, server, event, count };
    })
    .filter((count) => count.day >= oldest && count.count > 0);
  if (counts.length) await send(counts);

  const after = (await platform.readSetting<Record<string, number>>(USAGE_PENDING_KEY)) ?? {};
  for (const count of counts) after[`${count.day}|${count.server}|${count.event}`] -= count.count;
  for (const [key, n] of Object.entries(after)) if (!(n > 0) || key.split('|')[0] < oldest) delete after[key];
  await platform.writeSetting(USAGE_PENDING_KEY, after);
  await platform.writeSetting(USAGE_SENT_KEY, now.toISOString());
}

/**
 * Which articles were opened, a day and a server — for everyone's «Популярное у игроков»: `<day>|<server>|<article>` →
 * how many. Nothing of the player. On the same switch as the counts above, sent through their own call, so one that
 * fails (the base not ready for it yet) never holds the others back.
 */
export const ARTICLES_PENDING_KEY = 'usage.articles';
const ARTICLES_SENT_KEY = 'usage.articles.sent';
/** The base takes so many at a time: the most opened first, the rest an hour later. */
const MOST_AT_ONCE = 200;

/** Sends the article counts gathered here, at most once an hour, as `sendUsage` does the others. Throws when offline. */
export async function sendArticleCounts(
  platform: Pick<PlatformAdapter, 'readSetting' | 'writeSetting'>,
  send: (counts: ArticleCount[]) => Promise<void>,
  now = new Date(),
): Promise<void> {
  if ((await platform.readSetting<boolean>(USAGE_SHARE_KEY)) === false) {
    if (await platform.readSetting(ARTICLES_PENDING_KEY)) await platform.writeSetting(ARTICLES_PENDING_KEY, {});
    return;
  }
  const last = await platform.readSetting<string>(ARTICLES_SENT_KEY);
  if (last && now.getTime() - Date.parse(last) < EVERY_MS) return;
  const oldest = dayOf(new Date(now.getTime() - KEPT_DAYS * 24 * 3600 * 1000));
  const pending = (await platform.readSetting<Record<string, number>>(ARTICLES_PENDING_KEY)) ?? {};
  const counts = Object.entries(pending)
    .map(([key, count]) => {
      const [day, server, article] = key.split('|');
      return { day, server, article, count };
    })
    .filter((count) => count.day >= oldest && count.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MOST_AT_ONCE);
  if (counts.length) await send(counts);

  const after = (await platform.readSetting<Record<string, number>>(ARTICLES_PENDING_KEY)) ?? {};
  for (const count of counts) after[`${count.day}|${count.server}|${count.article}`] -= count.count;
  for (const [key, n] of Object.entries(after)) if (!(n > 0) || key.split('|')[0] < oldest) delete after[key];
  await platform.writeSetting(ARTICLES_PENDING_KEY, after);
  await platform.writeSetting(ARTICLES_SENT_KEY, now.toISOString());
}
