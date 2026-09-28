import { articleText } from './changes';
import { articleLabel } from './format';
import type { ServerPack } from './model';
import { searchArticles, type SearchHit } from './search';
import { words } from './wordIndex';

/**
 * Everyday words of a situation told in the player's own words: they say nothing about which law applies.
 * On top of the stop words of the search itself.
 */
const SITUATION_STOP = new Set(
  'меня мне мой моя мое мои моих нас нам наш наша наше наши вас вам ваш ваша ваше ваши тебя тебе твой твоя они она оно него нее ему ей ими них там тут здесь сейчас потом тогда всё все всех всем уже еще ещё очень просто может можно нужно надо будет было стал стала стали сказал сказала говорит какой какая какое какие какую каким почему зачем кто куда откуда сколько где этот эта эту эти после перед через около возле рядом один одна одно два две три'.split(
    ' ',
  ),
);

/** Where a found article sits on a word of the situation: nearer the top of that word's results counts more. */
const WORD_RESULTS = 60;

export interface SituationOptions {
  /** Documents of the user's organisation; they rank above the rest, as in search. */
  boostDocuments?: string[];
  /**
   * The situation retold in the words of the law («оружие», «сокрытие лица»), a few words each: every one is
   * searched as a whole, and its words join the situation's own.
   */
  lawTerms?: string[];
  limit?: number;
}

/**
 * Articles that bear on a situation told in free words («человек в маске с электродубинкой возле МВД»).
 * The search wants every word in one article; a situation's words are spread over several, so each word
 * is looked up alone and an article gains for every word it holds — rare words weigh more than common ones,
 * and an article holding several of them goes above one that holds a single word many times.
 * Whole articles, not parts: the AI reads the article as a whole.
 */
export function findForSituation(pack: ServerPack, text: string, options: SituationOptions = {}): SearchHit[] {
  const phrases = (options.lawTerms ?? []).map((term) => term.trim()).filter(Boolean).slice(0, 12);
  const terms = [...new Set(words([text, ...phrases].join(' ')))].filter((word) => !SITUATION_STOP.has(word)).slice(0, 40);
  const total = pack.documents.reduce((n, document) => n + document.articles.length, 0) || 1;
  const found = new Map<string, { hit: SearchHit; score: number; terms: Set<string>; order: number }>();
  let order = 0;

  const add = (hits: SearchHit[], weight: number, term?: string) => {
    hits.forEach((hit, rank) => {
      const key = hit.article.id;
      const entry = found.get(key) ?? { hit: { article: hit.article, document: hit.document }, score: 0, terms: new Set(), order: order++ };
      // The search puts a word found in the title first: the top of each word's list counts most.
      entry.score += weight / (1 + rank / 8);
      if (term) entry.terms.add(term);
      found.set(key, entry);
    });
  };

  // A trailing space: every word is whole, none is still being typed.
  const search = (query: string) => searchArticles(pack, `${query} `, { boostDocuments: options.boostDocuments, limit: WORD_RESULTS });
  // Articles holding every word of the situation, or of one of its terms in the words of the law, lead.
  if (terms.length > 1) add(search(terms.join(' ')), 3 * terms.length);
  for (const phrase of phrases) if (words(phrase).length > 1) add(search(phrase), 6, phrase);
  // An article number named in the text («по 65 статье») is looked up as a number.
  for (const number of text.match(/\b\d+(?:\.\d+)*\b/g) ?? []) add(search(number).slice(0, 3), 4);
  for (const term of terms) {
    const hits = search(term);
    if (hits.length) add(hits, Math.log(1 + total / hits.length), term);
  }

  const rank = (entry: { score: number; terms: Set<string> }) => entry.score * (1 + 0.6 * Math.max(0, entry.terms.size - 1));
  return [...found.values()]
    .sort((a, b) => rank(b) - rank(a) || a.order - b.order)
    .slice(0, options.limit ?? 12)
    .map((entry) => entry.hit);
}

/** How long one article may be in what the AI is given, so a dozen fit and a huge one does not crowd out the rest. */
const SOURCE_CHARS = 1800;

/** The label the AI cites an article by, and the player reads: «УК ст. 65 «Кража»». */
export function sourceLabel(hit: SearchHit): string {
  const { article, document } = hit;
  return `${document.short} ${articleLabel(article, undefined, document.unit)}${article.title ? ` «${article.title}»` : ''}`;
}

/** The found articles as text for the AI: each under its label and the full name of its document. */
export function sourcesText(hits: SearchHit[]): string {
  return hits
    .map((hit) => {
      const text = articleText(hit.article);
      const cut = text.length > SOURCE_CHARS ? `${text.slice(0, SOURCE_CHARS)}…` : text;
      return `### ${sourceLabel(hit)} — ${hit.document.title}\n${cut}`;
    })
    .join('\n\n');
}
