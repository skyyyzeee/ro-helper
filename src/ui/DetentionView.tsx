import { useState } from 'react';
import type { SearchHit } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { AiHead, citedIn, type AiTab } from './AiView';
import type { DetentionCheck, DetentionReview, StepVerdict } from './detention';
import { CheckIcon, WarnIcon } from './icons';

const VERDICTS: Record<StepVerdict, { title: string; className: string }> = {
  ok: { title: 'По закону', className: 'demand--lawful' },
  violation: { title: 'Нарушение', className: 'demand--unlawful' },
  unclear: { title: 'В законах сервера не нашлось', className: 'demand--unclear' },
};

/** A text that names an article of the sources opens it; any other is plain. */
function Cited({ text, sources, onOpen }: { text: string; sources: SearchHit[]; onOpen: (hit: SearchHit) => void }) {
  const cited = citedIn(text, sources);
  return cited ? (
    <button type="button" className="ai__cite" title="Открыть статью" onClick={() => onOpen(cited)}>
      {text}
    </button>
  ) : (
    <>{text}</>
  );
}

/** The review as plain text: for a report to the academy or a note to oneself. */
export function reviewText(review: DetentionReview): string {
  const lines = ['Разбор задержания', `Со слов сотрудника: ${review.said}`, ''];
  for (const s of review.steps) {
    lines.push(`• ${s.step} — ${VERDICTS[s.verdict].title}`);
    if (s.basis) lines.push(`  Основание: ${s.basis}`);
    if (s.fix) lines.push(`  Как надо: ${s.fix}`);
  }
  if (review.missed.length) {
    lines.push('', 'Не сделано:');
    for (const m of review.missed) lines.push(`• ${m.what}${m.basis ? ` — ${m.basis}` : ''}`);
  }
  if (review.summary) lines.push('', `Вывод: ${review.summary}`);
  return lines.join('\n');
}

/**
 * «Разбор задержания» (issue #4): the officer tells how a detention went, and each step is checked against the
 * server's laws — right, a violation, or not in the laws — with what was missed and a summary.
 */
export function DetentionView({
  detention,
  onOpen,
  onTab,
}: {
  detention: DetentionCheck;
  onOpen: (hit: SearchHit) => void;
  onTab: (tab: AiTab) => void;
}) {
  const platform = usePlatform();
  const [copied, setCopied] = useState(false);
  const result = detention.result;
  const right = result?.steps.filter((s) => s.verdict === 'ok').length ?? 0;
  const wrong = result?.steps.filter((s) => s.verdict === 'violation').length ?? 0;

  return (
    <section className="art ai lawyer" aria-label="Разбор задержания">
      <AiHead tab="detention" onTab={onTab} reset={result ? { label: 'Новая проверка', disabled: detention.busy, onClick: detention.reset } : undefined} />
      <div className="ai__chips" role="radiogroup" aria-label="Что проверить">
        {(
          [
            ['lawyer', 'Требования адвоката'],
            ['detention', 'Ход задержания'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={id === 'detention'} className={id === 'detention' ? 'ai__chip ai__chip--on' : 'ai__chip'} onClick={() => id !== 'detention' && onTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {!result && !detention.busy && !detention.error && (
        <>
          <p className="set__hint">
            После задержания расскажите в поле внизу (или голосом 🎤), что вы делали и в каком порядке, и нажмите <b>Enter</b>. ИИ
            проверит каждый шаг по законам сервера: что сделано по закону, где нарушение и как надо было, — и что вы пропустили. Это
            самопроверка: ничего не записывается, разбор видите только вы.
          </p>
          <div className="ai__examples" aria-label="Пример">
            <span className="set__label">Попробуйте:</span>
            <button
              type="button"
              className="ai__example"
              onClick={() =>
                void detention.review(
                  'Остановил подозреваемого в краже, представился, надел наручники, обыскал без понятых, отвёз в отдел, адвоката дал через 40 минут, протокол составил в конце',
                )
              }
            >
              Остановил подозреваемого в краже, представился, надел наручники, обыскал без понятых, отвёз в отдел, адвоката дал через 40 минут,
              протокол составил в конце
            </button>
          </div>
        </>
      )}

      {detention.busy && (
        <div className="ai__pending" role="status">
          <span className="ai__dots" aria-hidden="true" />
          Сверяю ваши действия с законами…
        </div>
      )}

      {detention.error && (
        <div className="warn" role="alert">
          <WarnIcon />
          <span>{detention.error}</span>
        </div>
      )}

      {result && !detention.busy && (
        <>
          <p className="set__hint doc__situation">Со слов сотрудника: «{result.said}»</p>
          <p className="quiz__question">
            По закону: {right} из {result.steps.length}
            {wrong > 0 && ` · нарушений: ${wrong}`}
            {result.missed.length > 0 && ` · не сделано: ${result.missed.length}`}
          </p>
          {result.summary && <p className="set__hint">{result.summary}</p>}
          <ul className="demands" aria-label="Шаги задержания">
            {result.steps.map((s, i) => (
              <li key={i} className={`demand ${VERDICTS[s.verdict].className}`}>
                <div className="demand__head">
                  <span className="demand__verdict">{VERDICTS[s.verdict].title}</span>
                  <b className="demand__what">{s.step}</b>
                </div>
                {s.basis && (
                  <p className="demand__row">
                    <span className="demand__label">Основание:</span> <Cited text={s.basis} sources={result.sources} onOpen={onOpen} />
                  </p>
                )}
                {s.fix && (
                  <p className="demand__row">
                    <span className="demand__label">Как надо:</span> {s.fix}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {result.missed.length > 0 && (
            <>
              <span className="demand__label">Не сделано</span>
              <ul className="demands" aria-label="Не сделано">
                {result.missed.map((m, i) => (
                  <li key={i} className="demand demand--partly">
                    <div className="demand__head">
                      <b className="demand__what">{m.what}</b>
                    </div>
                    {m.basis && (
                      <p className="demand__row">
                        <span className="demand__label">Основание:</span> <Cited text={m.basis} sources={result.sources} onOpen={onOpen} />
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            className="btn btn--primary doc__copy"
            type="button"
            onClick={() =>
              void platform.writeClipboard(reviewText(result)).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? (
              <>
                <CheckIcon size={16} /> Скопировано
              </>
            ) : (
              'Скопировать разбор'
            )}
          </button>
          <p className="set__hint">ИИ может ошибиться: откройте статьи по ссылкам. Нарушение показывается, только если его подтверждает статья законов сервера.</p>
        </>
      )}
    </section>
  );
}
