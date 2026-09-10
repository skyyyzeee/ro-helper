import { useEffect, useRef } from 'react';
import { articleLabel, articleTitle, formatPunishment, leadPart, type SearchHit } from '../core';
import { DocBadge, JurisdictionPill, Stars } from './lawBits';

export function ResultRow({ hit, selected, onOpen }: { hit: SearchHit; selected: boolean; onOpen: () => void }) {
  const { article, document } = hit;
  const part = hit.part ?? leadPart(article);
  const chapter = document.chapters.find((c) => c.number === article.chapter);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  return (
    <button
      ref={ref}
      className={selected ? 'row row--selected' : 'row'}
      type="button"
      aria-current={selected ? 'true' : undefined}
      tabIndex={-1}
      onClick={onOpen}
    >
      <span className="row__line">
        <DocBadge document={document} />
        <span className="num">{articleLabel(article, hit.part)}</span>
        <span className="ttl">{articleTitle(article)}</span>
        <span className="sp" />
        {part?.jurisdiction && <JurisdictionPill jurisdiction={part.jurisdiction} />}
        {part?.stars && <Stars stars={part.stars} />}
      </span>
      {hit.part && article.title && <span className="row__excerpt">{hit.part.text}</span>}
      <span className="row__line">
        {part?.punishment ? (
          <span className="pen">{formatPunishment(part.punishment)}</span>
        ) : (
          <span className="pen pen--muted">{chapter ? `Глава ${chapter.number}. ${chapter.title}` : document.title}</span>
        )}
      </span>
    </button>
  );
}
