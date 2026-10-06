import { searchArticles, type SearchHit, type ServerPack } from '../core';
import { cachedStem, wordIndex, words } from '../core/wordIndex';

/**
 * «Что будет за кражу?», «сколько дают за 65?», «штраф за тонировку» — a question of what a deed is punished with,
 * whole in a few words. The base answers it alone: the article whose title names the deed, with its punishment, at
 * once and the same every time — no AI call, no day's limit spent. A question that tells a situation (who, where,
 * in what order) is the AI's, and so is one whose deed no title names plainly.
 */
const ASK = /^(?:(?:а|и|ну|скажите|подскажите)[,\s]+)?(?:что|чем|сколько|какое|какой|какая|какие|какой\s+срок|какой\s+штраф)?\s*(?:(?:мне|ему|ей|им)\s+)?(?:будет|грозит|светит|дадут|дают|дает|даёт|положено|наказание|наказывается|штраф|срок|статья|наказывают)\s*(?:будет|грозит|полагается|положен[оа]?|дают)?\s*(?:мне|ему|ей|им|человеку|игроку|гражданину)?\s+за\s+(.+?)[?!.\s]*$/i;

/** Longer than this, the words after «за» tell a story — the AI's. */
const SUBJECT_WORDS = 5;
/** More articles than this name the deed: it is too broad to answer without the AI weighing which. */
const MOST = 6;

/** An adjective before the deed, «Мелкое», «Незаконные» — not a noun in -ние, «Получение». */
const ADJECTIVE = /(?:ое|ая|ый|ий|ой|ые|[^н]ие)$/;

const punished = (hit: SearchHit) => hit.article.parts.some((part) => part.punishment);

/** The deed asked about: what comes after «за», or null when the question is not of that form. */
export function punishmentSubject(message: string): string | null {
  const text = message.trim().replace(/\s+/g, ' ').replace(/ё/gi, 'е');
  const subject = ASK.exec(text)?.[1]?.trim();
  // «за то, что…» tells what happened: the AI's.
  if (!subject || subject.split(' ').length > SUBJECT_WORDS || /^то\b/.test(subject)) return null;
  return subject;
}

/**
 * The articles of the penal codes that answer «что будет за …» by themselves: an article named by its number, or
 * the few whose title holds a word of the deed. Null when the base cannot answer it alone.
 */
export function directPunishment(pack: ServerPack, message: string, boostDocuments?: string[]): { subject: string; hits: SearchHit[] } | null {
  const subject = punishmentSubject(message);
  if (!subject) return null;
  const codes = (hit: SearchHit) => hit.document.kind === 'penal-code' && punished(hit);
  const found = searchArticles(pack, `${subject} `, { boostDocuments, limit: 40 }).filter(codes);
  const seen = new Set<string>();
  const unique = found.filter((hit) => !seen.has(hit.article.id) && seen.add(hit.article.id)).map(({ article, document }) => ({ article, document }));
  // By number: «за 65», «за ук 104».
  if (/\d/.test(subject)) return unique.length ? { subject, hits: unique.slice(0, 1) } : null;
  // Each word of the deed, or a phrase the server's dictionary gives for it («угон» → «завладение транспортным»).
  const index = wordIndex(pack);
  const alternatives = words(subject)
    .filter((w) => w.length > 2)
    .map((w) => [[cachedStem(w)], ...(index.synonyms.get(cachedStem(w)) ?? [])]);
  if (!alternatives.length) return null;
  const same = (t: string, s: string) => t === s || (s.length > 3 && t.startsWith(s));
  /** Where the phrase begins in the title, or -1 when the title does not hold all of it. */
  const at = (title: string[], phrase: string[]) => (phrase.every((s) => title.some((t) => same(t, s))) ? title.findIndex((t) => same(t, phrase[0])) : -1);
  const placed = unique
    .map((hit) => {
      const title = words(hit.article.title).map(cachedStem);
      const first = words(hit.article.title)[0] ?? '';
      const positions = alternatives.map((alts) => Math.max(...alts.map((phrase) => at(title, phrase))));
      // The deed heads the title — «Убийство…», «Мелкое хулиганство» — not «Угроза убийством».
      const head = positions[0] === 0 || (positions[0] === 1 && ADJECTIVE.test(first));
      return { hit, found: positions.every((p) => p >= 0), head };
    })
    .filter((x) => x.found);
  const headed = placed.filter((x) => x.head);
  const titled = (headed.length ? headed : placed).map((x) => x.hit);
  if (!titled.length || titled.length > MOST) return null;
  return { subject, hits: titled };
}
