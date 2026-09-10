import { formatPunishment, leadPart, type SearchHit } from '../core';
import { DocBadge, JurisdictionPill, Stars } from './lawBits';

export function ResultRow({ hit, onOpen }: { hit: SearchHit; onOpen: () => void }) {
  const { article, document } = hit;
  const lead = leadPart(article);
  const morePenalParts = article.parts.filter((part) => part.punishment).length - 1;
  const chapter = document.chapters.find((c) => c.number === article.chapter);

  return (
    <button className="row" type="button" onClick={onOpen}>
      <span className="row__line">
        <DocBadge document={document} />
        <span className="num">ст. {article.number}</span>
        <span className="ttl">{article.title}</span>
        <span className="sp" />
        {lead?.jurisdiction && <JurisdictionPill jurisdiction={lead.jurisdiction} />}
        {lead?.stars && <Stars stars={lead.stars} />}
      </span>
      <span className="row__line">
        {lead?.punishment ? (
          <span className="pen">{formatPunishment(lead.punishment)}</span>
        ) : (
          <span className="pen pen--muted">{chapter ? `Глава ${chapter.number}. ${chapter.title}` : document.title}</span>
        )}
        {morePenalParts > 0 && <span className="more">+ ещё {morePenalParts} ч.</span>}
      </span>
    </button>
  );
}
