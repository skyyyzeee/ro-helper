import { penalParts } from './format';
import type { Intent, ServerPack } from './model';
import { parseQuery, searchArticles, type SearchHit, type SearchOptions } from './search';
import { findForSituation } from './situation';
import { cachedStem } from './wordIndex';

/** The words of a query as typed, «ё» as «е», short ones too: «ли», «за». */
const tokens = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/)
    .filter(Boolean);

/** Stems this short say too little («прав» is «права» and «правила»): such a word is known only as written. */
const SHORTEST_STEM = 5;

/** A word as written, and its stem: «впаяют» finds «впаяют» and «впаять» alike — but a stem in `shared` only as written. */
function formsOf(list: string[], shared: Set<string> = new Set()): Set<string> {
  const forms = new Set<string>();
  for (const word of list.flatMap(tokens)) {
    forms.add(word);
    const stem = cachedStem(word);
    if (stem.length >= SHORTEST_STEM && !shared.has(stem)) forms.add(stem);
  }
  return forms;
}
const has = (forms: Set<string>, token: string) => forms.has(token) || forms.has(cachedStem(token));

/**
 * Stems that words of two intents share: «права» and «правила» are both «прав», so each is known only as
 * written. Worked out once per dictionary.
 */
const sharedStems = new WeakMap<Intent[], Set<string>>();
function sharedOf(intents: Intent[]): Set<string> {
  let shared = sharedStems.get(intents);
  if (!shared) {
    const owner = new Map<string, string>();
    shared = new Set();
    for (const intent of intents)
      for (const word of intent.words.flatMap(tokens)) {
        const stem = cachedStem(word);
        const was = owner.get(stem);
        if (was && was !== intent.id) shared.add(stem);
        owner.set(stem, intent.id);
      }
    sharedStems.set(intents, shared);
  }
  return shared;
}

export interface Understood {
  intent: Intent;
  /** The query without the intent's words and the everyday ones: what is searched where the intent says. */
  rest: string;
}

/**
 * What a query asks (roadmap 2Б, ADR 0004): the intent with the most of its words in the query, the first one
 * on a tie. None for a query by number or naming a document («ук 65»): the player said where to look.
 */
export function understand(pack: ServerPack, raw: string): Understood | null {
  const dictionary = pack.dictionary;
  if (!dictionary?.intents.length) return null;
  const query = parseQuery(pack, raw);
  if (query.number || query.scope) return null;
  const list = tokens(raw);
  const shared = sharedOf(dictionary.intents);
  let best: { intent: Intent; forms: Set<string>; count: number } | undefined;
  for (const intent of dictionary.intents) {
    const forms = formsOf(intent.words, shared);
    const count = list.filter((token) => has(forms, token)).length;
    if (count > (best?.count ?? 0)) best = { intent, forms, count };
  }
  if (!best) return null;
  const fillers = formsOf(dictionary.fillers);
  const { forms } = best;
  const rest = list.filter((token) => !has(forms, token) && !has(fillers, token)).join(' ');
  return { intent: best.intent, rest };
}

/** The documents of the server an intent sends a query to. */
export function intentDocuments(pack: ServerPack, intent: Intent): string[] {
  const ids = new Set(intent.documents ?? []);
  const kinds = new Set(intent.kinds ?? []);
  return pack.documents.filter((document) => ids.has(document.id) || kinds.has(document.kind)).map((document) => document.id);
}

export interface UnderstoodSearch {
  hits: SearchHit[];
  /** Set when the results are the intent's: the player sees what was understood and can search everywhere. */
  intent?: Intent;
}

/**
 * The search with intents (ADR 0004): normalise → dictionary → intent → its documents → the ordinary search
 * of what is left. Whatever the intent finds nothing for is searched as before — the query as typed, then
 * without its everyday words — so an intent never loses a result. `everywhere`: the player turned it off.
 */
export function searchUnderstood(pack: ServerPack, raw: string, options: SearchOptions & { everywhere?: boolean } = {}): UnderstoodSearch {
  const { everywhere, ...search } = options;
  const understood = understand(pack, raw);
  // The word still being typed stays one, as in the search itself.
  const ending = /\s$/.test(raw) ? ' ' : '';
  if (understood && !everywhere && !search.document) {
    const { intent, rest } = understood;
    const query = rest ? rest + ending : intent.alone ? `${intent.alone} ` : '';
    const documents = intentDocuments(pack, intent);
    let hits = query ? searchArticles(pack, query, { ...search, documents }) : [];
    // Its words spread over several articles: each looked up alone, the articles holding most of them first.
    if (!hits.length && rest.includes(' ')) {
      const allowed = new Set(documents);
      hits = findForSituation(pack, rest, { boostDocuments: search.boostDocuments, limit: 50 }).filter((hit) => allowed.has(hit.document.id));
    }
    if (intent.punished) hits = hits.filter((hit) => (hit.part ? !!hit.part.punishment : penalParts(hit.article).length > 0));
    if (hits.length) return { hits, intent };
  }
  const hits = searchArticles(pack, raw, search);
  if (hits.length || !understood?.rest) return { hits };
  return { hits: searchArticles(pack, understood.rest + ending, search) };
}
