import { useEffect, useRef } from 'react';
import { SUBJECT_LABELS, punishmentBySubject, type Article, type LawDocument, type Part } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { BackIcon, ExternalIcon } from './icons';
import { DocBadge, JurisdictionPill, Stars, formatDate } from './lawBits';

function PunishmentLines({ part }: { part: Part }) {
  if (!part.punishment) return null;
  const lines = punishmentBySubject(part.punishment);
  const labelled = lines.some((line) => line.subject !== null);
  return (
    <div className="part-card__pen">
      {lines.map((line) => (
        <p key={line.subject ?? 'all'}>
          {labelled && line.subject && <span className="part-card__who">{SUBJECT_LABELS[line.subject]}: </span>}
          {line.text}
        </p>
      ))}
      {part.punishment.additional.map((extra) => (
        <p key={extra} className="part-card__extra">
          + {extra}
        </p>
      ))}
    </div>
  );
}

export function ArticleView({
  article,
  document,
  focusPart,
  onBack,
}: {
  article: Article;
  document: LawDocument;
  /** The part the user opened the article from; it is highlighted and scrolled into view. */
  focusPart?: Part;
  onBack: () => void;
}) {
  const platform = usePlatform();
  const focusRef = useRef<HTMLElement>(null);
  const chapter = document.chapters.find((c) => c.number === article.chapter);
  const heading = `Статья ${article.number}` + (article.title ? `. ${article.title}` : '');

  useEffect(() => {
    focusRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusPart]);

  return (
    <article className="art" aria-label={heading}>
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>Результаты</span>
      </button>
      <div className="art__crumb">
        <DocBadge document={document} />
        <span>{document.title}</span>
      </div>
      {chapter && (
        <div className="art__chapter">
          Глава {chapter.number}. {chapter.title}
          {article.group && ` · ${article.group}`}
        </div>
      )}
      <h2 className="art__title">{heading}</h2>

      <div className="art__parts">
        {article.parts.map((part, i) => {
          const focused = part === focusPart;
          return part.punishment || part.jurisdiction || part.stars ? (
            <section
              key={i}
              ref={focused ? focusRef : undefined}
              className={focused ? 'part-card part-card--focus' : 'part-card'}
              aria-current={focused ? 'true' : undefined}
              aria-label={part.number ? `Часть ${part.number}` : undefined}
            >
              <div className="part-card__head">
                {part.number && <span className="part-card__num">ч. {part.number}</span>}
                <span className="sp" />
                {part.jurisdiction && <JurisdictionPill jurisdiction={part.jurisdiction} />}
                {part.stars && <Stars stars={part.stars} size={14} />}
              </div>
              <p className="part-card__text">{part.text}</p>
              <PunishmentLines part={part} />
            </section>
          ) : (
            <div key={i} className="part">
              {part.number && <span className="part__num">{part.number}.</span>}
              <div className="part__body">
                {part.text && <p>{part.text}</p>}
                {part.points.map((point, j) => (
                  <p key={j} className="part__point">
                    {point.marker}) {point.text}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {article.notes.map((note, i) => (
        <div key={i} className="note">
          <span className="note__label">{note.label}</span>
          <p>{note.text}</p>
        </div>
      ))}

      <div className="art__meta">
        <span>Актуально на {formatDate(document.source.lastEdited)}</span>
        <span>·</span>
        <button className="link" type="button" onClick={() => void platform.openExternal(document.source.url)}>
          Тема на форуме <ExternalIcon />
        </button>
      </div>
    </article>
  );
}
