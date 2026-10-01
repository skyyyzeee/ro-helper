// The checks every AI mode shares, without the AI — the analysis has its own fuller ones (validate.ts):
// a text may name only articles it was given and only figures they hold; an item of a list (a lawyer's demand, a
// step of a detention) stands only on sources it names, that were given, of the scope's kind.
import { articleText, type SearchHit } from '../core';
import { SOURCE_TYPE_LABELS, inScope, type Scope, type Source } from './sources';
import { figures, namedArticles } from './validate';

const hitOf = (source: Source | SearchHit): SearchHit => ('hit' in source ? source.hit : source);

/** Articles a text names that are none of the sources: «по ст. 777». */
export function strayArticles(text: string, sources: (Source | SearchHit)[]): string[] {
  const numbers = new Set(sources.map((s) => hitOf(s).article.number));
  return [...new Set(namedArticles(text).filter((n) => !numbers.has(n)))];
}

/** Figures of a text that none of the sources holds (nor `allowed` — the player's own, say). */
export function strayFigures(text: string, sources: (Source | SearchHit)[], allowed = ''): number[] {
  const known = new Set([
    ...sources.flatMap((s) => {
      const { article } = hitOf(s);
      return [...figures(articleText(article)), ...article.parts.flatMap((p) => (p.stars ? [p.stars.min, p.stars.max] : []))];
    }),
    ...figures(allowed),
  ]);
  return [...new Set(figures(text).filter((n) => n >= 2 && !known.has(n)))];
}

/** What is wrong with a text the AI wrote over these sources; empty when nothing. */
export function textIssues(text: string, sources: (Source | SearchHit)[], options: { figures?: boolean; allowed?: string } = {}): string[] {
  const issues: string[] = [];
  const stray = strayArticles(text, sources);
  if (stray.length) issues.push(`Упомянута статья ${stray.join(', ')}, которой нет среди найденных источников`);
  if (options.figures) {
    const made = strayFigures(text, sources, options.allowed);
    if (made.length) issues.push(`В источниках нет цифр ${made.join(', ')}`);
  }
  return issues;
}

/** An item checked against the sources it names: the ones that were given, and what is wrong. */
export interface GroundedItem<T> {
  item: T;
  sources: Source[];
  issues: string[];
}

/**
 * Items that each claim to stand on sources: an item names at least one source that was given and is of the
 * scope's kind, or it stands on nothing — the mode then shows it as «not found», never as a verdict.
 */
export function groundItems<T extends { sources: string[] }>(items: T[], given: Source[], scope: Scope): GroundedItem<T>[] {
  const byId = new Map(given.map((s) => [s.id, s]));
  return items.map((item) => {
    const issues: string[] = [];
    const sources = item.sources.flatMap((id) => {
      const source = byId.get(id);
      if (!source) issues.push(`ссылка на источник ${id}, которого не передавали`);
      else if (!inScope(source.type, scope)) issues.push(`${SOURCE_TYPE_LABELS[source.type].toLowerCase()} — не по теме вопроса`);
      return source && inScope(source.type, scope) ? [source] : [];
    });
    if (!item.sources.length) issues.push('нет источника');
    return { item, sources, issues };
  });
}

/** The ids an item of the model's JSON names: «S3», ["S3", "C1"], or none. */
export function idsOf(value: unknown): string[] {
  return (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s]+/) : [])
    .map((id) => String(id).trim().toUpperCase())
    .filter((id) => /^[A-Z]\d+$/.test(id))
    .slice(0, 6);
}
