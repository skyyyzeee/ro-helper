import { formatJurisdiction, starCount, type Jurisdiction, type LawDocument, type StarRange } from '../core';
import { StarIcon } from './icons';

export function DocBadge({ document }: { document: LawDocument }) {
  return <span className={`badge badge--${document.category}`}>{document.short}</span>;
}

export function JurisdictionPill({ jurisdiction }: { jurisdiction: Jurisdiction[] }) {
  const federalOnly = jurisdiction.length === 1 && jurisdiction[0] === 'Ф';
  return <span className={federalOnly ? 'jur jur--federal' : 'jur'}>{formatJurisdiction(jurisdiction)}</span>;
}

/** Stars as icons; a range («от 1 до 5») shows the maximum with the range as its label. */
export function Stars({ stars, size }: { stars: StarRange; size?: number }) {
  const label = `Звёзд розыска: ${starCount(stars)}`;
  return (
    <span className="stars" role="img" aria-label={label} title={label}>
      {Array.from({ length: stars.max }, (_, i) => (
        <span key={i} className={i < stars.min ? undefined : 'stars__optional'}>
          <StarIcon size={size} />
        </span>
      ))}
    </span>
  );
}

/** «2026-09-06T19:38:37+03:00» → «06.09.2026». */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}
