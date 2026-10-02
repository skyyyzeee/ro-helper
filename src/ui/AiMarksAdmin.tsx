import { useCallback, useEffect, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import { ADMIN_TOKEN_SETTING, readMarks, type KeptMark, type MarkFilter } from './feedback';

const FILTERS: { id: MarkFilter; label: string }[] = [
  { id: 'fixed', label: 'С поправками' },
  { id: 'down', label: '👎' },
  { id: 'all', label: 'Все' },
];

/** «02.10 21:40» from the server's «2026-10-02T21:40». */
const when = (at: string) => `${at.slice(8, 10)}.${at.slice(5, 7)} ${at.slice(11, 16)}`;

/**
 * The admins' look at the players' marks of the AI's answers, read from the AI server with the admins' key
 * (made on the server by `bash set-key.sh admin`; kept on this computer only, never synced). docs/AI_FEEDBACK.md.
 */
export function AiMarksAdmin() {
  const platform = usePlatform();
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<MarkFilter>('fixed');
  const [marks, setMarks] = useState<KeptMark[] | null>(null);
  const [today, setToday] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void platform.readSetting<string>(ADMIN_TOKEN_SETTING).then((saved) => setToken(saved ?? ''));
  }, [platform]);

  const load = useCallback(
    async (key: string, which: MarkFilter) => {
      try {
        const read = await readMarks(platform, key, which);
        setMarks(read.marks);
        setToday(read.today);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [platform],
  );
  useEffect(() => {
    if (token) void load(token, filter);
  }, [token, filter, load]);

  if (token === null) return null;
  if (!token) {
    return (
      <form
        className="set__row"
        onSubmit={(e) => {
          e.preventDefault();
          const key = draft.trim();
          if (!key) return;
          void platform.writeSetting(ADMIN_TOKEN_SETTING, key).then(() => setToken(key));
        }}
      >
        <input
          className="presets__input"
          type="password"
          aria-label="Ключ администратора сервера ИИ"
          placeholder="Ключ администратора сервера ИИ"
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="settings__button" type="submit">
          Сохранить
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="set__row">
        <div className="ai__chips" role="radiogroup" aria-label="Какие отзывы">
          {FILTERS.map(({ id, label }) => (
            <button key={id} type="button" role="radio" aria-checked={filter === id} className={filter === id ? 'ai__chip ai__chip--on' : 'ai__chip'} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <span className="sp" />
        <span className="set__hint">Сегодня: {today}</span>
        <button className="link-btn" type="button" onClick={() => void load(token, filter)}>
          Обновить
        </button>
        <button
          className="link-btn"
          type="button"
          onClick={() => {
            setMarks(null);
            void platform.writeSetting(ADMIN_TOKEN_SETTING, '').then(() => setToken(''));
          }}
        >
          Сменить ключ
        </button>
      </div>
      {error && (
        <p className="login__error" role="alert">
          {error}
        </p>
      )}
      {marks && marks.length === 0 && <p className="set__hint">Отзывов нет.</p>}
      {marks && marks.length > 0 && (
        <ul className="adm__list" aria-label="Отзывы об ИИ">
          {marks.map((mark, i) => (
            <li key={`${mark.at}-${i}`} className="adm__item">
              <div className="adm__text">
                <div>
                  <span aria-label={mark.vote === 'up' ? 'Верно' : 'Неверно'}>{mark.vote === 'up' ? '👍' : '👎'}</span> {mark.question}
                </div>
                <div className="adm__meta">
                  {when(mark.at)} · {mark.server} · {mark.norms.length ? mark.norms.join(', ') : 'без статей'} · {mark.status}
                  {mark.app ? ` · ${mark.app}` : ''}
                </div>
                {mark.correction && <div className="adm__note">«{mark.correction}»</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
