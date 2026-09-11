import { useEffect, useRef } from 'react';
import { articleLabel, articleTitle, chapterHeading, formatPunishment, leadPart, type SearchHit } from '../core';
import { CheckIcon, PlusIcon } from './icons';
import { DocBadge, JurisdictionPill, Stars } from './lawBits';

export interface ResultRowProps {
  hit: SearchHit;
  selected: boolean;
  onOpen: () => void;
  /** Whether this hit can go into the calculator, and whether it is there already. */
  calculator?: { added: boolean; onToggle: () => void };
  /** Under a chapter heading the chapter goes without saying: an article without a punishment shows its text instead. */
  inChapter?: boolean;
  /** Changed in a recent update of the laws. */
  changed?: boolean;
}

export function ResultRow({ hit, selected, onOpen, calculator, inChapter, changed }: ResultRowProps) {
  const { article, document } = hit;
  const part = hit.part ?? leadPart(article);
  const chapter = document.chapters.find((c) => c.number === article.chapter);
  const label = articleLabel(article, hit.part, document.unit);
  const ref = useRef<HTMLButtonElement>(null);
  const wasSelected = useRef(selected);

  // Only when the selection moves here: a row selected as it appears is already at the top, and the list
  // may not be laid out yet (a hidden window), where scrolling would push the section title out of sight.
  useEffect(() => {
    if (selected && !wasSelected.current) ref.current?.scrollIntoView?.({ block: 'nearest' });
    wasSelected.current = selected;
  }, [selected]);

  return (
    <div className={selected ? 'row row--selected' : 'row'}>
      <button ref={ref} className="row__main" type="button" aria-current={selected ? 'true' : undefined} tabIndex={-1} onClick={onOpen}>
        <span className="row__line">
          <DocBadge document={document} />
          <span className="num">{label}</span>
          <span className="ttl">{articleTitle(article)}</span>
          {changed && <span className="chg chg--changed chg--small">изменено</span>}
          <span className="sp" />
          {part?.jurisdiction && <JurisdictionPill jurisdiction={part.jurisdiction} />}
          {part?.stars && <Stars stars={part.stars} />}
        </span>
        {hit.part && article.title && <span className="row__excerpt">{hit.part.text}</span>}
        <span className="row__line">
          {part?.punishment ? (
            <span className="pen">{formatPunishment(part.punishment)}</span>
          ) : (
            <span className="pen pen--muted">
              {inChapter
                ? // An article without a title (ПДД) already shows its text as the title.
                  article.title
                  ? article.parts.find((p) => p.text)?.text
                  : article.group
                : chapter
                  ? chapterHeading(chapter)
                  : document.title}
            </span>
          )}
        </span>
      </button>
      {calculator && (
        <button
          className={calculator.added ? 'add add--on' : 'add'}
          type="button"
          tabIndex={-1}
          aria-pressed={calculator.added}
          aria-label={calculator.added ? `Убрать ${label} из калькулятора` : `Добавить ${label} в калькулятор`}
          title={calculator.added ? 'Убрать из калькулятора' : 'Добавить в калькулятор'}
          onClick={calculator.onToggle}
        >
          {calculator.added ? <CheckIcon /> : <PlusIcon />}
        </button>
      )}
    </div>
  );
}
