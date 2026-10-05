// The wiki of Russia Online inside the assistant: every catalog of it — vehicles, clothes, haircuts, tattoos, items…
// — in one form, so one catalog view and one item page show them all. Built from the wiki's data by
// scripts/wiki-build.ts; every entry keeps the address of its page on the wiki, which is said on screen.

export type WikiCatalogId =
  | 'vehicles'
  | 'clothes'
  | 'haircuts'
  | 'tattoos'
  | 'items'
  | 'animations'
  | 'skins'
  | 'wheels'
  | 'modkits'
  | 'businesses'
  | 'realties'
  | 'recipes'
  | 'crafts'
  | 'updates';

export type Gender = 'male' | 'female';

export interface WikiEntry {
  /** `vehicles:1152` — the catalog and the wiki's own id. */
  id: string;
  catalog: WikiCatalogId;
  title: string;
  /** The real model of a vehicle, the brand, a short line under the title. */
  subtitle?: string;
  /** The tab it sits under in its catalog: «car», «top», «food»… */
  group?: string;
  gender?: Gender;
  image?: string;
  /** Its other looks: the colours of a garment, the liveries of a vehicle, the variants of a wheel. */
  views?: { name: string; image: string }[];
  /** The state price, in rubles — the game's money. */
  price?: number;
  /** How it is paid, when not in rubles: «RO Коин», «Кейс». */
  priceNote?: string;
  /** What the scrapyard pays, in rubles. */
  sellPrice?: number;
  /** What it is, in pairs: «Макс. скорость» — «275 км/ч». */
  facts: [string, string][];
  /** «Новое», «Можно передать», «Разрешено в госструктурах», «Эксклюзив»… */
  tags: string[];
  /** Where it comes from, in words: «Кейс «Автолюбитель»», «Магазин одежды #1». */
  sources: string[];
  /** A description, or the text of an update. */
  text?: string;
  /** Its page on the wiki: the source said on screen. */
  url: string;
  createdAt?: string;
}

export interface WikiGroup {
  id: string;
  label: string;
  count: number;
}

export interface WikiCatalog {
  id: WikiCatalogId;
  title: string;
  count: number;
  groups: WikiGroup[];
  /** Split by men's and women's. */
  genders: boolean;
}

export interface WikiData {
  /** When the wiki was read (ISO). */
  takenAt: string;
  source: string;
  catalogs: WikiCatalog[];
  entries: WikiEntry[];
}

/** The tag of an entry new on the wiki. */
export const FRESH = 'Новое';
/** The tag of what may be worn in the state's services (haircuts: the wiki says so). */
export const STATE_ALLOWED = 'Разрешено в госструктурах';
