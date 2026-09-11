import { useEffect, useRef } from 'react';
import { SUBJECT_LABELS, penalParts, punishmentBySubject, type Article, type LawDocument, type Part } from '../core';
import { usePlatform } from '../platform/PlatformContext';
import { BackIcon, CheckIcon, ExternalIcon, FavoriteIcon, PinIcon, PlusIcon } from './icons';
import { DocBadge, JurisdictionPill, Stars, formatDate, jurisdictionText, starsHint } from './lawBits';
import { entryPart } from './saved';

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
  onPin: () => void;
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
  onPin,
}: ArticleViewProps) {
  const platform = usePlatform();
  const focusRef = useRef<HTMLElement>(null);
  const chapter = document.chapters.find((c) => c.number === article.chapter);
  const heading = `Статья ${article.number}` + (article.title ? `. ${article.title}` : '');
  // The part the buttons act on; each punished part has its own «+» when there are several.
  const main = entryPart(article, focusPart);
  const perPart = penalParts(article).length > 1;
  const mainAdded = calculator?.has(main) ?? false;
  const mainLabel = main?.number ? `ч. ${main.number} ` : '';

  useEffect(() => {
    focusRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusPart]);

  return (
    <article className="art" aria-label={heading}>
      <button className="back" type="button" onClick={onBack}>
        <BackIcon />
        <span>{backLabel}</span>
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
          if (!part.punishment && !part.jurisdiction && !part.stars) {
            return (
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
          }
          const added = calculator?.has(part) ?? false;
          return (
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
                {calculator && perPart && part.punishment && (
                  <button
                    className={added ? 'add add--sm add--on' : 'add add--sm'}
                    type="button"
                    aria-pressed={added}
                    aria-label={added ? `Убрать ч. ${part.number} из калькулятора` : `Добавить ч. ${part.number} в калькулятор`}
                    title={added ? 'Убрать из калькулятора' : 'Добавить в калькулятор'}
                    onClick={() => calculator.toggle(part)}
                  >
                    {added ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
                  </button>
                )}
              </div>
              {(part.jurisdiction || part.stars) && (
                <div className="part-card__tags">
                  {part.jurisdiction && (
                    <span className="tag-group">
                      <JurisdictionPill jurisdiction={part.jurisdiction} />
                      <span>{jurisdictionText(part.jurisdiction)}</span>
                    </span>
                  )}
                  {part.stars && (
                    <span className="tag-group">
                      <Stars stars={part.stars} size={14} />
                      <span>{starsHint(part.stars, monthsPerStar)}</span>
                    </span>
                  )}
                </div>
              )}
              <p className="part-card__text">{part.text}</p>
              <PunishmentLines part={part} />
            </section>
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

      <div className="art__actions">
        {calculator && (
          <button className={mainAdded ? 'btn art__grow' : 'btn btn--primary art__grow'} type="button" onClick={() => calculator.toggle(main)}>
            {mainAdded ? `Убрать ${mainLabel}из калькулятора` : `Добавить ${mainLabel}в калькулятор`}
          </button>
        )}
        <button className="btn" type="button" onClick={onPin}>
          <PinIcon />
          <span>Закрепить</span>
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
