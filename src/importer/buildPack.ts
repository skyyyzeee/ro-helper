import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PACK_FORMAT, type CalculatorRules, type ChangeEntry, type Dictionary, type DocumentCategory, type DocumentKind, type LawDocument, type Organization, type ServerPack } from '../core/model';
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
  unit?: 'point';
  /** Points docs: «list» keeps sub-points (5.1.1) inside their point (5.1) as its list, each on one line. */
  subpoints?: 'list';
  /** Points docs: «titles» takes a capitalised line after a finished sentence for a sub-heading of what follows (МВД Тверского). */
  subheadings?: 'titles';
  /** Points docs: «numbered» takes «1. …» lines for points beside «5.1» ones (ФСБ Арбатского). */
  points?: 'numbered';
  /** Sections docs: a pattern for the section titles where the forum's marks do not tell them (see `parseSectionsText`). */
  headings?: string;
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
 * A document the whole project shares (the rules are the same on every server) is kept once, in
 * `<serverDir>/../_shared/sources` — read from there when the server has no snapshot of its own.
 */
export function buildPack(serverDir: string, server: ServerSources): BuildResult {
  const sourcesDir = join(serverDir, 'sources');
  const sharedDir = join(serverDir, '..', '_shared', 'sources');
  const readJson = <T,>(file: string, fallback: T): T => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
  const overrides = readJson<Overrides>(join(serverDir, 'overrides.json'), {});
  const synonyms = readJson<Record<string, string[]>>(join(serverDir, 'synonyms.json'), {});
  const organizations = readJson<Organization[]>(join(serverDir, 'organizations.json'), []);
  // The intents of queries are the players' words, the same on every server (ADR 0004).
  const dictionary = readJson<Dictionary | undefined>(join(serverDir, '..', 'intents.json'), undefined);
  // A server whose codes have not been described yet is searched without a calculator.
  const calculatorFile = join(serverDir, 'calculator.json');
  const calculator = existsSync(calculatorFile) ? (JSON.parse(readFileSync(calculatorFile, 'utf8')) as CalculatorRules) : undefined;
  // The server's own snapshot wins; one of the whole project is read from _shared.
  const snapshot = (id: string, ext: string): string | undefined => {
    const own = join(sourcesDir, `${id}.${ext}`);
    if (existsSync(own)) return own;
    const shared = join(sharedDir, `${id}.${ext}`);
    return existsSync(shared) ? shared : undefined;
  };
  const idsOf = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith('.meta.json')).map((f) => f.replace('.meta.json', ''));
  const available = new Set([...idsOf(sourcesDir), ...idsOf(sharedDir)]);
  const issues: BuildResult['issues'] = [];
  const documents: LawDocument[] = [];

  for (const id of server.documents) {
    if (!available.has(id)) continue;
    const meta = JSON.parse(readFileSync(snapshot(id, 'meta.json')!, 'utf8')) as SourceMeta;
    const text = readFileSync(snapshot(id, 'txt')!, 'utf8');
    const parsed = parseLawText(text, meta.id, meta.format, { subpoints: meta.subpoints, subheadings: meta.subheadings, points: meta.points, headings: meta.headings });
    const fixed = applyOverrides(parsed.articles, parsed.issues, overrides);
    issues.push(...[...fixed.issues, ...fixed.stale].map((issue) => ({ ...issue, document: id })));
    documents.push({
      id: meta.id,
      short: meta.short,
      title: meta.title,
      aliases: meta.aliases,
      kind: meta.kind,
      category: meta.category,
      ...(meta.unit ? { unit: meta.unit } : {}),
      source: { thread: meta.thread, url: meta.url, posted: meta.posted, lastEdited: meta.lastEdited, snapshotAt: meta.snapshotAt },
      chapters: parsed.chapters,
      articles: parsed.articles,
    });
  }

  const knownArticles = new Set(documents.flatMap((d) => d.articles.map((a) => a.id)));
  for (const articleId of Object.keys(overrides)) {
    if (!knownArticles.has(articleId)) issues.push({ article: articleId, line: articleId, reason: 'Правка для несуществующей статьи' });
  }

  const knownDocuments = new Set(server.documents);
  for (const organization of organizations) {
    for (const id of organization.documents) {
      if (!knownDocuments.has(id)) issues.push({ line: organization.name, reason: `Организация ссылается на неизвестный документ «${id}»` });
    }
  }

  // The pack version is the time of the newest law edit it contains, so it only changes when a law does — or of the
  // newest changelog entry, where an import found changes older than the version already out (see the importer's cli).
  const changes = readJson<ChangeEntry[]>(join(serverDir, 'changelog.json'), []);
  const version =
    [...documents.map((d) => d.source.lastEdited), ...changes.map((c) => c.version)].sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ??
    '0000-00-00';
  const info = { id: server.id, name: server.name, status: server.status };
  return { pack: { format: PACK_FORMAT, server: info, ...(calculator ? { calculator } : {}), organizations, version, changes, documents, synonyms, ...(dictionary ? { dictionary } : {}) }, issues };
}
