// The AI's answer checked against the sources themselves, without the AI. Every norm it names must be one it was
// shown, of this server, with the part it names, of a type the question's scope allows; every statement about the
// norms must name its own sources, and every figure in it must stand in those very sources; an article the answer
// mentions must be among them. What does not pass marks the answer as one to check — it is never shown as confirmed.
import { articleLabel, articleText, calculateDetention, leadPart, type Charge, type DetentionResult, type SearchHit, type ServerPack } from '../core';
import type { AnswerNorm, Claim, LegalAnswer } from './answer';
import { SOURCE_TYPE_LABELS, inScope, type Scope, type Source, type SourceType } from './sources';

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
  const source = sources.get(norm.source);
  if (!source) {
    const issue = articleExists(pack, norm.ref)
      ? `${norm.ref}: ИИ сослался на норму, которой не было среди найденных, — её текст он не видел`
      : `${norm.ref || norm.source}: такой нормы нет в базе сервера «${pack.server.name}»`;
    return { norm, issues: [issue] };
  }
  const { article, document } = source.hit;
  const issues: string[] = [];
  const named = parseRef(norm.ref);
  if (named && (named.number !== article.number || !(document.short.toLowerCase() === named.short || document.aliases.includes(named.short)))) {
    // The label names another article of the server: which of the two the AI meant cannot be told — it is to
    // check. A label naming none is the AI's slip in writing it («86 УК ст. 2», «R5 ст. 5.3»): the source it gave
    // is the norm, shown under the source's own label.
    if (articleExists(pack, norm.ref)) issues.push(`${norm.ref}: ИИ указал не тот номер — источник ${norm.source} это ${document.short} ${article.number}`);
    else norm = { ...norm, ref: `${document.short} ${articleLabel(article, undefined, document.unit)}` };
  }
  if (scope && !inScope(source.type, scope)) {
    issues.push(`${norm.ref || norm.source}: это ${SOURCE_TYPE_LABELS[source.type].toLowerCase()}, а вопрос — о другом`);
  }
  let part = source.hit.part;
  // An article written as one whole has no parts to get wrong: «ч. 1» of it is the article itself.
  if (norm.part && article.parts.some((p) => p.number)) {
    part = article.parts.find((p) => p.number === norm.part);
    if (!part) issues.push(`${document.short} ${article.number}: в статье нет части ${norm.part}`);
  }
  return { norm, hit: { article, document, ...(part ? { part } : {}) }, type: source.type, issues };
}

const LAW_SIDE = new Set<SourceType>(['law', 'charter']);

/**
 * One statement about the norms: it names sources, every one was given, of a type the scope allows, not a law and
 * a rule of the server at once, and every figure in it stands in the sources it names.
 */
function checkClaim(claim: Claim, what: string, sources: Map<string, Source>, scope: Scope | undefined, fallback: string[]): string[] {
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
  if (given.some((s) => LAW_SIDE.has(s.type)) && given.some((s) => s.type === 'server_rule')) {
    issues.push(`${what}: закон и правило сервера смешаны в одном утверждении`);
  }
  const known = new Set(given.flatMap(figuresOf));
  const invented = [...new Set(figures(claim.text).filter((n) => n >= 2 && !known.has(n)))];
  if (invented.length) issues.push(`${what}: в указанных источниках нет цифр ${invented.join(', ')}`);
  return issues;
}

/**
 * Checks an answer against the sources it was given and the server's base. `scope`: what the question was about —
 * a norm of another kind in the answer is an issue. Answers saved before claims had sources are held to the norms
 * they cited, as they were then.
 */
export function validateAnswer(pack: ServerPack, sources: Source[], answer: LegalAnswer, scope?: Scope): Validation {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const norms = answer.norms.map((norm) => checkNorm(pack, byId, norm, scope));
  const issues = norms.flatMap((n) => n.issues);

  const fallback = answer.legacy ? norms.filter((n) => n.hit).map((n) => n.norm.source) : [];
  if (answer.violation) issues.push(...checkClaim(answer.violation, 'Нарушение', byId, scope, fallback));
  if (answer.punishment) issues.push(...checkClaim(answer.punishment, 'Наказание', byId, scope, fallback));
  answer.procedure.forEach((step, i) => issues.push(...checkClaim(step, `Порядок, шаг ${i + 1}`, byId, scope, fallback)));

  // An article the answer mentions must be one of its sources: a number the player suggested («это же 777») or the
  // model remembered is not a source.
  const numbers = new Set(sources.map((s) => s.hit.article.number));
  const prose = [answer.situation, ...answer.uncertainty, ...answer.norms.map((n) => n.why), answer.violation?.text ?? '', answer.punishment?.text ?? '', ...answer.procedure.map((s) => s.text)];
  const stray = [...new Set(prose.flatMap(namedArticles).filter((n) => !numbers.has(n)))];
  if (stray.length) issues.push(`Упомянута статья ${stray.join(', ')}, которой нет среди найденных источников`);

  const valid = norms.filter((n) => n.hit && !n.issues.length);
  let status: Status;
  if (answer.questions.length && !valid.some((n) => n.norm.fit === 'direct')) status = 'clarify';
  else if (!valid.length) status = answer.questions.length ? 'clarify' : 'not-found';
  else if (!issues.length && !answer.assumptions.length && valid.every((n) => n.norm.fit === 'direct')) status = 'confirmed';
  else status = 'likely';

  return { norms, issues, status, needsReview: issues.length > 0 };
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
