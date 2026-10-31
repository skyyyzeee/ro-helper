// The AI's answer checked against the sources themselves, without the AI. Every norm it names must be one it was
// shown, of this server, with the part it names, of a type the question's scope allows; every statement about the
// norms must name its own sources, and every figure in it must stand in those very sources; an article the answer
// mentions must be among them. What does not pass marks the answer as one to check — it is never shown as confirmed.
import { articleLabel, articleText, calculateDetention, leadPart, type Article, type Charge, type DetentionResult, type SearchHit, type ServerPack } from '../core';
import { cachedStem, words } from '../core/wordIndex';
import type { AnswerNorm, Claim, GuideItem, LegalAnswer } from './answer';
import { SOURCE_TYPE_LABELS, inScope, type Scope, type Source, type SourceType } from './sources';
import type { ShownVerdict } from './verdict';

/**
 * How firm the answer is, from the sources and the checks — never the model's own opinion of itself:
 * - confirmed — a found norm fits the facts outright and every check passed;
 * - likely — norms fit, but only partly, or on an assumption, or a check failed;
 * - clarify — it turns on a fact not known yet: the AI asks;
 * - not-found — no norm of the server's base bears on it (decided by the checks, not by the model's flag).
 */
export type Status = 'confirmed' | 'likely' | 'clarify' | 'not-found';

export const STATUS_LABELS: Record<Status, string> = {
  confirmed: 'Подтверждено',
  likely: 'Вероятно подходит',
  clarify: 'Нужно уточнение',
  'not-found': 'Не найдено',
};

export interface CheckedNorm {
  norm: AnswerNorm;
  /** The article (and part) it names, when it is one of the found ones. */
  hit?: SearchHit;
  /** Its kind of norm, when it is one of the found ones. */
  type?: SourceType;
  /** What is wrong with it; empty when it passed. */
  issues: string[];
}

export interface Validation {
  norms: CheckedNorm[];
  /** Everything that failed, for the player to see. */
  issues: string[];
  status: Status;
  /** Something failed: the answer is shown as one to check against the sources. */
  needsReview: boolean;
  /** To a question answered yes or no: «да» or «нет» only where the verdict stands on the sources, else «нужно уточнение». */
  verdict?: ShownVerdict;
}

/** «УК ст. 65 ч. 2» → the document's short name and the article number: «УК», «65». */
function parseRef(ref: string): { short: string; number: string } | null {
  const match = ref.match(/^(.+?)\s+(?:ст\.?|статья|п\.?|пункт)\s*(\d+(?:\.\d+)*)/i);
  return match ? { short: match[1].trim().toLowerCase(), number: match[2] } : null;
}

/** Whether the server's laws have the article a label names, in any document of that short name. */
export function articleExists(pack: ServerPack, ref: string): boolean {
  const parsed = parseRef(ref);
  if (!parsed) return false;
  return pack.documents.some(
    (d) => (d.short.toLowerCase() === parsed.short || d.aliases.includes(parsed.short)) && d.articles.some((a) => a.number === parsed.number),
  );
}

/** The article a label names: the first of that number in a document of that short name. */
function namedArticle(pack: ServerPack, ref: string): Article | undefined {
  const parsed = parseRef(ref);
  if (!parsed) return undefined;
  for (const d of pack.documents) {
    if (d.short.toLowerCase() !== parsed.short && !d.aliases.includes(parsed.short)) continue;
    const found = d.articles.find((a) => a.number === parsed.number);
    if (found) return found;
  }
  return undefined;
}

/** How many words of a text an article holds — its title and text, by their stems. */
function overlap(text: string, article: Article): number {
  const own = new Set(words(`${article.title} ${articleText(article)}`).map(cachedStem));
  return new Set(words(text).map(cachedStem).filter((stem) => own.has(stem))).size;
}

