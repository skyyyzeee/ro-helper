// What the wiki section shows: the data loaded once, on first need (it is a few megabytes — not at start), and the
// pure choice of entries — the catalog, its tab, men's or women's, the tags ticked, the words searched, the order.
import type { Gender, WikiCatalogId, WikiData, WikiEntry } from './model';
export { formatRubles as rubles } from '../core';

let loading: Promise<WikiData> | null = null;
/** The wiki's data, from its own chunk of the app: loaded the first time the section opens. */
export function loadWiki(): Promise<WikiData> {
  loading ??= import('../data/wiki.json').then((module) => (module.default ?? module) as unknown as WikiData);
  return loading;
}

export type WikiSort = 'new' | 'cheap' | 'expensive' | 'name';

export interface WikiQuery {
  /** A catalog, or all of them (searching the whole wiki). */
  catalog?: WikiCatalogId;
  group?: string;
  gender?: Gender;
  /** Every one of these tags. */
  tags?: string[];
  words?: string;
  sort?: WikiSort;
}

const normal = (text: string) => text.toLowerCase().replace(/ё/g, 'е');

/** An entry's text to search: its name, the line under it, its looks' names. */
const haystack = new WeakMap<WikiEntry, string>();
function textOf(entry: WikiEntry): string {
  let text = haystack.get(entry);
  if (!text) {
    text = normal([entry.title, entry.subtitle, ...(entry.views ?? []).map((v) => v.name)].filter(Boolean).join(' '));
    haystack.set(entry, text);
  }
  return text;
}

/** The entries a query picks, in its order. */
export function pick(data: WikiData, query: WikiQuery): WikiEntry[] {
  const words = normal(query.words ?? '').split(/\s+/).filter(Boolean);
  const found = data.entries.filter(
    (e) =>
      (!query.catalog || e.catalog === query.catalog) &&
      (!query.group || e.group === query.group) &&
      (!query.gender || !e.gender || e.gender === query.gender) &&
      (query.tags ?? []).every((tag) => e.tags.includes(tag)) &&
      words.every((word) => textOf(e).includes(word)),
  );
  const price = (e: WikiEntry) => e.price ?? 0;
  switch (query.sort ?? 'new') {
    case 'cheap':
      return found.sort((a, b) => (price(a) || Infinity) - (price(b) || Infinity));
    case 'expensive':
      return found.sort((a, b) => price(b) - price(a));
    case 'name':
      return found.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    default:
      return found.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }
}

/** The tags worth a filter in a catalog: those some but not all of its entries have, most common first. */
export function tagsOf(data: WikiData, catalog: WikiCatalogId): { tag: string; count: number }[] {
  const own = data.entries.filter((e) => e.catalog === catalog);
  const counts = new Map<string, number>();
  for (const e of own) for (const tag of e.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].filter(([, n]) => n < own.length).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

/** Others of its tab, for «Ещё в этой категории». */
export function neighbours(data: WikiData, entry: WikiEntry, limit = 12): WikiEntry[] {
  return data.entries.filter((e) => e.catalog === entry.catalog && e.group === entry.group && e.gender === entry.gender && e.id !== entry.id).slice(0, limit);
}
