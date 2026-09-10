import type { Article, Jurisdiction, Part, Punishment, Sanction, StarRange } from './model';

const NBSP = ' ';

/** 50000 → «50 000 ₽» (non-breaking spaces, independent of the runtime locale). */
export function formatRubles(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + NBSP + '₽';
}

export function formatSanction(sanction: Sanction): string {
  switch (sanction.kind) {
    case 'fine':
      if (sanction.min === undefined) return `штраф до ${formatRubles(sanction.max)}`;
      if (sanction.min === sanction.max) return `штраф ${formatRubles(sanction.max)}`;
      return `штраф от ${formatRubles(sanction.min).replace(NBSP + '₽', '')} до ${formatRubles(sanction.max)}`;
    case 'imprisonment':
      return `${sanction.months}${NBSP}мес`;
    case 'imprisonment-by-stars':
      return `${sanction.monthsPerStar}${NBSP}мес за ★`;
  }
}

/** «штраф до 50 000 ₽ либо 30 мес». */
export function formatPunishment(punishment: Punishment): string {
  return punishment.alternatives.map(formatSanction).join(' либо ');
}

export function formatJurisdiction(jurisdiction: Jurisdiction[]): string {
  return jurisdiction.join('/');
}

export function starCount(stars: StarRange): string {
  return stars.min === stars.max ? String(stars.min) : `${stars.min}–${stars.max}`;
}

/** The part a one-line summary describes: the first part that carries a punishment. */
export function leadPart(article: Article): Part | undefined {
  return article.parts.find((part) => part.punishment);
}
