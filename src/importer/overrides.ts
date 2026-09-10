import type { Article, Jurisdiction, Punishment, StarRange } from '../core/model';
import type { ParseIssue } from './lawText';

export interface PartOverride {
  text?: string;
  stars?: StarRange;
  jurisdiction?: Jurisdiction[];
  punishment?: Punishment;
}

export interface ArticleOverride {
  /** Why the parser needs help here; kept so a later reader knows whether the fix is still needed. */
  reason: string;
  title?: string;
  /** Keyed by part number («1», «2») or by position for unnumbered parts («#1»). */
  parts?: Record<string, PartOverride>;
}

/** `data/<server>/overrides.json`: manual fixes laid over the parser output, keyed by article id. */
export type Overrides = Record<string, ArticleOverride>;

export interface OverrideResult {
  /** Parser issues that remain after the fixes. */
  issues: ParseIssue[];
  /** Fixes that no longer match anything, e.g. after the forum text changed. */
  stale: ParseIssue[];
}

/** Applies manual fixes in place. An issue is resolved when a fix covers the part it was about. */
export function applyOverrides(articles: Article[], issues: ParseIssue[], overrides: Overrides): OverrideResult {
  const stale: ParseIssue[] = [];
  const fixed = new Set<string>();

  for (const [articleId, fix] of Object.entries(overrides)) {
    const article = articles.find((a) => a.id === articleId);
    if (!article) continue; // may belong to another document; checked by the caller across all documents
    if (fix.title !== undefined) article.title = fix.title;

    for (const [key, partFix] of Object.entries(fix.parts ?? {})) {
      const index = key.startsWith('#') ? Number(key.slice(1)) - 1 : article.parts.findIndex((p) => p.number === key);
      const part = article.parts[index];
      if (!part) {
        stale.push({ article: articleId, line: key, reason: `Правка для несуществующей части «${key}»` });
        continue;
      }
      Object.assign(part, partFix);
      fixed.add(`${articleId}#${index + 1}`);
    }
  }

  return {
    issues: issues.filter((issue) => !(issue.article && issue.partIndex && fixed.has(`${issue.article}#${issue.partIndex}`))),
    stale,
  };
}
