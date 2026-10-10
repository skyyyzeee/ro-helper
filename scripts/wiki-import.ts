// Downloads the catalogs of the Russia Online wiki (wiki.russia.online) — vehicles, clothes, haircuts, tattoos, skins,
// animations, items, businesses, realties, wheels, modkits, crafts, recipes, updates, and its articles — page by page, one request at a
// time with a pause, and keeps each as data/wiki/<catalog>.json: the records as the wiki gives them, with where and
// when they were taken. The images stay on the wiki's CDN; only their addresses are kept.
//
//   npm run wiki:import                — every catalog
//   npm run wiki:import -- vehicles    — some of them
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeTurboStream } from './wiki/turbo';

const WIKI = 'https://wiki.russia.online/ru';
const PAUSE_MS = 400;
const root = join(import.meta.dirname, '..');
const out = join(root, 'data', 'wiki');

type Json = Record<string, unknown>;
/** Where a page's records are, and how many there are in all. */
type Page = { items: unknown[]; total: number; limit: number };

/** The factions with crafts of their own, as the wiki lists them at /crafts. */
const CRAFT_FRACTIONS = ['army', 'ems', 'fib', 'gov', 'lscsd', 'lspd', 'opg1', 'opg2', 'opg3', 'opg4', 'wn'];

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

