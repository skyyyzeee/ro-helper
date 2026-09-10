import type { Article, Jurisdiction, Part, Punishment, Sanction, StarRange, Subject } from './model';

const NBSP = ' ';

/** 50000 → «50 000» (non-breaking spaces, independent of the runtime locale). */
function groupDigits(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 50000 → «50 000 ₽». */
export function formatRubles(amount: number): string {
  return groupDigits(amount) + NBSP + '₽';
}

export function formatSanction(sanction: Sanction): string {
  switch (sanction.kind) {
    case 'fine':
      if (sanction.min === undefined) return `штраф до ${formatRubles(sanction.max)}`;
      if (sanction.min === sanction.max) return `штраф ${formatRubles(sanction.max)}`;
      return `штраф от ${groupDigits(sanction.min)} до ${formatRubles(sanction.max)}`;
    case 'fine-multiple':
      return `штраф ×${sanction.multiplier} от неуплаченного` + (sanction.min ? `, не менее ${formatRubles(sanction.min)}` : '');
    case 'imprisonment':
      return `${sanction.months}${NBSP}мес`;
    case 'imprisonment-by-stars':
      return `${sanction.monthsPerStar}${NBSP}мес за ★`;
    case 'arrest':
      return sanction.min === sanction.max ? `арест ${sanction.max}${NBSP}сут` : `арест до ${sanction.max}${NBSP}сут`;
    case 'warning':
      return 'предупреждение';
    case 'license-revocation':
      return 'лишение прав';
    case 'evacuation':
      return 'эвакуация ТС';
  }
}

export const SUBJECT_LABELS: Record<Subject, string> = {
  citizen: 'Гражданам',
  official: 'Должностным лицам',
  legal: 'Юридическим лицам',
};

export interface SubjectLine {
  /** Null for sanctions that apply to everyone. */
  subject: Subject | null;
  text: string;
}

/** Sanctions grouped by who they apply to, in the order: everyone, citizens, officials, legal entities. */
export function punishmentBySubject(punishment: Punishment): SubjectLine[] {
  const order: (Subject | null)[] = [null, 'citizen', 'official', 'legal'];
  return order
    .map((subject) => ({
      subject,
      sanctions: punishment.alternatives.filter((s) => (s.subject ?? null) === subject),
    }))
    .filter((group) => group.sanctions.length)
    .map(({ subject, sanctions }) => ({ subject, text: sanctions.map(formatSanction).join(' либо ') }));
}

/**
 * One-line summary for a citizen: «штраф до 50 000 ₽ либо 30 мес». When a sanction applies only to
 * officials or legal entities, the line names them: «юридическим лицам: штраф от 100 000 до 200 000 ₽».
 */
export function formatPunishment(punishment: Punishment): string {
  const lines = punishmentBySubject(punishment);
  const forCitizen = lines.filter((line) => line.subject === null || line.subject === 'citizen');
  if (forCitizen.length) return forCitizen.map((line) => line.text).join(' либо ');
  const [first] = lines;
  return first ? `${SUBJECT_LABELS[first.subject!].toLowerCase()}: ${first.text}` : '';
}

export function formatJurisdiction(jurisdiction: Jurisdiction[]): string {
  return jurisdiction.join('/');
}

export function starCount(stars: StarRange): string {
  return stars.min === stars.max ? String(stars.min) : `${stars.min}–${stars.max}`;
}

/** Parts that carry a punishment. */
export function penalParts(article: Article): Part[] {
  return article.parts.filter((part) => part.punishment);
}

/** The part a one-line summary describes: the first part that carries a punishment. */
export function leadPart(article: Article): Part | undefined {
  return article.parts.find((part) => part.punishment);
}

/** «ст. 65», «ст. 8.6 ч. 1». */
export function articleLabel(article: Article, part?: Part): string {
  return `ст. ${article.number}` + (part?.number ? ` ч. ${part.number}` : '');
}

/** A title for articles that have none (ПДД): the start of the first part. */
export function articleTitle(article: Article, max = 70): string {
  if (article.title) return article.title;
  const first = article.parts.find((part) => part.text)?.text ?? '';
  return first.length > max ? first.slice(0, max).replace(/\s+\S*$/, '') + '…' : first;
}
