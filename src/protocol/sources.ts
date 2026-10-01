// What kind of norm a source is, and which kinds a question may draw on. The kind comes from the document in the
// server pack — never from the model — and the scope narrows the pack *before* the search, so a source outside it
// cannot reach the AI at all, whatever the question asks for.
import type { DocumentKind, LawDocument, SearchHit, ServerPack } from '../core';

/**
 * A source as the player is told it is: a law (the codes, the constitution, the federal laws), a rule of the
 * server (the project's rules), a charter (charters, regulations, orders of an organisation), or another document.
 */
export type SourceType = 'law' | 'server_rule' | 'charter' | 'other';

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  law: 'Закон',
  server_rule: 'Правило сервера',
  charter: 'Устав',
  other: 'Другой документ',
};

/** The id letter the AI cites a source by: S3 a law, R7 a rule of the server, C2 a charter, O1 another document. */
const ID_PREFIX: Record<SourceType, string> = { law: 'S', server_rule: 'R', charter: 'C', other: 'O' };

const TYPE_OF_KIND: Record<DocumentKind, SourceType> = {
  'penal-code': 'law',
  law: 'law',
  rules: 'server_rule',
  charter: 'charter',
};

export const sourceTypeOf = (document: Pick<LawDocument, 'kind'>): SourceType => TYPE_OF_KIND[document.kind] ?? 'other';

/** The type an id says, whatever the model wrote around it. */
export function sourceTypeOfId(id: string): SourceType | null {
  const letter = id.trim().toUpperCase()[0];
  const found = (Object.entries(ID_PREFIX) as [SourceType, string][]).find(([, prefix]) => prefix === letter);
  return found ? found[0] : null;
}

/** A found article under the id the AI cites it by, with the kind of norm it is. */
export interface Source {
  id: string;
  type: SourceType;
  hit: SearchHit;
}

/** The found articles under ids, numbered within each type: S1, S2, R1, C1… */
export function labelSources(hits: SearchHit[]): Source[] {
  const counts: Partial<Record<SourceType, number>> = {};
  return hits.map((hit) => {
    const type = sourceTypeOf(hit.document);
    counts[type] = (counts[type] ?? 0) + 1;
    return { id: `${ID_PREFIX[type]}${counts[type]}`, type, hit };
  });
}

/**
 * Which documents a question may draw on: the laws (with the charters that say how an organisation applies them),
 * the rules of the server, or both — kept apart in the answer.
 */
export type Scope = 'law' | 'server_rule' | 'mixed';

/** What the player chose over the AI: the app decides (auto), or the laws only, or the server's rules only. */
export type ScopeChoice = 'auto' | 'law' | 'server_rule';

export const SCOPE_TYPES: Record<Scope, SourceType[]> = {
  law: ['law', 'charter'],
  server_rule: ['server_rule'],
  mixed: ['law', 'charter', 'server_rule'],
};

const scoped = new WeakMap<ServerPack, Map<Scope, ServerPack>>();

/**
 * The pack with only the documents of a scope. Kept per pack, so the search's word index (also kept per pack) is
 * built once for each scope, not on every question.
 */
export function packInScope(pack: ServerPack, scope: Scope): ServerPack {
  let byScope = scoped.get(pack);
  if (!byScope) scoped.set(pack, (byScope = new Map()));
  let narrowed = byScope.get(scope);
  if (!narrowed) {
    const types = SCOPE_TYPES[scope];
    narrowed = { ...pack, documents: pack.documents.filter((document) => types.includes(sourceTypeOf(document))) };
    byScope.set(scope, narrowed);
  }
  return narrowed;
}

/** Whether a source may stand in an answer of this scope. */
export const inScope = (type: SourceType, scope: Scope) => SCOPE_TYPES[scope].includes(type);
