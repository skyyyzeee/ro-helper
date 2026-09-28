import type { StoredConversation } from './ai';
import { BackIcon, CloseIcon } from './icons';

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

/** «2 вопроса»: how many questions a conversation has. */
function questions(conversation: StoredConversation): string {
  const n = conversation.messages.filter((m) => m.role === 'user').length;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} вопрос`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} вопроса`;
  return `${n} вопросов`;
}

/** Earlier conversations with the AI on this server: open one to read it or go on, or forget it. */
export function HistoryView({
  history,
  serverName,
  onOpen,
  onForget,
  onBack,
  backLabel,
}: {
  history: StoredConversation[];
  serverName: string;
  onOpen: (id: string) => void;
  onForget: (id?: string) => void;
  onBack: () => void;
  backLabel: string;
}) {
  return (
    <section className="art history" aria-label="История ИИ-разборов">
      <div className="ai__top">
        <button className="back" type="button" onClick={onBack}>
          <BackIcon />
          <span>{backLabel}</span>
        </button>
        <span className="sp" />
        {history.length > 0 && (
          <button className="link-btn" type="button" onClick={() => onForget()}>
            Очистить историю
          </button>
        )}
      </div>
      <h2 className="art__title">История ИИ-разборов</h2>
      {history.length === 0 ? (
        <div className="empty">Здесь появятся ваши вопросы ИИ на сервере {serverName}</div>
      ) : (
        <ul className="history__list">
          {history.map((conversation) => (
            <li key={conversation.id} className="history__item">
              <button type="button" className="history__open" onClick={() => onOpen(conversation.id)}>
                <span className="history__title">{conversation.title || 'Без вопроса'}</span>
                <span className="history__meta">
                  {when(conversation.updated)} · {questions(conversation)}
                </span>
              </button>
              <button
                type="button"
                className="x"
                aria-label={`Удалить разбор «${conversation.title}»`}
                title="Удалить из истории"
                onClick={() => onForget(conversation.id)}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="set__hint">История хранится только на этом компьютере — последние 30 разборов на каждом сервере.</p>
    </section>
  );
}
