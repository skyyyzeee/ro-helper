// Law data model: one server pack holds that server's documents, parsed from forum threads.

/** Jurisdiction tags from the law text: Р — regional (police), Ф — federal (ФСБ), В — military. */
export type Jurisdiction = 'Р' | 'Ф' | 'В';

/** Menu grouping and badge colour. */
export type DocumentCategory = 'codes' | 'fkz' | 'fz' | 'moscow' | 'charters' | 'rules';

/** What the document is: only penal codes carry punishments the calculator can use. */
export type DocumentKind = 'penal-code' | 'law' | 'charter' | 'rules';

/** Wanted level in stars; usually min === max, a range only where the law gives one. */
export interface StarRange {
  min: number;
  max: number;
}

export type Sanction =
  /** Fine in rubles: "до N" has only max, "от N до M" has both, a fixed amount has min === max. */
  | { kind: 'fine'; min?: number; max: number }
  | { kind: 'imprisonment'; months: number }
  /** Term set by the current wanted level (УК ст. 100.1): monthsPerStar × stars. */
  | { kind: 'imprisonment-by-stars'; monthsPerStar: number };

export interface Punishment {
  /** Alternatives joined by «либо»: the officer or court picks one. */
  alternatives: Sanction[];
  /** Mandatory add-ons, e.g. «лишение воинского звания». */
  additional: string[];
}

export interface Point {
  /** Letter as written: «а», «б», … */
  letter: string;
  text: string;
}

export interface Part {
  /** «1», «2»… Numbered in the text, or by position for tagged parts of the special part. Absent for plain paragraphs. */
  number?: string;
  text: string;
  points: Point[];
  jurisdiction?: Jurisdiction[];
  stars?: StarRange;
  punishment?: Punishment;
}

export interface Note {
  /** «Примечание» or «Пояснение». */
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
  title: string;
  chapter?: string;
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

export interface ServerPack {
  server: ServerInfo;
  /** Date-based version of the pack. */
  version: string;
  documents: LawDocument[];
}
