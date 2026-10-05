// Builds src/data/wiki.json — every catalog of data/wiki/ (npm run wiki:import) in the one form of src/wiki/model.ts,
// its codes said in the wiki's own words (data/wiki/messages.json).
//   npm run wiki:build
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Gender, WikiCatalog, WikiCatalogId, WikiData, WikiEntry } from '../src/wiki/model';
import { FRESH, STATE_ALLOWED } from '../src/wiki/model';

const root = join(import.meta.dirname, '..');
const WIKI = 'https://wiki.russia.online/ru';
type Raw = Record<string, any>;
const raw = (name: string): { takenAt: string; items: Raw[] } => JSON.parse(readFileSync(join(root, 'data', 'wiki', `${name}.json`), 'utf8'));
const M = raw('messages').items[0] as Raw;
const C = M.common as Raw;

/** A code in the wiki's words: the first dictionary that has it, else the code. */
const word = (code: string | null | undefined, ...dicts: (Raw | undefined)[]): string => {
  if (code == null) return '';
  for (const dict of dicts) if (dict && typeof dict[code] === 'string') return dict[code];
  return String(code);
};

/** Where a thing comes from, in words: «case.vehiclesRo» → «Кейс «Автолюбитель»». */
function source(code: string): string {
  const [kind, name] = code.split('.');
  if (kind === 'case') return `${C.case} «${word(name, C.cases)}»`;
  if (kind === 'subscription') return `${C.subscription}: ${word(name, C.subscriptions)}`;
  if (kind === 'event') return name ? `${C.event} «${name}»` : C.event;
  if (kind === 'shop') return name && C.shops[name] ? C.shops[name] : C.shop;
  if (kind === 'unique') return word('unique', M.fields);
  if (kind === 'default') return word('default', M.fields);
  if (kind === 'battlePass') return C.battlePass;
  return word(kind, M.fields, C);
}
const sources = (list: unknown): string[] => [...new Set((Array.isArray(list) ? list : []).filter((s): s is string => typeof s === 'string').map(source))];

const money = (n: unknown) => (typeof n === 'number' && n > 0 ? n : undefined);
const fact = (label: string, value: unknown, unit = ''): [string, string][] => (value === undefined || value === null || value === '' || value === 0 ? [] : [[label, `${value}${unit}`]]);
const tags = (r: Raw, more: (string | false | undefined)[] = []) =>
  [r.isFresh && FRESH, r.isTradable && 'Можно передать', ...more].filter((t): t is string => typeof t === 'string' && !!t);
/** «RO Коин», «Кейс»… when the price is not in rubles. */
const priceNote = (type: string | undefined, ...dicts: Raw[]) => (type && type !== 'default' && type !== 'money' ? word(type, ...dicts, M.fields) : undefined);

const entries: WikiEntry[] = [];
/** Kept without what is empty — but facts, tags and sources always, as lists. */
const REQUIRED = new Set(['facts', 'tags', 'sources']);
const add = (entry: WikiEntry) =>
  entries.push(Object.fromEntries(Object.entries(entry).filter(([k, v]) => REQUIRED.has(k) || (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)))) as WikiEntry);

// ——— Vehicles ———
for (const r of raw('vehicles').items) {
  add({
    id: `vehicles:${r.id}`,
    catalog: 'vehicles',
    title: r.name,
    subtitle: r.irlName,
    group: r.type,
    image: r.imageUrl,
    views: (r.liveries ?? []).filter((l: Raw) => l?.imageUrl).map((l: Raw) => ({ name: l.name ?? '', image: l.imageUrl })),
    price: money(r.price),
    priceNote: money(r.mcPrice) && !money(r.price) ? word('donate', M.vehiclesPage) : undefined,
    sellPrice: money(r.sellPrice),
    facts: [
      ...fact('Класс', word(r.vehicleClass, M.vehiclesPage)),
      ...fact('Макс. скорость', r.maxSpeed, ' км/ч'),
      ...fact('С полным тюнингом', r.maxSpeedFT, ' км/ч'),
      ...fact('Разгон до 100', r.accelerationTo100, ' с'),
      ...fact('Багажник', r.trunkCapacity, ' кг'),
      ...fact('Топливо', r.fuelType ? `${r.fuelType} · ${r.fuelCapacity} л` : ''),
      ...fact('Грузоподъёмность', r.maxPayload, ' кг'),
      ...fact('Обвесов', (r.modkits ?? []).length || ''),
      ...fact('Служебных обвесов', (r.fractionKits ?? []).length || ''),
    ],
    tags: tags(r, [r.modkits?.length && 'Есть обвесы']),
    sources: sources(r.sources),
    url: `${WIKI}/vehicles/${r.type}/${r.model}`,
    createdAt: r.createdAt,
  });
}

