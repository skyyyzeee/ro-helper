import { useEffect, useMemo, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import { bonusNow, jobsOf, moscowMinutes, timeLeft } from '../wiki/jobs';
import type { WikiData, WikiEntry, WikiJob, WikiMake } from '../wiki/model';
import { Dropdown } from './Dropdown';
import { plural } from './WikiHome';

/** The player's level, kept for «Работы для меня». */
export const LEVEL_KEY = 'wiki.level';
const LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

const LEGALITY: Record<NonNullable<WikiJob['legality']>, string> = { legal: 'Легальная', semi: 'Полулегальная', illegal: 'Нелегальная' };
type Lawful = 'all' | NonNullable<WikiJob['legality']>;
const LAWFUL: { id: Lawful; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'legal', label: 'Легальные' },
  { id: 'semi', label: 'Полулегальные' },
  { id: 'illegal', label: 'Нелегальные' },
];

/** «3 ч 20 мин» of cooking. */
const duration = (minutes: number) => timeLeft(minutes);

/** The time in Moscow, as the game's clock, kept fresh while the page is open. */
function useMoscowClock(): number {
  const [now, setNow] = useState(() => moscowMinutes());
  useEffect(() => {
    const tick = setInterval(() => setNow(moscowMinutes()), 30_000);
    return () => clearInterval(tick);
  }, []);
  return now;
}

/**
 * A recipe's or a craft's page: how much it takes to make as many as wanted — the batches, every ingredient times
 * them, the time. The wiki gives one batch; the app multiplies.
 */
export function MakeCalculator({ make }: { make: WikiMake }) {
  const [wanted, setWanted] = useState(String(make.output));
  const count = Math.max(1, Math.min(9999, Number(wanted.replace(/\D/g, '')) || make.output));
  const batches = Math.ceil(count / make.output);
  return (
    <section className="wiki__make" aria-label="Калькулятор">
      <div className="wiki__make-head">
        <label className="wiki__make-want">
          <span>Сколько нужно</span>
          <input className="presets__input" inputMode="numeric" aria-label="Сколько нужно" value={wanted} onChange={(e) => setWanted(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          <span>шт.</span>
        </label>
        <span className="sp" />
        <span className="wiki__make-sum">
          {batches > 1 || make.output > 1 ? `${batches} ${plural(batches, 'раз', 'раза', 'раз')} · выйдет ${batches * make.output} шт.` : null}
          {make.minutes ? ` · ${duration(make.minutes * batches)}` : ''}
        </span>
      </div>
      <ul className="wiki__make-parts" aria-label="Понадобится">
        {make.parts.map((part) => (
          <li key={part.name}>
            <span>{part.name}</span>
            <b>× {(part.count * batches).toLocaleString('ru-RU')}</b>
          </li>
        ))}
      </ul>
      {make.steps?.length ? <p className="wiki__make-steps">Как готовить: {make.steps.join(' → ')}</p> : null}
    </section>
  );
}

/** A job's article: from what level, lawful or not, its bonus hours — and the one on now. */
export function JobInfo({ job }: { job: WikiJob }) {
  const now = useMoscowClock();
  const on = bonusNow(job, now);
  return (
    <section className="wiki__job" aria-label="О работе">
      <p className="wiki__job-line">
        {job.level ? `С ${job.level} уровня` : 'Уровень не указан'}
        {job.rank ? ` или со ${job.rank} ранга предыдущей работы` : ''}
        {job.legality ? ` · ${LEGALITY[job.legality]}` : ''}
      </p>
      {job.bonuses.length > 0 && (
        <ul className="wiki__job-bonuses">
          {job.bonuses.map((b) => (
            <li key={`${b.from}-${b.to}`} className={on?.bonus === b ? 'wiki__job-bonus wiki__job-bonus--on' : 'wiki__job-bonus'}>
              <b>
                {b.from}–{b.to} · +{b.percent}%
              </b>
              {on?.bonus === b && <span> — сейчас, ещё {timeLeft(on.left)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * «Работы» on the wiki's home: the jobs the player's level opens, the ones with a bonus on now first, and what opens
 * next. All from the wiki's articles; the time is Moscow's, as the game's.
 */
export function JobsBlock({ data, onOpen }: { data: WikiData; onOpen: (entry: WikiEntry) => void }) {
  const platform = usePlatform();
  const [level, setLevel] = useState(1);
  const [lawful, setLawful] = useState<Lawful>('all');
  const now = useMoscowClock();
  useEffect(() => {
    void platform.readSetting<number>(LEVEL_KEY).then((saved) => typeof saved === 'number' && saved > 0 && setLevel(saved));
  }, [platform]);
  const chooseLevel = (next: number) => {
    setLevel(next);
    void platform.writeSetting(LEVEL_KEY, next);
  };

  const jobs = useMemo(() => jobsOf(data), [data]);
  if (!jobs.length) return null;
  const shown = jobs.filter((j) => lawful === 'all' || j.job.legality === lawful);
  // Open now, the ones paying more right now first; then what the next levels open.
  const open = shown
    .filter((j) => (j.job.level ?? 1) <= level)
    .map((j) => ({ entry: j, on: bonusNow(j.job, now) }))
    .sort((a, b) => (b.on?.bonus.percent ?? 0) - (a.on?.bonus.percent ?? 0));
  const next = shown.filter((j) => (j.job.level ?? 1) > level && (j.job.level ?? 1) <= level + 2);

  return (
    <section className="wiki__jobs" aria-label="Работы">
      <div className="wiki__head">
        <h3 className="wiki__h3">Работы для меня</h3>
        <span className="sp" />
        <span className="wiki__jobs-level">
          Мой уровень
          <Dropdown variant="pill" label="Мой уровень" value={String(level)} onChange={(v) => chooseLevel(Number(v))} options={LEVELS.map((l) => ({ value: String(l), label: l === 10 ? '10+' : String(l) }))} />
        </span>
      </div>
      <div className="wiki__groups" role="radiogroup" aria-label="Законность">
        {LAWFUL.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={lawful === l.id} className={lawful === l.id ? 'wiki__group wiki__group--on' : 'wiki__group'} onClick={() => setLawful(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
      <ul className="wiki__jobs-list" aria-label="Доступно">
        {open.map(({ entry, on }) => (
          <li key={entry.id}>
            <button type="button" className="wiki__jobs-row" onClick={() => onOpen(entry)}>
              <span className="wiki__jobs-name">{entry.title}</span>
              {entry.job.legality && entry.job.legality !== 'legal' && <span className={`wiki__jobs-law wiki__jobs-law--${entry.job.legality}`}>{LEGALITY[entry.job.legality]}</span>}
              <span className="sp" />
              {on ? (
                <span className="wiki__jobs-bonus">
                  +{on.bonus.percent}% ещё {timeLeft(on.left)}
                </span>
              ) : (
                entry.job.bonuses[0] && (
                  <span className="wiki__jobs-later">
                    +{entry.job.bonuses[0].percent}% с {entry.job.bonuses[0].from}
                  </span>
                )
              )}
            </button>
          </li>
        ))}
      </ul>
      {!open.length && <p className="empty">На этом уровне таких работ нет.</p>}
      {next.length > 0 && (
        <p className="wiki__jobs-next">
          Дальше: {next.map((j) => `${j.title} (${j.job.level} ур.)`).join(', ')}
        </p>
      )}
      <p className="wiki__jobs-note">Бонусы — по московскому времени, как в игре. Ранги работы открывают следующие раньше уровня — см. статью о работе.</p>
    </section>
  );
}
