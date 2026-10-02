import { useCallback, useEffect, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import { Dropdown } from './Dropdown';
import { ADMIN_TOKEN_SETTING, readMarks, reviewMark, type KeptMark, type MarkFilter, type Review, type ReviewStatus } from './feedback';

const FILTERS: { id: MarkFilter; label: string }[] = [
  { id: 'raw', label: 'Новые' },
  { id: 'fixed', label: 'С поправками' },
  { id: 'down', label: '👎' },
  { id: 'approved', label: 'Утверждённые' },
  { id: 'recheck', label: 'На перепроверку' },
  { id: 'rejected', label: 'Отклонённые' },
  { id: 'all', label: 'Все' },
];

const STATUS: Record<ReviewStatus | 'raw', string> = { raw: 'новый', approved: 'утверждён', rejected: 'отклонён', recheck: 'на перепроверку' };

/** «02.10 21:40» from the server's «2026-10-02T21:40». */
const when = (at: string) => `${at.slice(8, 10)}.${at.slice(5, 7)} ${at.slice(11, 16)}`;

/** The normal form of a mark, as the admin approves it: a line of the players' dictionary and an example. */
function ApproveForm({ mark, onSave, onCancel }: { mark: KeptMark; onSave: (review: Review) => void; onCancel: () => void }) {
  const [phrase, setPhrase] = useState(mark.review?.phrase ?? mark.question.toLowerCase());
  const [normalized, setNormalized] = useState(mark.review?.normalized ?? '');
  const [scope, setScope] = useState<'' | 'law' | 'server_rule'>(mark.review?.scope ?? (mark.scope === 'server_rule' ? 'server_rule' : mark.scope === 'law' ? 'law' : ''));
  const [intent, setIntent] = useState(mark.review?.intent ?? '');
  const [expected, setExpected] = useState((mark.review?.expected ?? (mark.vote === 'up' ? mark.norms : [])).join(', '));
  return (
    <form
      className="review"
      aria-label="Утвердить отзыв"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: mark.id!,
          status: 'approved',
          ...(phrase.trim() && normalized.trim() ? { phrase: phrase.trim(), normalized: normalized.trim() } : {}),
          ...(scope ? { scope } : {}),
          ...(intent.trim() ? { intent: intent.trim() } : {}),
          expected: expected.split(',').map((e) => e.trim()).filter(Boolean),
        });
      }}
    >
      <label className="review__field">
        <span>Выражение игрока</span>
        <input className="presets__input" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="чела приняли" />
      </label>
      <label className="review__field">
        <span>Нормальная форма (слова закона)</span>
        <input className="presets__input" value={normalized} onChange={(e) => setNormalized(e.target.value)} placeholder="задержание" />
      </label>
      <div className="review__field">
        <span>Где искать</span>
        <Dropdown
          label="Где искать"
          value={scope}
          onChange={(value) => setScope(value as typeof scope)}
          options={[
            { value: '', label: 'не важно' },
            { value: 'law', label: 'законы' },
            { value: 'server_rule', label: 'правила сервера' },
          ]}
        />
      </div>
      <label className="review__field">
        <span>Что спрашивают</span>
        <input className="presets__input" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="наказание, задержание, права…" />
      </label>
      <label className="review__field">
        <span>Правильные статьи</span>
        <input className="presets__input" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="УК 65, КоАП 8.6" />
      </label>
      <p className="set__hint">Выражение и нормальная форма попадут в словарь, по которому поиск понимает игроков; статьи — в экзамен ИИ.</p>
      <div className="mark__row">
        <button className="settings__button" type="submit">
          Утвердить
        </button>
        <button className="link-btn" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

/**
 * The admins' review of the players' marks of the AI's answers, read from the AI server with the admins' key (made
 * on the server by `bash set-key.sh admin`; kept on this computer only, never synced). Approve with the normal form
 * (a line of the dictionary, an example for the exam), reject, or put aside to check again. docs/AI_DATASET.md.
 */
export function AiMarksAdmin() {
  const platform = usePlatform();
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<MarkFilter>('raw');
  const [marks, setMarks] = useState<KeptMark[] | null>(null);
  const [today, setToday] = useState(0);
  const [approving, setApproving] = useState<string | null>(null);
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

  const review = async (value: Review) => {
    if (!token) return;
    try {
      await reviewMark(platform, token, value);
      setApproving(null);
      await load(token, filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

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
      <div className="ai__chips" role="radiogroup" aria-label="Какие отзывы">
        {FILTERS.map(({ id, label }) => (
          <button key={id} type="button" role="radio" aria-checked={filter === id} className={filter === id ? 'ai__chip ai__chip--on' : 'ai__chip'} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="set__row">
        <span className="set__hint">Сегодня отзывов: {today}</span>
        <span className="sp" />
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
            <li key={mark.id ?? `${mark.at}-${i}`} className="adm__item adm__item--mark">
              <div className="adm__text">
                <div>
                  <span aria-label={mark.vote === 'up' ? 'Верно' : 'Неверно'}>{mark.vote === 'up' ? '👍' : '👎'}</span> {mark.question}
                </div>
                <div className="adm__meta">
                  {when(mark.at)} · {mark.server} · {mark.norms.length ? mark.norms.join(', ') : 'без статей'} · {mark.status}
                  {mark.type ? ` · ${mark.type}` : ''} · <b>{STATUS[mark.review?.status ?? 'raw']}</b>
                </div>
                {mark.correction && <div className="adm__note">«{mark.correction}»</div>}
                {mark.review?.phrase && (
                  <div className="adm__meta">
                    словарь: «{mark.review.phrase}» → {mark.review.normalized}
                    {mark.review.scope ? ` (${mark.review.scope === 'law' ? 'законы' : 'правила'})` : ''}
                    {mark.review.expected?.length ? ` · статьи: ${mark.review.expected.join(', ')}` : ''}
                  </div>
                )}
                {approving === mark.id && <ApproveForm mark={mark} onSave={(value) => void review(value)} onCancel={() => setApproving(null)} />}
              </div>
              {mark.id && approving !== mark.id && (
                <span className="adm__actions">
                  <button className="settings__button" type="button" onClick={() => setApproving(mark.id!)}>
                    Утвердить
                  </button>
                  <button className="link-btn" type="button" onClick={() => void review({ id: mark.id!, status: 'recheck' })}>
                    На перепроверку
                  </button>
                  <button className="link-btn" type="button" onClick={() => void review({ id: mark.id!, status: 'rejected' })}>
                    Отклонить
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
