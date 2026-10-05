import type { Article, LawDocument, ServerPack } from './model';

/**
 * «Устав отдела»: a short digest of an organisation's charter — its ranks, who is above, how to address a senior,
 * the hours and the penalties. Written once from the charter text, every line names the points it is taken from,
 * so the player opens the charter itself; a charter edited since the digest is flagged instead of trusted.
 */
export type CharterKind = 'ranks' | 'chain' | 'address' | 'hours' | 'penalties';

export interface CharterSection {
  kind: CharterKind;
  /** The charter the section is taken from, by its id in the server's pack. */
  document: string;
  /** Its points: «15.1», or «II/1» where the numbers start over in every chapter. */
  points: string[];
  /** A list: the ranks from the lowest, the penalties from the mildest. */
  items?: string[];
  text?: string;
}

export interface CharterDigest {
  /** When each charter was last edited on the forum when the digest was written. */
  edited: Record<string, string>;
  organizations: Record<string, CharterSection[]>;
}

export const CHARTER_TITLES: Record<CharterKind, string> = {
  ranks: 'Звания снизу вверх',
  chain: 'Кто над вами',
  address: 'Обращение к старшему',
  hours: 'Рабочее время',
  penalties: 'Взыскания',
};

/** The article of a point: «15.1», or «II/1» — point 1 of chapter II. */
export function pointArticle(document: LawDocument, point: string): Article | undefined {
  const [chapter, number] = point.includes('/') ? point.split('/') : [undefined, point];
  const found = document.articles.filter((a) => a.number === number && (chapter === undefined || a.chapter === chapter));
  return found.length === 1 ? found[0] : undefined;
}

export interface CharterCard extends CharterSection {
  source: LawDocument;
  articles: Article[];
  /** The charter was edited after the digest was written: the card may be out of date. */
  stale: boolean;
}

/** The digest of an organisation's charter on this server, each section with the charter and points it rests on. */
export function charterCards(pack: ServerPack, digest: CharterDigest | undefined, organization: string | undefined): CharterCard[] {
  if (!digest || !organization) return [];
  const cards: CharterCard[] = [];
  for (const section of digest.organizations[organization] ?? []) {
    const source = pack.documents.find((d) => d.id === section.document);
    if (!source) continue;
    const articles = section.points.map((point) => pointArticle(source, point)).filter((a): a is Article => !!a);
    cards.push({ ...section, source, articles, stale: source.source.lastEdited !== digest.edited[source.id] });
  }
  return cards;
}
