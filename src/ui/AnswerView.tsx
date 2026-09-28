import { useState } from 'react';
import { articleText, articleTitle, formatPunishment, formatRubles, leadPart, type DetentionResult, type SearchHit, type Stage } from '../core';
import { STATUS_LABELS, type Analysis, type CheckedNorm, type Status } from '../protocol';
import { shortLabel } from './AiView';
import { answerText } from './ai';
import { CheckIcon, ExternalIcon, PinIcon, PlusIcon, WarnIcon } from './icons';

const STAGE_LABELS = { done: '', attempt: 'покушение', preparation: 'приготовление' } as const;

/** The calculator's count in a line: «30 мес · 3 ★ · залог 150 000 ₽»; administrative fines and arrests after it. */
export function calculationLine(result: DetentionResult): string {
  const parts: string[] = [];
  const criminal = result.criminal;
  if (criminal?.mode === 'custody') {
    parts.push(`${criminal.term} мес${criminal.capped ? ' (предел)' : ''}`);
    if (criminal.bail?.amount) parts.push(`залог ${formatRubles(criminal.bail.amount)}`);
  } else if (criminal?.fineLimit) {
    parts.push(`штраф ${criminal.fineLimit.min ? `от ${formatRubles(criminal.fineLimit.min)} ` : ''}до ${formatRubles(criminal.fineLimit.max)}`);
  }
  const administrative = result.administrative;
  if (administrative?.fineTotal) parts.push(`штраф ${formatRubles(administrative.fineTotal)}`);
  if (administrative?.arrestDays) parts.push(`арест ${administrative.arrestDays} сут`);
  if (administrative) parts.push(...administrative.other);
  if (result.stars?.count) parts.push(`${result.stars.count} ★`);
  return parts.join(' · ');
}

/**
 * The analysis on a small card over the game: the gist, the articles with their punishment from the laws, the
 * calculator's total, the first step — and a warning when the checks failed.
 */
