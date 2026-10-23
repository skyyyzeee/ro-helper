import jobsData from '../data/jobs.json';
import { bonusNow, timeLeft } from '../wiki/jobs';
import type { WikiJobEntry } from '../wiki/model';
import { useMoscowClock } from './WikiTools';

const JOBS = jobsData as WikiJobEntry[];
/** So many on the home screen, the biggest bonus first. */
const SHOWN = 6;

/** Minutes from now to a bonus's start, round the clock. */
const until = (from: string, now: number) => (Number(from.slice(0, 2)) * 60 + Number(from.slice(3, 5)) - now + 1440) % 1440;

/**
 * «Бусты на работах» on the home screen (skyze): the jobs with a bonus on now, the biggest first, and how long it lasts —
 * Moscow time, as the game's. With none on, the next one. A press opens the job in the wiki.
 */
export function HomeBoosts({ onOpen }: { onOpen: (id: string) => void }) {
  const now = useMoscowClock();
  const on = JOBS.flatMap((job) => {
    const found = bonusNow(job, now);
    return found ? [{ job, ...found }] : [];
  }).sort((a, b) => b.bonus.percent - a.bonus.percent || a.job.title.localeCompare(b.job.title, 'ru'));
  const next = on.length
    ? null
    : JOBS.flatMap((job) => job.bonuses.map((bonus) => ({ job, bonus, in: until(bonus.from, now) }))).sort((a, b) => a.in - b.in)[0];
  if (!on.length && !next) return null;
  return (
    <section className="home__boosts" aria-label="Бусты на работах">
      <div className="sec-t home__title">Бусты на работах</div>
      {on.length ? (
        <div className="home__boost-list">
          {on.slice(0, SHOWN).map(({ job, bonus, left }) => (
            <button key={`${job.id}-${bonus.from}`} type="button" className="home__boost" title={bonus.text} onClick={() => onOpen(job.id)}>
              <b>{job.title}</b>
              <span className="home__boost-pct">+{bonus.percent}%</span>
              <span className="home__boost-left">ещё {timeLeft(left)}</span>
            </button>
          ))}
        </div>
      ) : (
        next && (
          <p className="home__boost-none">
            Сейчас бонусов нет. Ближайший —{' '}
            <button type="button" className="link" onClick={() => onOpen(next.job.id)}>
              {next.job.title} +{next.bonus.percent}% с {next.bonus.from}
            </button>
            , через {timeLeft(next.in)}.
          </p>
        )
      )}
    </section>
  );
}