// ——— Clothes ———
for (const gender of ['male', 'female'] as Gender[]) {
  for (const r of raw(`clothes-${gender}`).items) {
    const looks = (r.textures ?? []).filter((t: Raw) => t?.imageUrl);
    add({
      id: `clothes:${r.id}`,
      catalog: 'clothes',
      title: looks[0]?.name || word('noName', M.clothesPage).replace('{id}', r.drawable),
      subtitle: `${word(r.type, M.clothesPage)} · ${looks.length} расцв.`,
      group: r.type,
      gender,
      image: looks[0]?.imageUrl,
      views: looks.map((t: Raw) => ({ name: t.name ?? '', image: t.imageUrl })),
      price: money(r.price),
      priceNote: priceNote(r.priceType, M.clothesPage),
      facts: [...fact('ID', r.drawable), ...fact('Расцветок', looks.length)],
      tags: tags(r, [r.isBuyable === false && 'Не продаётся']),
      sources: sources(r.sources),
      url: `${WIKI}/clothes/${gender}/${r.type}/${r.drawable}`,
      createdAt: r.createdAt,
    });
  }
}

// ——— Haircuts: the wiki says which the state's services allow ———
for (const gender of ['male', 'female'] as Gender[]) {
  for (const r of raw(`haircuts-${gender}`).items) {
    add({
      id: `haircuts:${gender}:${r.id}`,
      catalog: 'haircuts',
      title: r.label,
      subtitle: `№ ${r.id}`,
      group: r.isStateAllowed ? 'state' : 'other',
      gender,
      image: r.imageUrl,
      price: money(r.price),
      facts: [],
      tags: [r.isStateAllowed && STATE_ALLOWED].filter((t): t is string => !!t),
      sources: [],
      text: r.information || undefined,
      url: `${WIKI}/haircuts/${gender}`,
    });
  }
}

// ——— Tattoos ———
for (const gender of ['male', 'female'] as Gender[]) {
  for (const r of raw(`tattoos-${gender}`).items) {
    add({
      id: `tattoos:${gender}:${r.id}`,
      catalog: 'tattoos',
      title: r.name,
      subtitle: word(r.zone, M.tattoosPage.zones),
      group: r.zone,
      gender,
      image: r.imageUrl,
      price: money(r.price),
      priceNote: priceNote(r.priceType, M.fields),
      facts: [...fact('Зона', word(r.zone, M.tattoosPage.zones)), ...fact('Коллекция', r.collection)],
      tags: tags(r),
      sources: sources(r.sources),
      url: `${WIKI}/tattoos/${gender}`,
    });
  }
}

// ——— Items ———
for (const r of raw('items').items) {
  add({
    id: `items:${r.id}`,
    catalog: 'items',
    title: r.name,
    subtitle: r.typeName,
    group: r.type,
    image: r.imageUrl,
    facts: [...fact('Вес', r.weight ? `${r.weight / 1000}` : '', ' кг'), ...fact('Размер', r.width && r.height ? `${r.width}×${r.height}` : ''), ...fact('В стопке', r.maxStack > 1 ? r.maxStack : '')],
    tags: tags(r),
    sources: sources(r.sources),
    text: r.description || undefined,
    url: `${WIKI}/items`,
    createdAt: r.createdAt,
  });
}

// ——— Animations ———
for (const r of raw('animations').items) {
  add({
    id: `animations:${r.id}`,
    catalog: 'animations',
    title: r.name || word('noName', M.animationsPage).replace('{id}', r.serial ?? r.id),
    subtitle: word(r.type, M.animationsPage),
    group: r.type,
    image: r.previewUrl,
    priceNote: priceNote(r.priceType, M.animationsPage),
    facts: [...fact('Зациклена', r.isLooped ? 'да' : '')],
    tags: tags(r, [r.soundUrl && 'Со звуком']),
    sources: sources(r.sources),
    url: `${WIKI}/animations`,
    createdAt: r.createdAt,
  });
}

