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
  | 'updates'
  | 'posts';

export type Gender = 'male' | 'female';

/**
 * A piece of a written page — an article or an update — as the app shows it: a heading, a paragraph, an item of a
 * list (its depth), a picture. The text is the wiki's; nothing of its layout beyond these.
 */
export type WikiBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'item'; text: string; depth: number; kind?: WikiChange }
  | { type: 'quote'; text: string }
  | { type: 'table'; rows: string[][]; header: boolean }
  | { type: 'image'; src: string };

/** What a line of an update is: something added, changed or fixed — the wiki marks each. */
export type WikiChange = 'added' | 'changed' | 'fixed';

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
  /** A description, or the text of an update or an article: what an older app shows of it. */
  text?: string;
  /** An article or an update as written: headings, paragraphs, lists, pictures. Older apps read `text` instead. */
  blocks?: WikiBlock[];
  /** An update's lines by what they are: added, changed, fixed. */
  counts?: Partial<Record<WikiChange, number>>;
  /** Its page on the wiki: the source said on screen. */
  url: string;
  createdAt?: string;
  /** A recipe or a craft: what one batch takes and gives — the calculator multiplies it. Older apps show `facts`. */
  make?: WikiMake;
  /** An article of «Работы»: the job it tells of (src/wiki/jobs.ts). */
  job?: WikiJob;
}

/** One batch of a recipe or a craft. */
export interface WikiMake {
  /** How long one batch takes. */
  minutes?: number;
  /** How many one batch gives. */
  output: number;
  parts: { name: string; count: number; image?: string }[];
  /** How it is cooked: «нарезка», «жарка»… */
  steps?: string[];
}

/** A bonus hour of a job: «Работа с 07:00 до 15:00 увеличивает заработок на 15%». */
export interface WikiJobBonus {
  /** «07:00», Moscow time, as the game's clock. */
  from: string;
  to: string;
  percent: number;
  /** The wiki's sentence, said as it is. */
  text: string;
}

/** A job as its article tells of it. */
export interface WikiJob {
  /** The character's level it opens at. */
  level?: number;
  /** Or the rank of the job before it. */
  rank?: number;
  legality?: 'legal' | 'semi' | 'illegal';
  bonuses: WikiJobBonus[];
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

/** The shape of wiki.json this app reads: a newer one downloaded is taken only in this shape. */
export const WIKI_FORMAT = 1;

export interface WikiData {
  /** The shape it is written in (WIKI_FORMAT). */
  format?: number;
  /** When the wiki was read (ISO). */
  takenAt: string;
  source: string;
  catalogs: WikiCatalog[];
  entries: WikiEntry[];
}

/** What the repository has, for the app to see whether a newer wiki is there without downloading it whole. */
export interface WikiManifest {
  format: number;
  takenAt: string;
  count: number;
}

/** The tag of an entry new on the wiki. */
export const FRESH = 'Новое';
/** The tag of what may be worn in the state's services (haircuts: the wiki says so). */
export const STATE_ALLOWED = 'Разрешено в госструктурах';
