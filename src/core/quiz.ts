// Practice with no AI (roadmap 6А, ADR 0009): quick questions made from the server's laws themselves — the number of
// an article, what an article is about, what a part is punished with — each with four answers to choose from. The
// right one is the law's own and the others are of the same document, so nothing is made up and nothing is asked
// that the server's laws do not say.
import { articleLabel, formatPunishment } from './format';
import type { Article, LawDocument, Part, ServerPack } from './model';
import type { SearchHit } from './search';

export type QuizKind = 'number' | 'title' | 'punishment';

export interface QuizQuestion {
  kind: QuizKind;
  /** What is asked, «УК: «Кража» — какой номер у статьи?». */
  prompt: string;
  /** Four answers, the right one among them. */
  options: string[];
  /** Which of `options` is right. */
  answer: number;
  /** The article it is about, to open after the answer. */
  hit: SearchHit;
}

/** Answers to choose from in a question. */
export const OPTIONS = 4;
/** A title this short is a heading's leftover, not one to ask by. */
const MIN_TITLE = 4;

/** Numbers that repeat for the same seed — the tests' — or `Math.random`. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text);
const label = (document: LawDocument, article: Article, part?: Part) => `${document.short} ${articleLabel(article, part, document.unit)}`;

/** The right answer and three others of the same document, all different, shuffled; null when there are not enough. */
function choices(right: string, others: string[], random: () => number): { options: string[]; answer: number } | null {
  const distinct = [...new Set(others.filter((other) => other !== right))];
  if (distinct.length < OPTIONS - 1) return null;
  const options = shuffle([right, ...shuffle(distinct, random).slice(0, OPTIONS - 1)], random);
  return { options, answer: options.indexOf(right) };
}

function question(kind: QuizKind, document: LawDocument, article: Article, random: () => number): QuizQuestion | null {
  const titled = (a: Article) => !!a.title && a.title.length >= MIN_TITLE;
  if (kind === 'number' && titled(article)) {
    const set = choices(label(document, article), document.articles.filter(titled).map((a) => label(document, a)), random);
    return set && { kind, prompt: `${document.short}: «${article.title}» — какой номер у статьи?`, ...set, hit: { article, document } };
  }
  if (kind === 'title' && titled(article)) {
    const set = choices(article.title, document.articles.filter(titled).map((a) => a.title), random);
    return set && { kind, prompt: `${label(document, article)} — о чём эта статья?`, ...set, hit: { article, document } };
  }
  if (kind === 'punishment') {
    const parts = article.parts.filter((p) => p.punishment && p.text);
    if (!parts.length) return null;
    const part = parts[Math.floor(random() * parts.length)];
    const others = document.articles.flatMap((a) => a.parts.filter((p) => p.punishment).map((p) => formatPunishment(p.punishment!)));
    const set = choices(formatPunishment(part.punishment!), others, random);
    // «Те же деяния: а) …; б) …» says nothing without its article and its points: the question carries both.
    const deed = [part.text, ...part.points.map((p) => `${p.marker}) ${p.text}`)].join(' ');
    const title = article.title ? ` «${article.title}»` : '';
    return set && { kind, prompt: `${label(document, article, part)}${title}: ${clip(deed, 220)} — какое наказание?`, ...set, hit: { article, document, part } };
  }
  return null;
}

/**
 * A round of `count` questions on these documents of the pack, kinds and articles mixed; an article is asked once.
 * Fewer when the documents have too little to ask (a charter with no titles and no punishments has none).
 */
export function quizRound(pack: ServerPack, documentIds: string[], count: number, random: () => number = Math.random): QuizQuestion[] {
  const documents = pack.documents.filter((d) => documentIds.includes(d.id));
  const all = documents.flatMap((document) => document.articles.map((article) => ({ document, article })));
  // What an officer meets on duty first — the offences, with a punishment — then the rest, should those run out.
  const punished = (article: Article) => article.parts.some((p) => p.punishment);
  const pool = [...shuffle(all.filter((a) => punished(a.article)), random), ...shuffle(all.filter((a) => !punished(a.article)), random)];
  const kinds: QuizKind[] = ['number', 'title', 'punishment'];
  const round: QuizQuestion[] = [];
  for (const { document, article } of pool) {
    if (round.length >= count) break;
    // The kinds in turn, the next one tried when an article has nothing for this one.
    const first = round.length % kinds.length;
    for (let k = 0; k < kinds.length; k++) {
      const made = question(kinds[(first + k) % kinds.length], document, article, random);
      if (made) {
        round.push(made);
        break;
      }
    }
  }
  return round;
}