// ——— Skins ———
for (const r of raw('skins').items) {
  add({
    id: `skins:${r.id}`,
    catalog: 'skins',
    title: r.name,
    subtitle: r.type === 'fraction-heavyvest' ? 'Тяжёлый бронежилет' : r.type === 'fraction-lightvest' ? 'Лёгкий бронежилет' : r.type,
    group: r.type,
    image: r.imageUrl,
    facts: [],
    tags: tags(r),
    sources: sources(r.sources),
    url: `${WIKI}/skins/${r.type}`,
  });
}

// ——— Wheels ———
for (const r of raw('wheels').items) {
  add({
    id: `wheels:${r.id}`,
    catalog: 'wheels',
    title: r.name,
    subtitle: [r.brand, r.category].filter(Boolean).join(' · '),
    group: r.vehicleType,
    image: r.imageUrl,
    views: [{ name: r.name, image: r.imageUrl }, ...(r.variations ?? []).map((v: Raw) => ({ name: v.name, image: v.imageUrl }))],
    price: money(r.installPrice),
    facts: [...fact('Бренд', r.brand), ...fact('Класс', r.category), ...fact('Вариантов', (r.variations ?? []).length + 1)],
    tags: [],
    sources: r.case ? [source(`case.${r.case}`)] : [],
    url: `${WIKI}/wheels`,
  });
}

// ——— Modkits ———
for (const r of raw('modkits').items) {
  add({
    id: `modkits:${r.id}`,
    catalog: 'modkits',
    title: `${r.vehicleName} — ${r.name}`,
    subtitle: r.release ? `Вышел ${r.release}` : undefined,
    group: r.vehicleType,
    image: r.imageUrl,
    price: money(r.price),
    facts: [...fact('Машина', r.vehicleName), ...fact('Обвес', r.name)],
    tags: [],
    sources: [],
    url: `${WIKI}/modkits`,
  });
}

// ——— Businesses, realties ———
for (const r of raw('businesses').items) {
  add({
    id: `businesses:${r.id}`,
    catalog: 'businesses',
    title: r.name || word('noName', M.businessesPage).replace('{id}', r.serial),
    subtitle: word(r.type, M.businessesPage),
    group: r.type,
    image: r.imageUrl,
    price: money(r.price),
    sellPrice: money(r.sellPrice),
    facts: [...fact('Номер', r.serial)],
    tags: tags(r),
    sources: [],
    url: `${WIKI}/businesses`,
  });
}
for (const r of raw('realties').items) {
  add({
    id: `realties:${r.id}`,
    catalog: 'realties',
    title: r.name || word('noName', M.realtiesPage).replace('{id}', r.serial),
    subtitle: word(r.type, M.realtiesPage),
    group: r.type,
    image: r.imageUrl,
    price: money(r.price),
    sellPrice: money(r.sellPrice),
    facts: [...fact('Гаражных мест', r.garageSlots), ...fact('Жильцов', r.maxTenants), ...fact('Хранилище', r.capacityKg, ' кг'), ...fact('Квартир', (r.apartments ?? []).length || '')],
    tags: tags(r),
    sources: [],
    url: `${WIKI}/realties`,
  });
}

