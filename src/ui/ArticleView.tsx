import { useEffect, useRef, useState } from 'react';
import { SUBJECT_LABELS, articleHeading, chapterHeading, isPenaltyNote, penalParts, pointLabel, punishmentBySubject, type Article, type LawDocument, type Part } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { BackIcon, CheckIcon, ExternalIcon, FavoriteIcon, PinIcon } from './icons';
import { DocBadge, JurisdictionPill, Stars, formatDate, jurisdictionText, starsHint } from './lawBits';
import { entryPart } from './saved';

/** The punishment in one line with its stars: «★★★ штраф до 50 000 ₽ либо 30 мес» — each fact once. */
function PunishmentLines({ part }: { part: Part }) {
  if (!part.punishment) return null;
  const lines = punishmentBySubject(part.punishment);
  const labelled = lines.some((line) => line.subject !== null);
  return (
    <div className="part-card__pen">
      {lines.map((line, i) => (
        <p key={line.subject ?? 'all'}>
          {i === 0 && part.stars && (
            <span className="part-card__stars">
              <Stars stars={part.stars} size={13} />
            </span>
          )}
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

export interface ArticleViewProps {
  article: Article;
  document: LawDocument;
  /** The part the user opened the article from; it is highlighted and scrolled into view. */
  focusPart?: Part;
  /** Where «←» and Esc go back to: «Результаты» or «Избранное и недавние». */
  backLabel: string;
  onBack: () => void;
  /** Months a star stands for, where it does (the criminal code). */
  monthsPerStar?: number;
  /** For an article that can go into the calculator: whether a part of it is there, and adding or taking it out. */
  calculator?: { has: (part?: Part) => boolean; toggle: (part?: Part) => void };
  favorite: boolean;
  onFavorite: () => void;
  /** Whether this part is already pinned over the game: the button then unpins it. */
  pinned: boolean;
  onPin: () => void;
  /** When a recent update changed the article: its date, and the «было → стало» view. */
  changed?: { date: string; onOpen: () => void };
  /** A part chosen by a click: the calculator's button and Enter act on it. */
  onFocusPart?: (part: Part) => void;
}

export function ArticleView({
  article,
  document,
  focusPart,
  backLabel,
  onBack,
  monthsPerStar,
  calculator,
  favorite,
  onFavorite,
  pinned,
  onPin,
  changed,
  onFocusPart,
}: ArticleViewProps) {
  const platform = usePlatform();
  const focusRef = useRef<HTMLElement>(null);
  const chapter = document.chapters.find((c) => c.number === article.chapter);
  const heading = articleHeading(article, document.unit);
  // The part the calculator's button is on: the one chosen, or the article's only punished one.
  const punished = penalParts(article);
  const chosen = entryPart(article, focusPart) ?? (punished.length === 1 ? punished[0] : undefined);
  // «Подробнее»: the chapter, who investigates each part, what its stars stand for — not needed on every look.
  const [details, setDetails] = useState(false);

  useEffect(() => {
    focusRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusPart]);

  return (
    <article className="art" aria-label={heading}>
      <div className="art__top">
        <button className="back" type="button" onClick={onBack}>
          <BackIcon />
          <span>{backLabel}</span>
        </button>
        <span className="art__crumb" title={document.title}>
          <DocBadge document={document} />
          {/* A point with no title of its own (ПДД) is told by its chapter: there the chapter stays whole. */}
          {chapter && <span>{article.title ? `гл. ${chapter.number}` : chapterHeading(chapter)}</span>}
        </span>
        <span className="sp" />
        <button className={details ? 'art__more art__more--on' : 'art__more'} type="button" aria-pressed={details} onClick={() => setDetails(!details)}>
          Подробнее
        </button>
      </div>
      {details && (
        <div className="art__chapter">
          {document.title}
          {chapter && ` · ${chapterHeading(chapter)}`}
          {article.group && ` · ${article.group}`}
        </div>
      )}
      <h2 className="art__title">{heading}</h2>
      {changed && (
        <button className="art__changed" type="button" onClick={changed.onOpen}>
          <span className="chg chg--changed">Изменено {formatDate(changed.date)}</span>
          <span>было → стало</span>
        </button>
      )}

      <div className="art__parts">
        {article.parts.map((part, i) => {
          const focused = part === focusPart;
          if (!part.punishment && !part.jurisdiction && !part.stars) {
            return (
              <div key={i} className="part">
                {part.number && <span className="part__num">{part.number}.</span>}
                <div className="part__body">
                  {part.text && <p>{part.text}</p>}
                  {part.points.map((point, j) => (
                    <p key={j} className="part__point">
                      <span className="part__marker">{pointLabel(point)}</span> {point.text}
                    </p>
                  ))}
                </div>
              </div>
            );
          }
          const added = calculator?.has(part) ?? false;
          const on = part === chosen;
          const partName = part.number ? `ч. ${part.number} ` : '';
          return (
            <section
              key={i}
              ref={focused ? focusRef : undefined}
              className={on ? 'part-card part-card--focus' : 'part-card'}
              aria-current={focused ? 'true' : undefined}
              aria-label={part.number ? `Часть ${part.number}` : undefined}
              onClick={() => part.punishment && part !== chosen && onFocusPart?.(part)}
            >
              <div className="part-card__row">
                {part.number && <span className="part-card__num">{part.number}.</span>}
                <div className="part-card__body">
                  <p className="part-card__text">{part.text}</p>
                  {part.points.map((point, j) => (
                    <p key={j} className="part__point">
                      <span className="part__marker">{pointLabel(point)}</span> {point.text}
                    </p>
                  ))}
                  <PunishmentLines part={part} />
                  {!part.punishment && part.stars && <p className="part-card__meta">{starsHint(part.stars, monthsPerStar)}</p>}
                  {details && (part.jurisdiction || (part.stars && part.punishment)) && (
                    <div className="part-card__tags">
                      {part.jurisdiction && (
                        <span className="tag-group">
                          <JurisdictionPill jurisdiction={part.jurisdiction} />
                          <span>{jurisdictionText(part.jurisdiction)}</span>
                        </span>
                      )}
                      {part.stars && part.punishment && (
                        <span className="tag-group">
                          <Stars stars={part.stars} size={14} />
                          <span>{starsHint(part.stars, monthsPerStar)}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {calculator && part.punishment && (on || added) && (
                <div className="part-card__actions">
                  {on ? (
                    <button
                      className={added ? 'btn btn--sm' : 'btn btn--sm btn--primary'}
                      type="button"
                      aria-pressed={added}
                      aria-label={added ? `Убрать ${partName}из калькулятора` : `Добавить ${partName}в калькулятор`}
                      onClick={(e) => {
                        e.stopPropagation();
                        calculator.toggle(part);
                      }}
                    >
                      {added ? 'Убрать из калькулятора' : 'В калькулятор'}
                    </button>
                  ) : (
                    <span className="part-card__added">
                      <CheckIcon size={14} /> в калькуляторе
                    </span>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {article.notes.map((note, i) => (
        // The punishment of a rule or a charter is a note, and the one thing that must catch the eye.
        <div key={i} className={isPenaltyNote(note) ? 'note note--penalty' : 'note'}>
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

      <div className="art__actions">
        <button className={pinned ? 'btn btn--on art__grow' : 'btn art__grow'} type="button" aria-pressed={pinned} onClick={onPin}>
          <PinIcon />
          <span>{pinned ? 'Открепить' : 'Закрепить'}</span>
        </button>
        <button
          className={favorite ? 'btn btn--icon fav fav--on' : 'btn btn--icon fav'}
          type="button"
          aria-pressed={favorite}
          aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}
          title={favorite ? 'Убрать из избранного' : 'В избранное'}
          onClick={onFavorite}
        >
          <FavoriteIcon />
        </button>
      </div>
    </article>
  );
}
