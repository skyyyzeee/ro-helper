import { useMemo, useState } from 'react';
import type { StoredConversation } from './ai';
import { CloseIcon, PinIcon } from './icons';

/** «сегодня, 14:05», «вчера, 22:10», «25 сентября, 09:30». */
function when(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return `сегодня, ${time}`;
  if (days === 1) return `вчера, ${time}`;
  return `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, ${time}`;
}

/** «2 вопроса»: how many questions a case has. */
function questions(saved: StoredConversation): string {
  const n = saved.messages.filter((m) => m.role === 'user').length;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} вопрос`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} вопроса`;
  return `${n} вопросов`;
}

/** Whether a case holds all the words searched for: in its name or anything asked in it. */
const matches = (saved: StoredConversation, words: string[]) => {
  const text = [saved.title, ...saved.messages.filter((m) => m.role === 'user').map((m) => m.text)].join(' ').toLowerCase().replace(/ё/g, 'е');
  return words.every((word) => text.includes(word));
};

export interface CaseActions {
  onOpen: (id: string) => void;
  onForget: (id?: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDuplicate: (id: string) => void;
}

function CaseRow({ saved, current, actions }: { saved: StoredConversation; current: boolean; actions: CaseActions }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(saved.title);
  if (renaming) {
    return (
      <li className="history__item">
        <form
          className="case__rename"
          onSubmit={(e) => {
            e.preventDefault();
            actions.onRename(saved.id, title);
            setRenaming(false);
          }}
        >
          <input className="presets__input" aria-label="Название дела" value={title} maxLength={120} autoFocus onChange={(e) => setTitle(e.target.value)} />
          <button className="settings__button" type="submit">
            Сохранить
          </button>
          <button className="link-btn" type="button" onClick={() => setRenaming(false)}>
            Отмена
          </button>
        </form>
      </li>
    );
  }
  return (
    <li className={current ? 'history__item history__item--on' : 'history__item'}>
      <button type="button" className="history__open" onClick={() => actions.onOpen(saved.id)}>
        <span className="history__title">{saved.title || 'Без вопроса'}</span>
        <span className="history__meta">
          {when(saved.updated)} · {questions(saved)}
          {saved.snapshot ? ` · база ${saved.snapshot.label}` : ''}
        </span>
      </button>
      {!saved.archived && (
        <button
          type="button"
          className={saved.pinned ? 'x case__pin case__pin--on' : 'x case__pin'}
          aria-label={saved.pinned ? `Открепить «${saved.title}»` : `Закрепить «${saved.title}»`}
          aria-pressed={!!saved.pinned}
          title={saved.pinned ? 'Открепить' : 'Закрепить наверху'}
          onClick={() => actions.onPin(saved.id, !saved.pinned)}
        >
          <PinIcon size={15} />
        </button>
      )}
      <details className="case__more">
        <summary aria-label={`Действия с делом «${saved.title}»`} title="Ещё">
          ⋯
        </summary>
        <div className="case__menu">
          <button type="button" onClick={() => setRenaming(true)}>
            Переименовать
          </button>
          <button type="button" onClick={() => actions.onDuplicate(saved.id)}>
            Дублировать
          </button>
          <button type="button" onClick={() => actions.onArchive(saved.id, !saved.archived)}>
            {saved.archived ? 'Вернуть из архива' : 'В архив'}
          </button>
          <button type="button" className="case__forget" onClick={() => actions.onForget(saved.id)}>
            Удалить
          </button>
        </div>
      </details>
    </li>
  );
}

/**
 * The cases on this server (ADR 0003): what was analysed, kept on this computer — pinned on top, the archive apart,
 * found by words. Open one to read it or go on; rename, pin, copy, archive or delete it.
 */
export function CasesView({ cases, current, serverName, onClose, ...actions }: { cases: StoredConversation[]; current: string; serverName: string; onClose: () => void } & CaseActions) {
  const [query, setQuery] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const words = query.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  const found = useMemo(() => cases.filter((c) => matches(c, words)), [cases, words.join(' ')]); // eslint-disable-line react-hooks/exhaustive-deps
  const pinned = found.filter((c) => c.pinned && !c.archived);
  const open = found.filter((c) => !c.pinned && !c.archived);
  const archived = found.filter((c) => c.archived);
  const list = (items: StoredConversation[], label: string) => (
    <ul className="history__list" aria-label={label}>
      {items.map((saved) => (
        <CaseRow key={saved.id} saved={saved} current={saved.id === current} actions={actions} />
      ))}
    </ul>
  );

  return (
    <section className="history" aria-label="Дела">
      <div className="history__head">
        <h2 className="history__heading">Дела</h2>
        <span className="sp" />
        {cases.length > 0 && (
          <button className="link-btn" type="button" onClick={() => actions.onForget()}>
            Удалить все
          </button>
        )}
        <button className="x" type="button" aria-label="Закрыть дела" title="Закрыть" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </div>
      {cases.length === 0 ? (
        <div className="empty">Здесь появятся ваши разборы на сервере {serverName}</div>
      ) : (
        <>
          <input className="presets__input case__search" type="search" aria-label="Поиск по делам" placeholder="Поиск по делам" value={query} onChange={(e) => setQuery(e.target.value)} />
          {pinned.length > 0 && (
            <>
              <h3 className="case__group">Закреплённые</h3>
              {list(pinned, 'Закреплённые дела')}
            </>
          )}
          {open.length > 0 && list(open, 'Дела')}
          {!found.length && <p className="set__hint">Ничего не нашлось.</p>}
          {archived.length > 0 && (
            <>
              <button className="link-btn case__archive" type="button" aria-expanded={showArchive || words.length > 0} onClick={() => setShowArchive((shown) => !shown)}>
                Архив ({archived.length})
              </button>
              {(showArchive || words.length > 0) && list(archived, 'Архив дел')}
            </>
          )}
        </>
      )}
      <p className="set__hint">Дела хранятся только на этом компьютере: закреплённые — пока не удалите, остальные — последние 30 на каждом сервере.</p>
    </section>
  );
}
