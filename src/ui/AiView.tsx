import { useEffect, useRef, type ReactNode } from 'react';
import { articleLabel, type SearchHit } from '../core';
import { PERSPECTIVES, type AiChat, type AiMessage } from './ai';
import { BackIcon, WarnIcon } from './icons';

/** «УК ст. 65» — how an answer names an article, without its title. */
export const shortLabel = (hit: SearchHit) => `${hit.document.short} ${articleLabel(hit.article, undefined, hit.document.unit)}`;

/** The source a line of the answer cites, if it names one; the longest label first, so «ст. 65.1» is not taken for «ст. 65». */
export function citedIn(line: string, sources: SearchHit[]): SearchHit | undefined {
  const byLength = [...sources].sort((a, b) => shortLabel(b).length - shortLabel(a).length);
  return byLength.find((hit) => {
    const label = shortLabel(hit);
    const at = line.indexOf(label);
    return at >= 0 && !/^\.?\d/.test(line.slice(at + label.length));
  });
}

/** Questions to try the AI with the first time: situations players meet, on laws every server has. */
export const EXAMPLES = [
  'Человек в маске с электродубинкой стоит у здания МВД — что ему грозит?',
  'Сотрудник остановил меня без причины и требует показать документы — я обязан?',
  'Какое наказание за кражу телефона у прохожего?',
  'Задержанный просит адвоката — сотрудник обязан дать ему позвонить?',
  'Водитель проехал на красный и уехал от полиции — какие статьи?',
  'Игрок продаёт игровую валюту за реальные деньги в чате — что за это будет?',
];

/** What the AI does for the player: analyses a situation, or writes a document about it. */
export type AiTab = 'chat' | 'document' | 'lawyer' | 'trainer';

/** The two things the AI does, as the heading of its screen. */
export function AiTabs({ tab, onTab }: { tab: AiTab; onTab: (tab: AiTab) => void }) {
  return (
    <div className="ai__tabs tabs" role="radiogroup" aria-label="Что сделать ИИ">
      {(
        [
          ['chat', 'Разбор ситуации'],
          ['document', 'Составить документ'],
          ['lawyer', 'Требования адвоката'],
          ['trainer', 'Тренажёр'],
        ] as const
      ).map(([id, label]) => (
        <button key={id} type="button" role="radio" aria-checked={tab === id} className={tab === id ? 'tabs__btn tabs__btn--on' : 'tabs__btn'} onClick={() => onTab(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const SECTION = /^(Суть|Статьи|Статья|Детали)\s*:\s*/i;

/** The answer as the AI wrote it: its sections in bold, and every line citing a found article opens that article. */
function Answer({ message, onOpen }: { message: AiMessage; onOpen: (hit: SearchHit) => void }) {
  const sources = message.sources ?? [];
  const lines = message.text.split('\n').map((line) => line.replace(/\*\*/g, '').trim()).filter(Boolean);
  return (
    <div className="ai__answer">
      {lines.map((line, i) => {
        const section = line.match(SECTION);
        const rest = section ? line.slice(section[0].length) : line.replace(/^[-•*]\s+/, '');
        const cited = citedIn(rest, sources);
        const body: ReactNode = cited ? (
          <button type="button" className="ai__cite" title="Открыть статью" onClick={() => onOpen(cited)}>
            {rest}
          </button>
        ) : (
          rest
        );
        if (section) {
          return (
            <p key={i} className="ai__line">
              <b className="ai__section">{section[1]}</b>
              {rest && <> {body}</>}
            </p>
          );
        }
        return (
          <p key={i} className={/^[-•*]\s+/.test(line) ? 'ai__line ai__line--item' : 'ai__line'}>
            {body}
          </p>
        );
      })}
    </div>
  );
}

export function AiView({
  chat,
  backLabel,
  onBack,
  onOpen,
  onSettings,
  onTab,
}: {
  chat: AiChat;
  backLabel: string;
  onBack: () => void;
  /** Opens a found article, as from the search. */
  onOpen: (hit: SearchHit) => void;
  onSettings: () => void;
  /** Switches between the analysis and writing a document. */
  onTab: (tab: AiTab) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const last = chat.messages.at(-1);
  // Braces: newer browsers return a promise from scrolling, and an effect may return only its clean-up.
  useEffect(() => {
    void endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [chat.messages.length, last?.pending]);
  const lastQuestion = [...chat.messages].reverse().find((m) => m.role === 'user')?.text;

  return (
    <section className="art ai" aria-label="ИИ-разбор">
      <div className="ai__top">
        <button className="back" type="button" onClick={onBack}>
          <BackIcon />
          <span>{backLabel}</span>
        </button>
        <span className="sp" />
        {chat.messages.length > 0 && (
          <button className="link-btn" type="button" disabled={chat.busy} onClick={chat.clear}>
            Новый разбор
          </button>
        )}
      </div>
      <AiTabs tab="chat" onTab={onTab} />

      {chat.messages.length === 0 && (
        <div className="ai__intro">
          <p className="set__hint">
            Опишите ситуацию своими словами в поле сверху и нажмите <b>Enter</b>. ИИ найдёт статьи в законах сервера и объяснит,
            что к чему. Он опирается только на найденные статьи — по ссылке каждую можно открыть и проверить.
          </p>
          <div className="ai__examples" aria-label="Примеры вопросов">
            <span className="set__label">Попробуйте:</span>
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="ai__example" disabled={chat.busy} onClick={() => void chat.send(example)}>
                {example}
              </button>
            ))}
          </div>
          <p className="set__hint">
            Ответы даёт Gemini с вашим ключом (или сервер ИИ, если он настроен) — это в{' '}
            <button className="link" type="button" onClick={onSettings}>
              настройках
            </button>
            .
          </p>
        </div>
      )}

      <div className="ai__messages" role="log" aria-live="polite">
        {chat.messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="ai__question">
              {message.perspective && <span className="ai__side">{PERSPECTIVES.find((p) => p.id === message.perspective)?.label}</span>}
              {message.text}
            </div>
          ) : message.pending ? (
            <div key={message.id} className="ai__pending" role="status">
              <span className="ai__dots" aria-hidden="true" />
              Ищу статьи и разбираю ситуацию…
            </div>
          ) : message.failed ? (
            <div key={message.id} className="warn" role="alert">
              <WarnIcon />
              <span>{message.text}</span>
            </div>
          ) : (
            <div key={message.id} className="ai__reply">
              <Answer message={message} onOpen={onOpen} />
              {message.sources && message.sources.length > 0 && (
                <details className="ai__sources">
                  <summary>Статьи, которые видел ИИ: {message.sources.length}</summary>
                  <div className="ai__chips">
                    {message.sources.map((hit) => (
                      <button key={hit.article.id} type="button" className="ai__chip" title={hit.article.title || hit.document.title} onClick={() => onOpen(hit)}>
                        {shortLabel(hit)}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ),
        )}
        {last?.role === 'ai' && !last.pending && !last.failed && lastQuestion && (
          <div className="ai__sides" aria-label="Разобрать с другой стороны">
            <span className="set__label">С точки зрения:</span>
            {PERSPECTIVES.map((side) => (
              <button key={side.id} type="button" className="ai__chip" disabled={chat.busy} onClick={() => void chat.send(lastQuestion, side.id)}>
                {side.label}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}
