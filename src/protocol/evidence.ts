import { articleText } from '../core';
import type { Source } from './sources';

/** Preserve the existing context budget while making its limits explicit and shared with validation. */
export const SOURCE_CHARS = 1800;

export function withEvidence(sources: Source[]): Source[] {
  return sources.map((source) => {
    const text = articleText(source.hit.article);
    return { ...source, evidence: { text: text.slice(0, SOURCE_CHARS), complete: text.length <= SOURCE_CHARS } };
  });
}

/** Older saved answers have no excerpt snapshot and retain their original validation behavior. */
export const evidenceText = (source: Source): string => source.evidence?.text ?? articleText(source.hit.article);
