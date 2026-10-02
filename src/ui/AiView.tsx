import { createContext, useContext, useEffect, useRef } from 'react';
import type { Capability } from '../account/capabilities';
import { articleLabel, articleTitle, type SearchHit, type Stage } from '../core';
import { STATUS_LABELS } from '../protocol';
import { PERSPECTIVES, type AiChat, type Perspective } from './ai';
import { AnswerView } from './AnswerView';
import type { Vote } from './feedback';
import { DebugView } from './DebugView';
import { MarkBar } from './MarkBar';
import { BackIcon, HistoryIcon, PlusIcon, SparkIcon, WarnIcon } from './icons';

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
export const EXAMPLES: Record<Perspective, string[]> = {
  citizen: [
    'У меня украли телефон из кармана — что будет вору?',
    'Сотрудник остановил меня без причины и требует показать документы — я обязан?',
    'Меня задержали — сколько могут держать и что я могу требовать?',
    'Игрок продаёт игровую валюту за реальные деньги в чате — что за это будет?',
  ],
  state: [
    'Человек в маске с электродубинкой стоит у здания МВД — что ему грозит?',
    'Задержанный просит адвоката — сотрудник обязан дать ему позвонить?',
    'Водитель проехал на красный и уехал от полиции — какие статьи?',
    'Задержанный предложил 50 000, чтобы его отпустили',
  ],
  crime: [
    'Нас взяли с оружием в машине — что светит?',
    'Сколько могут держать без адвоката?',
    'Что можно требовать при задержании?',
    'За ограбление магазина что будет по закону и по правилам сервера?',
  ],
  lawyer: [],
};

/** What the AI does for the player: analyses a situation, or writes a document about it. */
export type AiTab = 'chat' | 'document' | 'lawyer' | 'detention' | 'trainer';

/** What the AI may do for the player (`aiCapabilitiesOf`); none given — everything, as in the tests of one mode. */
export const AiAccess = createContext<ReadonlySet<Capability> | null>(null);

/** What each mode needs: checking an officer and the trainer are the state's services'. */
export const TAB_NEEDS: Record<AiTab, Capability> = {
  chat: 'ai.analysis',
  document: 'ai.documents',
  lawyer: 'ai.check',
  detention: 'ai.check',
  trainer: 'ai.practice',
};

/**
 * The head of every AI screen: its modes on the left, «start again» on the right — one row, so the thread below
 * has the room. Leaving the AI is the side column or Esc.
 */
export function AiHead({
  tab,
  onTab,
  reset,
  back,
  onHistory,
}: {
  tab: AiTab;
  onTab: (tab: AiTab) => void;
  reset?: { label: string; disabled?: boolean; onClick: () => void };
  /** Instead of the modes: the way back to the conversation this screen came from (the document). */
  back?: { label: string; onClick: () => void };
  /** The earlier conversations, in a panel over the chat. */
  onHistory?: () => void;
}) {
  return (
    <div className="ai__head">
      {back ? (
        <button className="ai__back" type="button" onClick={back.onClick}>
          <BackIcon />
          <span>{back.label}</span>
        </button>
      ) : (
        <AiTabs tab={tab} onTab={onTab} />
      )}
      <span className="sp" />
      {onHistory && (
        <button className="ai__new" type="button" aria-label="История ИИ-разборов" title="Прошлые разборы на этом сервере" onClick={onHistory}>
          <HistoryIcon />
          <span>История</span>
        </button>
      )}
      {reset && (
        <button className="ai__new" type="button" disabled={reset.disabled} onClick={reset.onClick}>
          <PlusIcon />
          <span>{reset.label}</span>
        </button>
      )}
    </div>
  );
}

/**
 * The modes of the AI for this player: the analysis; the checks of an officer's actions and the practice for the
 * state's services. A citizen or the crime has the analysis only — no tabs at all. The document is no mode: it is
 * written from an answer.
 */
const MODES: { id: AiTab; label: string; on: AiTab[] }[] = [
  { id: 'chat', label: 'Разбор', on: ['chat', 'document'] },
  { id: 'lawyer', label: 'Проверка', on: ['lawyer', 'detention'] },
  { id: 'trainer', label: 'Практика', on: ['trainer'] },
];

