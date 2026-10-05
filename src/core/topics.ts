import type { Article, LawDocument, Organization, Sanction, ServerPack } from './model';
import { searchArticles, type SearchHit } from './search';

/**
 * «Как это делается по закону»: what an officer does every shift, each with the articles of the player's server
 * that bear on it. Nothing is written by hand per server: a topic is the words of the law it is found by, or the
 * punishments of the penal codes, so it follows the server's laws as they change.
 */
export interface LawTopic {
  id: string;
  title: string;
  hint: string;
}

interface TopicRule extends LawTopic {
  /** Words of the law, each searched as a whole: an article holding any of them belongs. */
  words?: string[];
  /** Articles of the penal codes whose punishment holds a sanction of these kinds. */
  sanctions?: Sanction['kind'][];
}

const RULES: TopicRule[] = [
  { id: 'detention', title: 'Задержание', hint: 'Кого, когда и как задерживают', words: ['задержание', 'задержанного', 'задержать', 'наручники'] },
  { id: 'rights', title: 'Права задержанного', hint: 'Что обязаны разъяснить и дать', words: ['права задержанного', 'право на адвоката', 'телефонный звонок', 'разъяснить права'] },
  { id: 'search', title: 'Обыск и досмотр', hint: 'Что и при ком можно осматривать', words: ['обыск', 'досмотр', 'личный досмотр'] },
  { id: 'force', title: 'Применение силы', hint: 'Сила, спецсредства, оружие', words: ['физической силы', 'специальных средств', 'огнестрельного оружия'] },
  { id: 'vehicle', title: 'Машина', hint: 'Остановка, осмотр, эвакуация', words: ['остановка транспортного средства', 'досмотр транспортного средства', 'осмотр транспортного средства', 'эвакуация'] },
  { id: 'interrogation', title: 'Допрос', hint: 'Кого, когда и о чём', words: ['допрос'] },
  { id: 'release', title: 'Освобождение', hint: 'Когда отпускают задержанного', words: ['освобождение задержанного', 'подлежит освобождению', 'освобожден'] },
  { id: 'fines', title: 'Штрафы', hint: 'За что берут штраф', sanctions: ['fine', 'fine-multiple'] },
  { id: 'terms', title: 'Сроки', hint: 'Что грозит лишением свободы', sanctions: ['imprisonment', 'imprisonment-by-stars'] },
];

/** The topics an organisation sees first: the road police start from fines and cars. */
const FIRST: Record<string, string[]> = {
  gibdd: ['fines', 'vehicle', 'detention'],
  army: ['detention', 'force', 'search'],
  fso: ['force', 'detention', 'search'],
};

/** Topics are for the forces of the state: a doctor or a reporter does not detain anybody. */
export function topicsFor(organization: Organization | undefined): LawTopic[] {
  if (!organization?.force) return [];
  const first = FIRST[organization.id] ?? [];
  const order = (rule: TopicRule) => {
    const at = first.indexOf(rule.id);
    return at < 0 ? first.length + RULES.indexOf(rule) : at;
  };
  return [...RULES].sort((a, b) => order(a) - order(b)).map(({ id, title, hint }) => ({ id, title, hint }));
}

/** A topic is a short list to read through, not every article the words turn up in. */
const TOPIC_LIMIT = 30;

/** Rules of the game are not the law: the topics take laws, codes and charters. */
const isLaw = (document: LawDocument) => document.kind !== 'rules';

const punishedWith = (article: Article, kinds: Sanction['kind'][]) =>
  article.parts.some((part) => part.punishment?.alternatives.some((sanction) => kinds.includes(sanction.kind)));

/** The articles of a topic on this server, the organisation's own documents first. */
export function topicArticles(pack: ServerPack, id: string, boostDocuments: string[] = []): SearchHit[] {
  const rule = RULES.find((r) => r.id === id);
  if (!rule) return [];
  const own = new Set(boostDocuments);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const add = (hit: SearchHit) => {
    if (seen.has(hit.article.id) || !isLaw(hit.document)) return;
    seen.add(hit.article.id);
    hits.push({ article: hit.article, document: hit.document });
  };
  if (rule.sanctions) {
    for (const document of pack.documents) {
      if (document.kind !== 'penal-code') continue;
      for (const article of document.articles) if (punishedWith(article, rule.sanctions)) add({ article, document });
    }
    return hits;
  }
  // Every word is searched whole (a trailing space); an article high in several lists leads, the
  // organisation's own documents before the rest. Codes are left to fines and terms: here go the procedures.
  const score = new Map<string, number>();
  for (const words of rule.words ?? []) {
    searchArticles(pack, `${words} `, { boostDocuments, limit: 200 })
      .filter((hit) => hit.document.kind !== 'penal-code')
      .forEach((hit, rank) => {
        add(hit);
        score.set(hit.article.id, (score.get(hit.article.id) ?? 0) + 1 / (1 + rank / 8));
      });
  }
  const weight = (hit: SearchHit) => (score.get(hit.article.id) ?? 0) + (own.has(hit.document.id) ? 1 : 0);
  return hits.sort((a, b) => weight(b) - weight(a)).slice(0, TOPIC_LIMIT);
}
