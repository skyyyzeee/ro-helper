import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DocumentCategory, DocumentKind, LawDocument, ServerPack } from '../core/model';
import { parseCriminalCode, type ParseIssue } from './criminalCode';

/** Contents of `<id>.meta.json` next to each `<id>.txt` snapshot. */
export interface SourceMeta {
  id: string;
  short: string;
  title: string;
  aliases: string[];
  kind: DocumentKind;
  category: DocumentCategory;
  format: 'criminal-code';
  thread: number;
  url: string;
  posted: string;
  lastEdited: string;
  snapshotAt: string;
}

export interface ServerSources {
  id: string;
  name: string;
  status: 'active' | 'soon';
  /** Document order in the pack (and in the menu). */
  documents: string[];
}

export interface BuildResult {
  pack: ServerPack;
  issues: (ParseIssue & { document: string })[];
}

const PARSERS = {
  'criminal-code': parseCriminalCode,
};

/** Builds a server pack from `<serverDir>/sources/*.txt` snapshots and their metadata. */
export function buildPack(serverDir: string, server: ServerSources): BuildResult {
  const sourcesDir = join(serverDir, 'sources');
  const available = new Set(readdirSync(sourcesDir).filter((f) => f.endsWith('.meta.json')).map((f) => f.replace('.meta.json', '')));
  const issues: BuildResult['issues'] = [];
  const documents: LawDocument[] = [];

  for (const id of server.documents) {
    if (!available.has(id)) continue;
    const meta = JSON.parse(readFileSync(join(sourcesDir, `${id}.meta.json`), 'utf8')) as SourceMeta;
    const text = readFileSync(join(sourcesDir, `${id}.txt`), 'utf8');
    const parsed = PARSERS[meta.format](text, meta.id);
    issues.push(...parsed.issues.map((issue) => ({ ...issue, document: id })));
    documents.push({
      id: meta.id,
      short: meta.short,
      title: meta.title,
      aliases: meta.aliases,
      kind: meta.kind,
      category: meta.category,
      source: { thread: meta.thread, url: meta.url, posted: meta.posted, lastEdited: meta.lastEdited, snapshotAt: meta.snapshotAt },
      chapters: parsed.chapters,
      articles: parsed.articles,
    });
  }

  // The pack version is the newest law edit it contains, so it only changes when a law does.
  const version = documents.map((d) => d.source.lastEdited.slice(0, 10)).sort().at(-1) ?? '0000-00-00';
  return { pack: { server: { id: server.id, name: server.name, status: server.status }, version, documents }, issues };
}