export function AiTabs({ tab, onTab }: { tab: AiTab; onTab: (tab: AiTab) => void }) {
  const can = useContext(AiAccess);
  const modes = MODES.filter(({ id }) => !can || can.has(TAB_NEEDS[id]));
  if (modes.length < 2) return null;
  return (
    <div className="ai__tabs tabs" role="radiogroup" aria-label="Что сделать ИИ">
      {modes.map(({ id, label, on }) => (
        <button key={id} type="button" role="radio" aria-checked={on.includes(tab)} className={on.includes(tab) ? 'tabs__btn tabs__btn--on' : 'tabs__btn'} onClick={() => !on.includes(tab) && onTab(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function AiView({
  chat,
  onBack,
  onOpen,
  onSettings,
  onTab,
  calculable,
  onCharge,
  onPinArticle,
  onCopy,
  onDraft,
  onDocument,
  onHistory,
  onMark,
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
  /** Writes a document from the case: the situation goes to the document's field. */
  onDocument: (situation: string) => void;
  /** Shows the earlier conversations. */
  onHistory: () => void;
  /** Sends the player's mark of an answer to the question before it. */
  onMark: (question: string, analysis: NonNullable<AiChat['messages'][number]['analysis']>, vote: Vote, correction?: string) => Promise<void>;
  /** Opens a page in the browser: a law's forum thread. */
  onLink: (url: string) => void;
  /** Back to the search: offered when the AI cannot answer. */
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
  // An empty chat stays at its top, with the modes in sight; a conversation follows its last message.
  useEffect(() => {
    if (chat.messages.length) void endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [chat.messages.length, last?.pending]);
  const lastQuestion = [...chat.messages].reverse().find((m) => m.role === 'user')?.text;
  const can = useContext(AiAccess);
  const canWrite = !can || can.has('ai.documents');
  // The history of decisions: what each question led to, and how firm it was.
  const decisions = chat.messages.flatMap((m, i) => {
    const asked = chat.messages[i - 1];
    const analysis = m.analysis;
    if (!analysis || analysis.answer.reply || asked?.role !== 'user') return [];
    return [{ id: m.id, question: asked.text, conclusion: analysis.case.conclusion, status: analysis.validation.status, review: analysis.validation.needsReview }];
  });

  return (
    <section className="art ai" aria-label="ИИ-разбор">
      <AiHead tab="chat" onTab={onTab} onHistory={onHistory} reset={chat.messages.length > 0 ? { label: 'Новый чат', disabled: chat.busy, onClick: chat.clear } : undefined} />

      {chat.messages.length === 0 && (
        <div className="ai__intro">
          <span className="ai__hello-icon" aria-hidden="true">
            <SparkIcon />
          </span>
          <h2 className="ai__hello">Что случилось?</h2>
          <p className="set__hint">
            Опишите ситуацию своими словами в поле внизу — ассистент найдёт нормы в законах и правилах вашего сервера и объяснит,
            что к чему. Отвечает только по базе: каждую норму можно открыть и проверить.
          </p>
          <div className="ai__examples" aria-label="Примеры вопросов">
            {EXAMPLES[chat.perspectives[0] ?? 'citizen'].map((example) => (
              <button key={example} type="button" className="ai__example" disabled={chat.busy} onClick={() => void chat.send(example)}>
                {example}
              </button>
            ))}
          </div>
          {canWrite && (
            <button className="ai__new" type="button" onClick={() => onDocument('')}>
              <PlusIcon />
              <span>Составить документ</span>
            </button>
          )}
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
        {chat.messages.map((message, index) =>
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
                <>
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
                  {chat.messages[index - 1]?.role === 'user' && (
                    <MarkBar send={(vote, correction) => onMark(chat.messages[index - 1].text, message.analysis!, vote, correction)} />
                  )}
                  {can?.has('ai.debug') && <DebugView analysis={message.analysis} classification={message.classification} />}
                </>
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
            <button type="button" className="ai__chip ai__chip--more" disabled={chat.busy} onClick={() => void chat.send('Разбери подробнее', undefined, { depth: 'full' })}>
              Подробнее
            </button>
            {canWrite && (
              <button type="button" className="ai__chip ai__chip--more" disabled={chat.busy} onClick={() => onDocument([lastQuestion, ...(chat.current?.facts ?? [])].join('. '))}>
                Составить документ
              </button>
            )}
            <span className="set__label">С точки зрения:</span>
            {PERSPECTIVES.filter((side) => chat.perspectives.includes(side.id)).map((side) => (
              <button key={side.id} type="button" className="ai__chip" disabled={chat.busy} onClick={() => void chat.send(lastQuestion, side.id)}>
                {side.label}
              </button>
            ))}
          </div>
        )}
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
            <p className="set__hint">Исправьте факт или спросите «а если…» в поле внизу — ИИ пересмотрит только то, что изменилось.</p>
          </details>
        )}
  
        <div ref={endRef} />
      </div>
    </section>
  );
}