export function cardText(analysis: Analysis): string {
  const { answer, validation, calculation } = analysis;
  if (answer.reply) return answer.reply;
  const norms = validation.norms.filter((n) => n.hit && !n.issues.length).slice(0, 2);
  return [
    answer.situation && `Суть: ${answer.situation}`,
    ...norms.map(({ hit }) => {
      const part = hit!.part ?? leadPart(hit!.article);
      const label = `${shortLabel(hit!)}${hit!.part?.number ? ` ч. ${hit!.part.number}` : ''}`;
      return part?.punishment ? `${label} — ${formatPunishment(part.punishment)}` : `${label} «${articleTitle(hit!.article)}»`;
    }),
    calculation && calculationLine(calculation.result) && `Итог: ${calculationLine(calculation.result)}`,
    answer.procedure[0] && `Что делать: ${answer.procedure[0]}`,
    validation.needsReview ? '⚠ Часть ответа не подтвердилась — проверьте статьи' : '',
    validation.status === 'not-found' ? 'В законах сервера подтверждения не найдено' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function StatusBadge({ status, review }: { status: Status; review: boolean }) {
  return (
    <div className="verdict-row">
      <span className={`status status--${status}`}>
        {status === 'confirmed' ? <CheckIcon size={14} /> : <WarnIcon size={14} />}
        {STATUS_LABELS[status]}
      </span>
      {review && <span className="status status--review">Требует проверки</span>}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="answer__block">
      <div className="answer__title">{title}</div>
      {children}
    </div>
  );
}

/** A found article the answer stands on: what it is, why it applies, its punishment from the laws themselves. */
function SourceCard({
  checked,
  onOpen,
  onCharge,
  onPin,
  onLink,
  chargeable,
}: {
  checked: CheckedNorm;
  onOpen: (hit: SearchHit) => void;
  onCharge?: (hit: SearchHit) => void;
  onPin: (hit: SearchHit) => void;
  /** Opens the document's forum thread: where the law is published. */
  onLink: (url: string) => void;
  chargeable: boolean;
}) {
  const { norm, hit, issues } = checked;
  if (!hit) {
    return (
      <li className="source source--bad">
        <div className="source__head">
          <b>{norm.ref || norm.source}</b>
          <span className="status status--not-found">Нет в базе</span>
        </div>
        {issues.map((issue) => (
          <p key={issue} className="source__issue">
            {issue}
          </p>
        ))}
      </li>
    );
  }
  const part = hit.part ?? leadPart(hit.article);
  const punishment = part?.punishment ? formatPunishment(part.punishment) : '';
  return (
    <li className={issues.length ? 'source source--bad' : 'source'}>
      <div className="source__head">
        <button type="button" className="ai__cite source__label" title="Открыть статью" onClick={() => onOpen(hit)}>
          {shortLabel(hit)}
          {hit.part?.number ? ` ч. ${hit.part.number}` : ''}
        </button>
        <span className="source__name">{articleTitle(hit.article)}</span>
        {norm.fit === 'partial' && <span className="status status--likely">если подтвердится</span>}
        {norm.stage !== 'done' && <span className="status">{STAGE_LABELS[norm.stage]}</span>}
      </div>
      <span className="source__doc">{hit.document.title}</span>
      {norm.why && <p className="source__why">{norm.why}</p>}
      {punishment && (
        <p className="source__punishment">
          <span className="demand__label">По базе:</span> {punishment}
        </p>
      )}
      {issues.map((issue) => (
        <p key={issue} className="source__issue">
          <WarnIcon size={13} /> {issue}
        </p>
      ))}
      <details className="source__text">
        <summary>Текст статьи</summary>
        <p>{articleText(hit.article)}</p>
      </details>
      <div className="source__actions">
        <button type="button" className="chip-btn" onClick={() => onOpen(hit)}>
          Открыть статью
        </button>
        {chargeable && onCharge && (
          <button type="button" className="chip-btn" onClick={() => onCharge(hit)}>
            <PlusIcon size={13} /> В калькулятор
          </button>
        )}
        <button type="button" className="chip-btn" onClick={() => onPin(hit)}>
          <PinIcon size={13} /> Закрепить
        </button>
        {hit.document.source?.url && (
          <button type="button" className="chip-btn" title="Тема закона на форуме" onClick={() => onLink(hit.document.source.url)}>
            <ExternalIcon size={13} /> Источник
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * The analysis laid out in blocks: the status from the checks, the situation, the articles as cards, what is broken,
 * the punishment as the articles write it and as the calculator counts it, the procedure, what is uncertain, and
 * the questions whose answers would change it.
 */
export function AnswerView({
  analysis,
  busy,
  calculable,
  onOpen,
  onCharge,
  onPinArticle,
  onCopy,
  onClarify,
  onLink,
}: {
  analysis: Analysis;
  busy: boolean;
  /** Documents the calculator counts: their articles can go into it. */
  calculable: string[];
  onOpen: (hit: SearchHit) => void;
  onCharge: (hits: (SearchHit & { stage?: Stage })[]) => void;
  onPinArticle: (hit: SearchHit) => void;
  onCopy: (text: string) => Promise<void>;
  onClarify: (text: string) => void;
  onLink: (url: string) => void;
}) {
  const { answer, validation, calculation } = analysis;
  const [copied, setCopied] = useState<'answer' | 'charge' | null>(null);
  const copy = (what: 'answer' | 'charge', text: string) =>
    void onCopy(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    });
  if (answer.reply) return <p className="ai__line">{answer.reply}</p>;
  const chargeHits = (calculation?.charges ?? []).map((c) => ({ article: c.article, document: c.document, part: c.part, stage: c.stage }));

  return (
    <div className="answer">
      <StatusBadge status={validation.status} review={validation.needsReview} />
      {validation.needsReview && (
        <div className="warn" role="alert">
          <WarnIcon />
          <span>Часть ответа не подтвердилась по законам сервера — откройте статьи и проверьте, прежде чем применять.</span>
        </div>
      )}

      {answer.situation && (
        <Block title="Ситуация">
          <p className="ai__line">{answer.situation}</p>
        </Block>
      )}

      {validation.norms.length > 0 && (
        <Block title="Применимые нормы">
          <ul className="sources">
            {validation.norms.map((checked, i) => (
              <SourceCard
                key={`${checked.norm.source}-${i}`}
                checked={checked}
                onOpen={onOpen}
                onCharge={(hit) => onCharge([{ ...hit, stage: checked.norm.stage }])}
                onPin={onPinArticle}
                onLink={onLink}
                chargeable={!!checked.hit && calculable.includes(checked.hit.document.id) && !checked.issues.length}
              />
            ))}
          </ul>
        </Block>
      )}

      {answer.violation && (
        <Block title="Нарушение">
          <p className="ai__line">{answer.violation}</p>
        </Block>
      )}

      {(answer.punishment || calculation) && (
        <Block title="Наказание">
          {answer.punishment && <p className="ai__line">{answer.punishment}</p>}
          {calculation && (
            <div className="answer__calc">
              <span className="demand__label">Калькулятор:</span> <b>{calculationLine(calculation.result) || '—'}</b>
              <span className="answer__charge">{calculation.result.charge}</span>
              <button type="button" className="chip-btn" onClick={() => onCharge(chargeHits)}>
                <PlusIcon size={13} /> Открыть в калькуляторе
              </button>
              {calculation.result.charge && (
                <button type="button" className="chip-btn" onClick={() => copy('charge', calculation.result.charge)}>
                  {copied === 'charge' ? 'Скопировано' : 'Скопировать обвинение'}
                </button>
              )}
            </div>
          )}
        </Block>
      )}

      {answer.procedure.length > 0 && (
        <Block title="Процедура">
          <ol className="answer__list">
            {answer.procedure.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Block>
      )}

      {(answer.uncertainty.length > 0 || answer.assumptions.length > 0) && (
        <Block title="Неопределённость">
          <ul className="answer__list">
            {answer.assumptions.map((item) => (
              <li key={`a-${item}`}>Допущено: {item}</li>
            ))}
            {answer.uncertainty.map((item) => (
              <li key={`u-${item}`}>{item}</li>
            ))}
          </ul>
        </Block>
      )}

      {answer.questions.length > 0 && (
        <Block title="Уточните">
          {answer.questions.map((q) => (
            <div key={q.question} className="clarify">
              <p className="ai__line">{q.question}</p>
              <div className="ai__chips">
                {q.options.map((option) => (
                  <button key={option} type="button" className="ai__chip" disabled={busy} onClick={() => onClarify(`${q.question} — ${option}`)}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Block>
      )}

      {validation.status === 'not-found' && (
        <p className="set__hint">В доступной базе законов подтверждения не найдено. Попробуйте поиск по законам — другими словами или по номеру статьи.</p>
      )}

      {analysis.sources.length > 0 && (
        <details className="ai__sources">
          <summary>Статьи, которые видел ИИ: {analysis.sources.length}</summary>
          <div className="ai__chips">
            {analysis.sources.map(({ id, hit }) => (
              <button key={id} type="button" className="ai__chip" title={hit.article.title || hit.document.title} onClick={() => onOpen(hit)}>
                {shortLabel(hit)}
              </button>
            ))}
          </div>
        </details>
      )}

      <div className="source__actions">
        <button
          type="button"
          className="chip-btn"
          onClick={() => copy('answer', answerText(answer))}
        >
          {copied === 'answer' ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>
    </div>
  );
}
