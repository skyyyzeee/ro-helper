import { useState } from 'react';
import type { Memo } from '../account/roles';
import { factionName, serverName } from './AdminView';
import { formatDate } from './lawBits';
import { MemoEditor } from './MemoEditor';
import { MemoText } from './memoText';
import { MEMO_DURATIONS, useMemos } from './memos';

/** «сегодня», «вчера» or the date. */
export function memoDay(iso: string, now = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(iso))) / (24 * 3600 * 1000));
  return days === 0 ? 'сегодня' : days === 1 ? 'вчера' : formatDate(iso);
}

function MemoCard({ memo, onRemove }: { memo: Memo; onRemove?: () => void }) {
  return (
    <article className="memo" aria-label={`Памятка от ${memo.authorName}`}>
      <div className="memo__head">
        <b>{memo.authorName || 'Лидер'}</b>
        <span>· {memoDay(memo.createdAt)}</span>
        <span className="sp" />
        <span className="memo__until">до {formatDate(memo.until).slice(0, 5)}</span>
        {onRemove && (
          <button className="link-btn" type="button" onClick={onRemove}>
            Удалить
          </button>
        )}
      </div>
      <div className="memo__rich">
        <MemoText text={memo.text} />
      </div>
    </article>
  );
}

/**
 * «Памятки» (ticket 17): the running memos of the player's faction, the archive of those run out, and — for its
 * leader and deputies — a new one, with how long it runs.
 */
export function MemosView({ signedIn }: { signedIn: boolean }) {
  const { place, active, archive, canWrite, canRemove, post, remove } = useMemos();
  const [text, setText] = useState('');
  const [days, setDays] = useState(3);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);

  if (!signedIn) return <p className="set__hint memos__empty">Памятки от лидера видят игроки фракции, вошедшие в аккаунт: «Настройки» → «Аккаунт».</p>;
  if (!place) return <p className="set__hint memos__empty">Выберите свою фракцию — в шапке или в настройках, — чтобы видеть её памятки.</p>;

  const act = async (change: () => Promise<void>) => {
    try {
      await change();
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="memos" role="group" aria-label="Памятки">
      <p className="set__hint">
        {factionName(place.server, place.organization)} · {serverName(place.server)}
      </p>
      {canWrite && (
        <form
          className="memos__new"
          aria-label="Новая памятка"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim() || sending) return;
            setSending(true);
            void act(async () => {
              await post(text, days);
              setText('');
            }).finally(() => setSending(false));
          }}
        >
          <MemoEditor value={text} onChange={setText} placeholder="Например: с 20:00 рейд на склад в Южном порту. Сбор у ГУВД, форма — ОМОН." />
          <div className="set__row">
            <span className="set__label">Показывать</span>
            <div className="seg seg--sm" role="radiogroup" aria-label="Сколько показывать">
              {MEMO_DURATIONS.map((d) => (
                <button key={d.days} type="button" role="radio" aria-checked={days === d.days} onClick={() => setDays(d.days)}>
                  {d.label}
                </button>
              ))}
            </div>
            <span className="sp" />
            <button className="settings__button" type="submit" disabled={!text.trim() || sending}>
              Опубликовать
            </button>
          </div>
        </form>
      )}
      {failed && (
        <p className="login__error" role="alert">
          Нет связи с сервером — попробуйте ещё раз.
        </p>
      )}
      {active.length ? (
        active.map((memo) => <MemoCard key={memo.id} memo={memo} onRemove={canRemove(memo) ? () => void act(() => remove(memo.id)) : undefined} />)
      ) : (
        <p className="set__hint memos__empty">Действующих памяток нет.</p>
      )}
      {archive.length > 0 && (
        <details className="memos__archive">
          <summary>Архив · {archive.length}</summary>
          {archive.map((memo) => (
            <MemoCard key={memo.id} memo={memo} />
          ))}
        </details>
      )}
    </div>
  );
}