/** Figures of a text: «50 000», «50.000» and «50000» are one number; article and part numbers are not figures. */
export function figures(text: string): number[] {
  const cleaned = text.replace(/(?:ст|ч|п|статья|статье|статьи|часть|части|пункт)\.?\s*\d+(?:\.\d+)*/gi, ' ');
  return (cleaned.match(/\d{1,3}(?:[\s .]\d{3})+(?!\d)|\d+/g) ?? []).map((n) => Number(n.replace(/[\s .]/g, '')));
}

/** Article numbers a text names: «по ст. 65», «статья 777», «статьи 10.2». */
export function namedArticles(text: string): string[] {
  return [...text.matchAll(/(?:ст\.?|стать[яиеюей]+)\s*(\d+(?:\.\d+)*)/gi)].map((m) => m[1]);
}

/** Figures a source vouches for: its text and the stars of its parts. */
const figuresOf = (source: Source) => [
  ...figures(articleText(source.hit.article)),
  ...source.hit.article.parts.flatMap((p) => (p.stars ? [p.stars.min, p.stars.max] : [])),
];

function checkNorm(pack: ServerPack, sources: Map<string, Source>, norm: AnswerNorm, scope?: Scope): CheckedNorm {
  let source = sources.get(norm.source);
  if (!source) {
    const issue = articleExists(pack, norm.ref)
      ? `${norm.ref}: ИИ сослался на норму, которой не было среди найденных, — её текст он не видел`
      : `${norm.ref || norm.source}: такой нормы нет в базе сервера «${pack.server.name}»`;
    return { norm, issues: [issue] };
  }
  const issues: string[] = [];
  const named = parseRef(norm.ref);
  const namedIs = (hit: SearchHit) =>
    !!named && named.number === hit.article.number && (hit.document.short.toLowerCase() === named.short || hit.document.aliases.includes(named.short));
  if (named && !namedIs(source.hit)) {
    // The article the label names may be among the sources itself, under another id: then the id is the slip —
    // the norm belongs to the source that holds the article it names.
    const holds = [...sources.values()].find((s) => namedIs(s.hit));
    if (holds) {
      norm = { ...norm, source: holds.id };
      source = holds;
    } else {
      // Which of the two the AI meant, its own words tell: «why» closer to the source it gave than to the article
      // the label names — the label is a slip, the source is the norm.
      const meant = articleExists(pack, norm.ref) ? namedArticle(pack, norm.ref) : undefined;
      if (meant && overlap(norm.why, meant) > overlap(norm.why, source.hit.article)) {
        issues.push(`${norm.ref}: ИИ указал не тот номер — источник ${norm.source} это ${source.hit.document.short} ${source.hit.article.number}`);
      } else norm = { ...norm, ref: `${source.hit.document.short} ${articleLabel(source.hit.article, undefined, source.hit.document.unit)}` };
    }
  }
  const { article, document } = source.hit;
  if (scope && !inScope(source.type, scope)) {
    issues.push(`${norm.ref || norm.source}: это ${SOURCE_TYPE_LABELS[source.type].toLowerCase()}, а вопрос — о другом`);
  }
  let part = source.hit.part;
  // An article written as one whole has no parts to get wrong: «ч. 1» of it is the article itself.
  if (norm.part && article.parts.some((p) => p.number)) {
    // A precise model names several parts, or a part with its point: «1, 3», «ч. 1 и 2», «1, п. а», «2б». Each
    // number must be a part of the article; the first is the one the card shows.
    const named = norm.part.match(/\d+(?:\.\d+)*/g) ?? [];
    const missing = named.filter((n) => !article.parts.some((p) => p.number === n));
    part = named.length ? article.parts.find((p) => p.number === named[0]) : undefined;
    if (!named.length || missing.length) issues.push(`${document.short} ${article.number}: в статье нет части ${missing.join(', ') || norm.part}`);
  }
  return { norm, hit: { article, document, ...(part ? { part } : {}) }, type: source.type, issues };
}