// ——— Recipes, crafts ———
const items = new Map(raw('items').items.map((i: Raw) => [i.id, i]));
for (const r of raw('recipes').items) {
  const out = items.get(r.itemId) as Raw | undefined;
  add({
    id: `recipes:${r.itemId}`,
    catalog: 'recipes',
    title: r.name,
    subtitle: `Уровень кухни ${r.kitchenLvl} · готовка ${r.cookingLvl}`,
    group: String(r.cookingLvl),
    image: out?.imageUrl,
    facts: [...fact('Время', r.cookDurationMinutes, ' мин'), ...fact('Выход', r.outputCount, ' шт.'), ...(r.ingredients ?? []).map((g: Raw) => [g.name, `× ${g.amount}`] as [string, string])],
    tags: [],
    sources: [],
    url: `${WIKI}/recipes`,
  });
}
for (const r of raw('crafts').items) {
  add({
    id: `crafts:${r.fraction}:${r.item?.id}`,
    catalog: 'crafts',
    title: r.item?.name ?? '—',
    subtitle: r.item?.typeName,
    group: r.fraction,
    image: r.item?.imageUrl,
    facts: [...fact('Фракция', r.fraction), ...(r.requirements ?? r.ingredients ?? []).map((g: Raw) => [g.name ?? g.item?.name ?? '—', `× ${g.amount ?? g.count ?? 1}`] as [string, string])],
    tags: [],
    sources: [],
    text: r.item?.description,
    url: `${WIKI}/crafts/${r.fraction}`,
  });
}

// ——— Updates ———
for (const r of raw('updates').items) {
  add({
    id: `updates:${r.id}`,
    catalog: 'updates',
    title: r.title,
    subtitle: r.availableAt ? new Date(r.availableAt).toLocaleDateString('ru-RU') : undefined,
    facts: [],
    tags: [],
    sources: [],
    text: r.plainText,
    url: `${WIKI}/changelogs/${r.slug}`,
    createdAt: r.availableAt ?? r.createdAt,
  });
}

// ——— The catalogs, their tabs in the wiki's words ———
const TITLES: [WikiCatalogId, string, (group: string) => string][] = [
  ['vehicles', 'Транспорт', (g) => word(g, M.vehiclesPage)],
  ['clothes', 'Одежда', (g) => word(g, M.clothesPage)],
  ['haircuts', 'Причёски', (g) => (g === 'state' ? 'Для госструктур' : 'Остальные')],
  ['tattoos', 'Татуировки', (g) => word(g, M.tattoosPage.zones)],
  ['items', 'Предметы', (g) => word(g, M.itemsPage, Object.fromEntries(raw('items').items.map((i: Raw) => [i.type, i.typeName])))],
  ['animations', 'Анимации', (g) => word(g, M.animationsPage)],
  ['skins', 'Скины', (g) => (g === 'fraction-heavyvest' ? 'Тяжёлые бронежилеты' : g === 'fraction-lightvest' ? 'Лёгкие бронежилеты' : g)],
  ['wheels', 'Диски', (g) => word(g, M.wheelsPage.types)],
  ['modkits', 'Обвесы', (g) => word(g, M.vehiclesPage)],
  ['businesses', 'Бизнесы', (g) => word(g, M.businessesPage)],
  ['realties', 'Недвижимость', (g) => word(g, M.realtiesPage)],
  ['recipes', 'Рецепты', (g) => `Уровень ${g}`],
  ['crafts', 'Крафт фракций', (g) => g.toUpperCase()],
  ['updates', 'Обновления', (g) => g],
];
const catalogs: WikiCatalog[] = TITLES.map(([id, title, label]) => {
  const own = entries.filter((e) => e.catalog === id);
  const counts = new Map<string, number>();
  for (const e of own) if (e.group) counts.set(e.group, (counts.get(e.group) ?? 0) + 1);
  return {
    id,
    title,
    count: own.length,
    genders: own.some((e) => e.gender),
    groups: [...counts].sort((a, b) => b[1] - a[1]).map(([group, count]) => ({ id: group, label: label(group), count })),
  };
});

// The pictures from the world CDN: the main one sends there anyway, and does not answer through some VPNs.
const world = (url?: string) => url?.replace('https://cdn.majestic-files.net/', 'https://cdn-world.majestic-files.net/');
for (const e of entries) {
  e.image = world(e.image);
  if (e.views) e.views = e.views.map((v) => ({ ...v, image: world(v.image)! }));
  if (!e.image) delete e.image;
}

const data: WikiData = { takenAt: raw('vehicles').takenAt, source: WIKI, catalogs, entries };
const file = join(root, 'src', 'data', 'wiki.json');
writeFileSync(file, `${JSON.stringify(data)}\n`);
console.log(`wiki.json: ${entries.length} записей, ${catalogs.map((c) => `${c.title} ${c.count}`).join(', ')}; ${(readFileSync(file).length / 1024 / 1024).toFixed(1)} МБ`);
