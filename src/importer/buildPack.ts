import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DocumentCategory, DocumentKind, LawDocument, ServerPack } from '../core/model';
import { parseLawText, type LawFormat, type ParseIssue } from './lawText';
import { applyOverrides, type Overrides } from './overrides';

/** Contents of `<id>.meta.json` next to each `<id>.txt` snapshot. */
export interface SourceMeta {
  id: string;
  short: string;
  title: string;
  aliases: string[];
  kind: DocumentKind;
  category: DocumentCategory;
  format: LawFormat;
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
  issues: (ParseIssue & { document?: string })[];
}

/**
 * Builds a server pack from `<serverDir>/sources/*.txt` snapshots and their metadata,
 * then lays the manual fixes from `<serverDir>/overrides.json` over the parser output.
 */
export function buildPack(serverDir: string, server: ServerSources): BuildResult {
  const sourcesDir = join(serverDir, 'sources');
  const overridesFile = join(serverDir, 'overrides.json');
  const overrides: Overrides = existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, 'utf8')) : {};
  const available = new Set(readdirSync(sourcesDir).filter((f) => f.endsWith('.meta.json')).map((f) => f.replace('.meta.json', '')));
  const issues: BuildResult['issues'] = [];
  const documents: LawDocument[] = [];

  for (const id of server.documents) {
    if (!available.has(id)) continue;
    const meta = JSON.parse(readFileSync(join(sourcesDir, `${id}.meta.json`), 'utf8')) as SourceMeta;
    const text = readFileSync(join(sourcesDir, `${id}.txt`), 'utf8');
    const parsed = parseLawText(text, meta.id, meta.format);
    const fixed = applyOverrides(parsed.articles, parsed.issues, overrides);
    issues.push(...[...fixed.issues, ...fixed.stale].map((issue) => ({ ...issue, document: id })));
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

  const knownArticles = new Set(documents.flatMap((d) => d.articles.map((a) => a.id)));
  for (const articleId of Object.keys(overrides)) {
    if (!knownArticles.has(articleId)) issues.push({ article: articleId, line: articleId, reason: 'Правка для несуществующей статьи' });
  }

  // The pack version is the newest law edit it contains, so it only changes when a law does.
  const version = documents.map((d) => d.source.lastEdited.slice(0, 10)).sort().at(-1) ?? '0000-00-00';
  return { pack: { server: { id: server.id, name: server.name, status: server.status }, version, documents }, issues };
}
