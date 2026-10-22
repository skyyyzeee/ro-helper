// The jobs of the game, read out of the wiki's articles of «Работы» (scripts/wiki-build.ts) and laid over the player's
// level and the clock: what they may take now, what opens next, which pays more right now. Pure, like the rest of
// src/wiki: the build reads, the app counts.
import type { WikiData, WikiEntry, WikiJob, WikiJobBonus } from './model';

/** The wiki section the job articles sit in. */
export const JOBS_GROUP = 'raboty';
/** The overview article: the levels and the lawfulness of every job in its lists. */
export const JOBS_OVERVIEW = 'Всё о работах';

const LEGALITY: [RegExp, WikiJob['legality']][] = [
  [/Нелегальные:([^.]*)/i, 'illegal'],
  [/Полулегальные:([^.]*)/i, 'semi'],
  [/Легальные:([^.]*)/i, 'legal'],
];

/** «Шахтёр» → «шахт»: a job's name as the overview writes it in any case («работой шахтёром», «шахтёр»). */
const stem = (title: string) => title.toLowerCase().replace(/ё/g, 'е').split(/\s+/)[0].slice(0, 5);
const plain = (text: string) => text.toLowerCase().replace(/ё/g, 'е');

/**
 * What a job's article says of it: «доступна с 3 уровня персонажа или после достижения 2 ранга», the sentences with
 * hours and a percent («Работа с 07:00 до 15:00 увеличивает заработок на 15%»). The overview fills in a level an
 * article does not say, and the lawfulness from its lists.
 */
export function jobOf(title: string, text: string, overview = ''): WikiJob {
  const level = text.match(/с\s+(\d+)\s+уровня\s+персонажа/i)?.[1] ?? levelInOverview(title, overview);
  const rank = text.match(/после\s+достижения\s+(\d+)\s+ранга/i)?.[1];
  const legality = LEGALITY.find(([list]) => {
    const names = overview.match(list)?.[1];
    return names && plain(names).includes(stem(title));
  })?.[1];
  const bonuses = text
    .split(/(?<=[.;!?])\s+|\s+(?=Работа\s+с\s+\d)/)
    .flatMap((sentence): WikiJobBonus[] => {
      const percent = sentence.match(/на\s+(\d+)\s?%/)?.[1];
      if (!percent) return [];
      return [...sentence.matchAll(/с\s+(\d{1,2}:\d{2})\s+до\s+(\d{1,2}:\d{2})/gi)].map((m) => ({
        from: m[1].padStart(5, '0'),
        to: m[2].padStart(5, '0'),
        percent: Number(percent),
        text: sentence.trim().replace(/^(?:Бонусы(?:\s+и\s+\S+)?)\s+/, ''),
      }));
    });
  return { ...(level ? { level: Number(level) } : {}), ...(rank ? { rank: Number(rank) } : {}), ...(legality ? { legality } : {}), bonuses };
}

/** «На 2 уровне открывается …: повар, рыбак, таксист», «С 1 уровня доступны строитель», «без требований … шахтёром». */
function levelInOverview(title: string, overview: string): string | undefined {
  const name = stem(title);
  for (const sentence of overview.split(/(?<=[.!?])\s+/)) {
    if (!plain(sentence).includes(name)) continue;
    if (/без требований к уровню/i.test(sentence)) return '1';
    const level = sentence.match(/(\d+)\s+уровн/i)?.[1];
    if (level) return level;
  }
  return undefined;
}

/** «06:00» → minutes since midnight. */
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** The time in Moscow, as the game's clock: minutes since midnight. */
export function moscowMinutes(now = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).split(':');
  return Number(h) * 60 + Number(m);
}

/** The bonus on now, and how many minutes it has left; one past midnight («с 09:00 до 01:00») goes round. */
export function bonusNow(job: WikiJob, now: number): { bonus: WikiJobBonus; left: number } | null {
  for (const bonus of job.bonuses) {
    const from = minutes(bonus.from);
    const to = minutes(bonus.to);
    const length = (to - from + 1440) % 1440 || 1440;
    const since = (now - from + 1440) % 1440;
    if (since < length) return { bonus, left: length - since };
  }
  return null;
}

/** The job articles with what they say of the job, in the wiki's order. */
export const jobsOf = (data: WikiData): (WikiEntry & { job: WikiJob })[] =>
  data.entries.filter((e): e is WikiEntry & { job: WikiJob } => e.catalog === 'posts' && !!e.job);

/** «2 ч 10 мин», «45 мин». */
export function timeLeft(left: number): string {
  const h = Math.floor(left / 60);
  const m = left % 60;
  return h ? (m ? `${h} ч ${m} мин` : `${h} ч`) : `${m} мин`;
}
