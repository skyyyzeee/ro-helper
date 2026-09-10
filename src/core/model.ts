// Law data model: one server pack holds that server's documents, parsed from forum threads.

/** Jurisdiction tags from the law text: Р — regional (police), Ф — federal (ФСБ), В — military. */
export type Jurisdiction = 'Р' | 'Ф' | 'В';

/** Menu grouping and badge colour. */
export type DocumentCategory = 'codes' | 'fkz' | 'fz' | 'moscow' | 'charters' | 'rules';

/** What the document is: only penal codes carry punishments the calculator can use. */
export type DocumentKind = 'penal-code' | 'law' | 'charter' | 'rules';

/** Who an administrative sanction applies to (КоАП): граждане, должностные лица, юридические лица. */
export type Subject = 'citizen' | 'official' | 'legal';

/** Wanted level in stars; usually min === max, a range only where the law gives one. */
export interface StarRange {
  min: number;
  max: number;
}

type SanctionBody =
  /** Fine in rubles: "до N" has only max, "от N до M" has both, a fixed amount has min === max. */
  | { kind: 'fine'; min?: number; max: number }
  /** A multiple of an unpaid fine (КоАП 10.2: «в двукратном размере …, но не менее 3.000 рублей»). */
  | { kind: 'fine-multiple'; multiplier: number; min?: number }
  | { kind: 'imprisonment'; months: number }
  /** Term set by the current wanted level (УК ст. 100.1): monthsPerStar × stars. */
  | { kind: 'imprisonment-by-stars'; monthsPerStar: number }
  /** Administrative arrest in days: "до N суток" has only max, a fixed term has min === max. */
  | { kind: 'arrest'; min?: number; max: number }
  | { kind: 'warning' }
  | { kind: 'license-revocation' }
  | { kind: 'evacuation' };

/** A sanction; `subject` is set only when the law names who it applies to. */
export type Sanction = SanctionBody & { subject?: Subject };

export interface Punishment {
  /** Alternatives joined by «либо» / «или»: the officer or court picks one. */
  alternatives: Sanction[];
  /** Mandatory add-ons, e.g. «лишение воинского звания». */
  additional: string[];
}

export interface Point {
  /** List marker as written: «а», «б» or «1», «2» (for «1)»). */
  marker: string;
  text: string;
}

export interface Part {
  /** «1», «2», «15.5.1»… Numbered in the text, or by position for tagged parts of the УК special part. Absent for plain paragraphs. */
  number?: string;
  text: string;
  points: Point[];
  jurisdiction?: Jurisdiction[];
  stars?: StarRange;
  punishment?: Punishment;
}

export interface Note {
  /** «Примечание», «Примечание 1» or «Пояснение». */
  label: string;
  text: string;
}

export interface Chapter {
  number: string;
  title: string;
  section?: string;
  /** Text between the chapter heading and its first article. */
  preface: string[];
}

export interface Article {
  /** Unique within the pack: `${documentId}-${number}`, e.g. `uk-65`. */
  id: string;
  number: string;
  /** Empty where the law gives articles no titles (ПДД). */
  title: string;
  chapter?: string;
  /** Sub-heading inside the chapter that this article falls under (ПДД: «аварийные сигналы»). */
  group?: string;
  parts: Part[];
  notes: Note[];
}

export interface DocumentSource {
  thread: number;
  url: string;
  posted: string;
  /** When the first post was last edited: this is the date the law is current as of. */
  lastEdited: string;
  snapshotAt: string;
}

export interface LawDocument {
  id: string;
  short: string;
  title: string;
  /** Lower-case prefixes users type before a number: «ук 65». */
  aliases: string[];
  kind: DocumentKind;
  category: DocumentCategory;
  source: DocumentSource;
  chapters: Chapter[];
  articles: Article[];
}

export interface ServerInfo {
  id: string;
  name: string;
  /** «soon» servers are listed in the server picker but have no laws yet. */
  status: 'active' | 'soon';
}

export interface Organization {
  id: string;
  name: string;
  /** Documents that rank first for its members; ids of documents the pack may not have yet. */
  documents: string[];
}

/** A rule of the calculator with the article it comes from. */
interface Based {
  basis: string;
}

/** The server's rules for combining criminal punishments; data, so other servers can differ. */
export interface CalculatorRules {
  /** Document the calculator treats as the criminal code. */
  criminalCode: string;
  /** Several crimes: the strictest punishment absorbs the rest. */
  absorption: Based;
  /** An article whose punishment may be added once on top of the strictest one. */
  stackOnce?: Based & { article: string };
  stages: Record<'attempt' | 'preparation', Based & { factor: number; label: string }>;
  maxTotalMonths: Based & { value: number };
  stars: Based & { monthsPerStar: number; max: number };
  /** Crime categories by the article's maximum term, lightest first; the last one has no limit. */
  categories: Based & { list: { name: string; label: string; maxMonths?: number }[] };
  bail: Based & { amounts: Record<string, number> };
  /** Jurisdiction tag → what the officer should know when a charge has only that tag. */
  jurisdictionWarnings: Partial<Record<Jurisdiction, string>>;
}

export interface ServerPack {
  server: ServerInfo;
  calculator: CalculatorRules;
  /** What the user can pick as their organisation, «Без организации» included. */
  organizations: Organization[];
  /** Date-based version of the pack. */
  version: string;
  documents: LawDocument[];
  /** Words players use → phrases the law uses for the same thing: «ствол» → «огнестрельное оружие». */
  synonyms: Record<string, string[]>;
}