/**
 * One statement about the norms: it names sources, every one was given, of a type the scope allows, and every figure
 * in it stands in the sources it names. A law and a rule of the server may stand in one statement — «DM: деморган
 * или бан; персонажу — 50 месяцев» — each checked as its own source; the answer shows each under its own side.
 */
function checkClaim(claim: Claim, what: string, sources: Map<string, Source>, scope: Scope | undefined, fallback: string[], told: number[] = []): string[] {
  const named = claim.sources.length ? claim.sources : fallback;
  if (!named.length) return [`${what}: утверждение без источника — проверьте его по статьям`];
  const issues: string[] = [];
  const given = named.flatMap((id) => {
    const source = sources.get(id);
    if (!source) issues.push(`${what}: ссылка на источник ${id}, которого ИИ не передавали`);
    return source ? [source] : [];
  });
  for (const source of given) {
    if (scope && !inScope(source.type, scope)) issues.push(`${what}: опирается на ${SOURCE_TYPE_LABELS[source.type].toLowerCase()}, а вопрос — о другом`);
  }
  const known = new Set([...given.flatMap(figuresOf), ...told]);
  const invented = [...new Set(figures(claim.text).filter((n) => n >= 2 && !known.has(n)))];
  if (invented.length) issues.push(`${what}: в указанных источниках нет цифр ${invented.join(', ')}`);
  return issues;
}

/**
 * Checks an answer against the sources it was given and the server's base. `scope`: what the question was about —
 * a norm of another kind in the answer is an issue. Answers saved before claims had sources are held to the norms
 * they cited, as they were then. `told`: the player's own words — a figure of the case they gave («предложил
 * 50 000») may stand in what is broken; never in the punishment, the steps or the verdict, which are the laws' alone
 * («штраф ведь 1 000 000?» stays a figure to flag).
 */
export function validateAnswer(pack: ServerPack, sources: Source[], answer: LegalAnswer, scope?: Scope, told = ''): Validation {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const norms = answer.norms.map((norm) => checkNorm(pack, byId, norm, scope));
  const issues = norms.flatMap((n) => n.issues);

  const fallback = answer.legacy ? norms.filter((n) => n.hit).map((n) => n.norm.source) : [];
  if (answer.violation) issues.push(...checkClaim(answer.violation, 'Нарушение', byId, scope, fallback, figures(told)));
  if (answer.punishment) issues.push(...checkClaim(answer.punishment, 'Наказание', byId, scope, fallback));
  answer.procedure.forEach((step, i) => issues.push(...checkClaim(step, `Порядок, шаг ${i + 1}`, byId, scope, fallback)));
  const verdictIssues = answer.verdict ? checkClaim(answer.verdict, 'Ответ', byId, scope, fallback) : [];
  issues.push(...verdictIssues);

  // An article the answer mentions must be one of its sources: a number the player suggested («это же 777») or the
  // model remembered is not a source.
  const numbers = new Set(sources.map((s) => s.hit.article.number));
  const prose = [answer.situation, answer.verdict?.text ?? '', ...answer.uncertainty, ...answer.norms.map((n) => n.why), answer.violation?.text ?? '', answer.punishment?.text ?? '', ...answer.procedure.map((s) => s.text)];
  const stray = [...new Set(prose.flatMap(namedArticles).filter((n) => !numbers.has(n)))];
  if (stray.length) issues.push(`Упомянута статья ${stray.join(', ')}, которой нет среди найденных источников`);

  const valid = norms.filter((n) => n.hit && !n.issues.length);
  let status: Status;
  if (answer.questions.length && !valid.some((n) => n.norm.fit === 'direct')) status = 'clarify';
  else if (!valid.length) status = answer.questions.length ? 'clarify' : 'not-found';
  else if (!issues.length && !answer.assumptions.length && valid.every((n) => n.norm.fit === 'direct')) status = 'confirmed';
  else status = 'likely';

  // «Да» or «нет» is shown only over an answer that stands: on its own sources, with a norm that holds.
  const verdict: ShownVerdict | undefined = !answer.verdict
    ? undefined
    : verdictIssues.length || status === 'clarify' || status === 'not-found'
      ? 'clarify'
      : answer.verdict.answer;
  return { norms, issues, status, needsReview: issues.length > 0, ...(verdict ? { verdict } : {}) };
}

