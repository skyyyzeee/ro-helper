import { diffPacks } from '../core/changes';
import type { ChangeEntry, DocumentChange, ServerPack } from '../core/model';

/** How long updates stay in the pack for «Что изменилось». */
export const KEEP_DAYS = 90;

export interface ImportReport {
  /** Changes to documents whose forum post was edited: these go into the changelog. */
  laws: DocumentChange[];
  /** Changes the parser made to documents the forum did not touch: shown to the developer only. */
  parser: DocumentChange[];
}

/**
 * Compares a freshly built pack with the one it replaces. A document whose first post was edited since
 * (or that came or went) is a change to the laws; any other difference comes from the parser.
 */
export function compareImports(previous: Pick<ServerPack, 'documents'> | undefined, next: Pick<ServerPack, 'documents'>): ImportReport {
  if (!previous) return { laws: [], parser: [] };
  const edited = new Map(previous.documents.map((d) => [d.id, d.source.lastEdited]));
  const report: ImportReport = { laws: [], parser: [] };
  for (const change of diffPacks(previous, next)) {
    const document = next.documents.find((d) => d.id === change.documentId);
    const lawChanged = change.kind !== 'changed' || edited.get(change.documentId) !== document?.source.lastEdited;
    report[lawChanged ? 'laws' : 'parser'].push(change);
  }
  return report;
}

/**
 * The changelog after this import: a new entry for the changes to the laws (if any) on top — joined with
 * an entry of the same version, documents changed again replaced — and entries older than
 * {@link KEEP_DAYS} days before the new version dropped.
 */
export function nextChangelog(changelog: ChangeEntry[], version: string, laws: DocumentChange[]): ChangeEntry[] {
  const since = Date.parse(version) - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const same = changelog.find((entry) => entry.version === version);
  const kept = changelog.filter((entry) => entry !== same && Date.parse(entry.version) >= since);
  if (!laws.length) return same ? [same, ...kept] : kept;
  const earlier = same?.documents.filter((d) => !laws.some((l) => l.documentId === d.documentId)) ?? [];
  return [{ version, documents: [...laws, ...earlier] }, ...kept];
}
