import { useEffect, useRef } from 'react';
import { articleLabel, articleTitle, type SearchHit, type Stage } from '../core';
import { STATUS_LABELS } from '../protocol';
import { PERSPECTIVES, type AiChat } from './ai';
import { AnswerView } from './AnswerView';
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
export type AiTab = 'chat' | 'document' | 'lawyer' | 'detention' | 'trainer';

/** The two things the AI does, as the heading of its screen. */
export function AiTabs({ tab, onTab }: { tab: AiTab; onTab: (tab: AiTab) => void }) {
  return (
    <div className="ai__tabs tabs" role="radiogroup" aria-label="Что сделать ИИ">
      {(
        [
          ['chat', 'Разбор ситуации'],
          ['document', 'Составить документ'],
          ['lawyer', 'Требования адвоката'],
          ['detention', 'Разбор задержания'],
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

export function AiView({
  chat,
  backLabel,
  onBack,
  onOpen,
  onSettings,
  onTab,
  calculable,
  onCharge,
  onPinArticle,
  onCopy,
  onDraft,
  onLink,
}: {
  chat: AiChat;
  /** Documents the calculator counts. */
  calculable: string[];
  /** Puts articles into the calculator and shows it. */
  onCharge: (hits: (SearchHit & { stage?: Stage })[]) => void;
  onPinArticle: (hit: SearchHit) => void;
  onCopy: (text: string) => Promise<void>;
  /** Puts a text into the question field, to finish and send: a correction of a fact. */
  onDraft: (text: string) => void;
  /** Opens a page in the browser: a law's forum thread. */
  onLink: (url: string) => void;
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
  // The history of decisions: what each question led to, and how firm it was.
  const decisions = chat.messages.flatMap((m, i) => {
    const asked = chat.messages[i - 1];
    const analysis = m.analysis;
    if (!analysis || analysis.answer.reply || asked?.role !== 'user') return [];
    return [{ id: m.id, question: asked.text, conclusion: analysis.case.conclusion, status: analysis.validation.status, review: analysis.validation.needsReview }];
  });

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
      <div className="ai__depth" role="radiogroup" aria-label="Где искать ответ">
        {(
          [
            ['auto', 'Авто', 'Ассистент сам определит: закон или правила сервера'],
            ['law', 'Законы', 'Только законы, кодексы и уставы сервера'],
            ['server_rule', 'Правила сервера', 'Только правила проекта и сервера'],
          ] as const
        ).map(([id, label, title]) => (
          <button key={id} type="button" role="radio" aria-checked={chat.choice === id} title={title} className={chat.choice === id ? 'chip-btn chip-btn--on' : 'chip-btn'} onClick={() => chat.setChoice(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="ai__depth" role="radiogroup" aria-label="Глубина разбора">
        {(
          [
            ['quick', 'Быстрый разбор', 'Статья → нарушение → наказание → источник'],
            ['full', 'Полный разбор', 'Факты → нормы → альтернативы → процедура → расчёт; дольше'],
          ] as const
        ).map(([id, label, title]) => (
          <button key={id} type="button" role="radio" aria-checked={chat.depth === id} title={title} className={chat.depth === id ? 'chip-btn chip-btn--on' : 'chip-btn'} onClick={() => chat.setDepth(id)}>
            {label}
          </button>
        ))}
      </div>
      {chat.current && chat.current.facts.length > 0 && (
        <details className="ai__facts">
          <summary>Факты дела: {chat.current.facts.length}</summary>
          <ul className="answer__list">
            {chat.current.facts.map((fact) => (
              <li key={fact} className={/\(изменено\)\s*$/.test(fact) ? 'fact fact--changed' : 'fact'}>
                {fact}{' '}
                <button
                  className="link"
                  type="button"
                  aria-label={`Исправить факт: ${fact}`}
                  disabled={chat.busy}
                  onClick={() => onDraft(`Поправка: не «${fact.replace(/\s*\(изменено\)\s*$/, '')}», а `)}
                >
                  исправить
                </button>
              </li>
            ))}
          </ul>
          {chat.current.norms.length > 0 && <p className="set__hint">Статьи: {chat.current.norms.join(', ')}</p>}
          {decisions.length > 1 && (
            <>
              <div className="answer__title">История решений</div>
              <ol className="answer__list">
                {decisions.map((d) => (
                  <li key={d.id}>
                    <span className="decision__question">{d.question}</span> → {d.conclusion || '—'}{' '}
                    <span className={`status status--${d.status}`}>{STATUS_LABELS[d.status]}</span>
                    {d.review && <span className="status status--review">Требует проверки</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
          <p className="set__hint">Исправьте факт или спросите «а если…» в поле сверху — ИИ пересмотрит только то, что изменилось.</p>
        </details>
      )}

      {chat.messages.length === 0 && (
        <div className="ai__intro">
          <p className="set__hint">
            Опишите ситуацию своими словами в поле сверху и нажмите <b>Enter</b>. Ассистент найдёт нормы в законах и правилах
            вашего сервера, а ИИ объяснит, что к чему. Он опирается только на найденное в базе — каждую норму можно открыть и
            проверить; чего в базе нет, того он не придумает.
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
            Бесплатно, с дневным лимитом вопросов. Откуда берутся ответы — в{' '}
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
              <span>
                {message.text} ИИ сейчас недоступен — вы можете продолжить{' '}
                <button className="link" type="button" onClick={onBack}>
                  поиск по законам
                </button>
                , он работает и без ИИ.
              </span>
            </div>
          ) : (
            <div key={message.id} className="ai__reply">
              {message.analysis ? (
                <AnswerView
                  analysis={message.analysis}
                  busy={chat.busy}
                  calculable={calculable}
                  onOpen={onOpen}
                  onCharge={onCharge}
                  onPinArticle={onPinArticle}
                  onCopy={onCopy}
                  onLink={onLink}
                  onClarify={(text) => void chat.send(text)}
                />
              ) : (
                <>
                  <p className="ai__line">{message.text}</p>
                  {/* The app's own answer: what the search found for an article number, or «закон или правила?». */}
                  {message.system?.hits && message.system.hits.length > 0 && (
                    <div className="ai__chips">
                      {message.system.hits.map((hit) => (
                        <button key={hit.article.id} type="button" className="ai__chip" onClick={() => onOpen(hit)}>
                          {shortLabel(hit)} {articleTitle(hit.article)}
                        </button>
                      ))}
                    </div>
                  )}
                  {message.system?.options && message.system.question && (
                    <div className="ai__chips">
                      {message.system.options.map((option) => (
                        <button
                          key={option.choice}
                          type="button"
                          className="ai__chip"
                          disabled={chat.busy}
                          onClick={() => void chat.send(message.system!.question!, undefined, { choice: option.choice })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ),
        )}
        {last?.role === 'ai' && !last.pending && !last.failed && !last.system && lastQuestion && (
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