/**
 * The punishment the laws give for the charges the AI found, from the calculator — the AI names the articles,
 * the calculator counts. Only checked articles of the codes the calculator knows; null when there are none.
 */
export function calculateCharges(pack: ServerPack, validation: Validation): { charges: Charge[]; result: DetentionResult } | null {
  const rules = pack.calculator;
  if (!rules) return null;
  const codes = [rules.criminalCode, rules.administrative.code];
  const seen = new Set<string>();
  const charges: Charge[] = [];
  for (const { norm, hit, issues } of validation.norms) {
    // Only what the facts establish is charged: an article that fits «if it is confirmed» is an alternative, not a sum.
    if (!norm.charge || norm.fit !== 'direct' || !hit || issues.length || !codes.includes(hit.document.id)) continue;
    const part = hit.part?.punishment ? hit.part : leadPart(hit.article);
    if (!part || seen.has(hit.article.id)) continue;
    seen.add(hit.article.id);
    charges.push({ article: hit.article, document: hit.document, part, stage: norm.stage });
  }
  if (!charges.length) return null;
  return { charges, result: calculateDetention(charges, { mode: 'custody', offender: 'citizen' }, rules) };
}

/**
 * The points for the player's side that stand on the sources: each names given sources of the question's kind, holds
 * no figure they lack and no article that is not among them — «УПК ст. 12» is the УПК's, not a source's ст. 12 of
 * another law. The rest are left out — advice without its law is not shown at all. A source's id the model wrote
 * into the text («(S6)») is no word for the player: taken out.
 */
export function groundedGuide(guide: GuideItem[], sources: Source[], scope?: Scope): GuideItem[] {
  return sortGuide(guide, sources, scope).kept;
}

/** A point of the side's answer left out, and why — for the admin's debug view. */
export interface HiddenPoint {
  text: string;
  why: string;
}

/** {@link groundedGuide}, with the points it leaves out and why each. */
export function sortGuide(guide: GuideItem[], sources: Source[], scope?: Scope): { kept: GuideItem[]; hidden: HiddenPoint[] } {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const numbers = new Set(sources.map((s) => s.hit.article.number));
  const given = (short: string, number: string) => {
    const named = short.toLowerCase();
    const of = sources.filter((s) => s.hit.document.short.toLowerCase() === named || s.hit.document.aliases.includes(named));
    // A word before «ст.» that names no document of the sources («Согласно ст. 12») leaves the number to tell.
    return of.length ? of.some((s) => s.hit.article.number === number) : numbers.has(number);
  };
  const kept: GuideItem[] = [];
  const hidden: HiddenPoint[] = [];
  for (const raw of guide) {
    const item = { ...raw, text: raw.text.replace(/\s*\((?:[SCRO]\d+(?:,\s*)?)+\)/g, '').trim() };
    const named = [...item.text.matchAll(/((?:\d+-)?[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z]*)\s+(?:ст\.?|стать[яиеюей]+)\s*(\d+(?:\.\d+)*)/g)].find((m) => !given(m[1], m[2]));
    const why = !item.sources.length
      ? 'без источника'
      : (checkClaim(item, 'Пункт', byId, scope, [])[0] ??
        (namedArticles(item.text).find((n) => !numbers.has(n)) ? `статья ${namedArticles(item.text).find((n) => !numbers.has(n))} не среди источников` : named ? `${named[1]} ст. ${named[2]} не среди источников` : ''));
    if (why) hidden.push({ text: item.text, why });
    else kept.push(item);
  }
  return { kept, hidden };
}