/** Every loader's data of one page, by the route it is of. */
async function loadRoutes(path: string, query: Record<string, string | number> = {}): Promise<Json> {
  const search = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  const url = `${WIKI}/${path}.data${search ? `?${search}` : ''}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'KremlinAssistant-wiki-import (+https://github.com/skyyyzeee/ro-helper)' } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const decoded = decodeTurboStream(await response.text()) as Json;
  if (Array.isArray(decoded)) throw new Error(`${url}: redirected — ${JSON.stringify(decoded).slice(0, 120)}`);
  return decoded;
}

/** The data of one page: the loader's own, the layout's and the root's left out. */
async function load(path: string, query: Record<string, string | number> = {}): Promise<Json> {
  const url = `${WIKI}/${path}.data`;
  const decoded = await loadRoutes(path, query);
  const key = Object.keys(decoded).find((k) => k !== 'root' && k !== 'routes/locale-layout');
  const data = key ? (decoded[key] as Json | undefined)?.data : undefined;
  if (!data || typeof data !== 'object') throw new Error(`${url}: no data`);
  return data as Json;
}

/** A catalog listed page by page: `page` reads one page's records and the total. */
async function paged(path: string, page: (data: Json) => Page, query: Record<string, string | number> = {}): Promise<unknown[]> {
  const items: unknown[] = [];
  for (let n = 1; ; n++) {
    const got = page(await load(path, { ...query, page: n }));
    items.push(...got.items);
    if (!got.items.length || items.length >= got.total || got.items.length < got.limit) return items;
    await pause();
  }
}

/** Most catalogs: `{ data: { results, total, limit } }`. */
const results = (data: Json): Page => {
  const inner = data.data as Json;
  return { items: (inner?.results as unknown[]) ?? [], total: Number(inner?.total ?? 0), limit: Number(inner?.limit ?? 96) };
};
/** Wheels and modkits: the list under its own name, the total beside it. */
const listed = (name: string) => (data: Json): Page => ({ items: (data[name] as unknown[]) ?? [], total: Number(data.total ?? 0), limit: Number(data.limit ?? 96) });

/** The wiki's own words for its codes — the kinds of clothes, the zones of tattoos, the cases and shops — from its layout. */
async function messages(): Promise<unknown[]> {
  const response = await fetch(`${WIKI}/vehicles.data`);
  const decoded = decodeTurboStream(await response.text()) as Json;
  const all = ((decoded['routes/locale-layout'] as Json)?.data as Json)?.messages as Json;
  if (!all) throw new Error('no messages');
  const keep = ['common', 'fields', 'vehiclesPage', 'vehiclePage', 'clothesPage', 'clothingPage', 'haircutsPage', 'tattoosPage', 'itemsPage', 'itemPage', 'animationsPage', 'businessesPage', 'realtiesPage', 'wheelsPage', 'modkitsPage', 'craftsPage', 'recipesPage', 'skinsPage'];
  return [Object.fromEntries(keep.filter((k) => all[k]).map((k) => [k, all[k]]))];
}

/**
 * The wiki's articles («Серверы», «Банк», «МВД»…): the list by section comes with any article's page — the one on
 * the servers is read for it — and each article's text from its own page, one at a time.
 */
async function posts(): Promise<unknown[]> {
  const layout = (await loadRoutes('posts/servery'))['routes/layouts/posts'] as Json | undefined;
  const sections = ((layout?.data as Json)?.categories as Json[]) ?? [];
  if (!sections.length) throw new Error('no sections of articles');
  const all: unknown[] = [];
  for (const section of sections) {
    for (const post of (section.posts as Json[]) ?? []) {
      await pause();
      const page = (await loadRoutes(`posts/${String(post.slug)}`))['routes/posts.$slug'] as Json | undefined;
      const full = ((page?.data as Json)?.data as Json) ?? {};
      const { posts: _, ...about } = section;
      all.push({ ...post, content: full.content, plainText: full.plainText, section: about });
    }
  }
  return all;
}

const CATALOGS: Record<string, () => Promise<unknown[]>> = {
  posts,
  messages,
  vehicles: () => paged('vehicles', results),
  'clothes-male': () => paged('clothes/male', results),
  'clothes-female': () => paged('clothes/female', results),
  'haircuts-male': () => paged('haircuts/male', results),
  'haircuts-female': () => paged('haircuts/female', results),
  'tattoos-male': () => paged('tattoos/male', results),
  'tattoos-female': () => paged('tattoos/female', results),
  animations: () => paged('animations', results),
  items: () => paged('items', results),
  businesses: () => paged('businesses', results),
  realties: () => paged('realties', results),
  wheels: () => paged('wheels', listed('wheels')),
  modkits: () => paged('modkits', listed('kits')),
  updates: () => paged('changelogs', results),
  recipes: async () => ((await load('recipes')).data as unknown[]) ?? [],
  // The crafts of a faction, at its own address: /crafts/lspd, /crafts/army…
  crafts: async () => {
    const all: unknown[] = [];
    for (const fraction of CRAFT_FRACTIONS) {
      await pause();
      for (const craft of ((await load(`crafts/${fraction}`)).data as unknown[]) ?? []) all.push({ ...(craft as Json), fraction });
    }
    return all;
  },
  // Skins come by type (heavy vests, light vests…), each type at its own address: /skins/fraction-heavyvest.
  skins: async () => {
    const types = ((await load('skins')).types as Json[]) ?? [];
    const all: unknown[] = [];
    for (const { type } of types) {
      await pause();
      for (const skin of await paged(`skins/${String(type)}`, results)) all.push(skin);
    }
    return all;
  },
};

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = wanted.length ? wanted : Object.keys(CATALOGS);
const unknown = names.filter((n) => !CATALOGS[n]);
if (unknown.length) {
  console.error(`Нет такого раздела: ${unknown.join(', ')}. Есть: ${Object.keys(CATALOGS).join(', ')}`);
  process.exit(2);
}

mkdirSync(out, { recursive: true });
let failed = 0;
for (const name of names) {
  try {
    const items = await CATALOGS[name]();
    writeFileSync(join(out, `${name}.json`), `${JSON.stringify({ source: WIKI, takenAt: new Date().toISOString(), count: items.length, items })}\n`);
    console.log(`${name}: ${items.length}`);
  } catch (error) {
    failed += 1;
    console.error(`${name}: не скачался — ${error instanceof Error ? error.message : String(error)}`);
  }
  await pause();
}
process.exitCode = failed ? 1 : 0;
