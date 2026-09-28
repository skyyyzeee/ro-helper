// The AI's answer checked against the laws themselves, without the AI: every article it cites must be one it was
// shown, of this server, with the part it names, and every figure of the punishment must stand in those articles.
// What does not pass marks the answer as one to check — it is never shown as confirmed.
import { articleText, calculateDetention, leadPart, type Charge, type DetentionResult, type SearchHit, type ServerPack } from '../core';
import type { AnswerNorm, LegalAnswer } from './answer';
import type { Source } from './context';

/**
 * How firm the answer is, from the sources and the checks — never the model's own opinion of itself:
 * - confirmed — a found article fits the facts outright and every check passed;
 * - likely — articles fit, but only partly, or on an assumption, or a check failed;
 * - clarify — it turns on a fact not known yet: the AI asks;
 * - not-found — no article of the server's laws bears on it.
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
  /** What is wrong with it; empty when it passed. */
  issues: string[];
}

export interface Validation {
  norms: CheckedNorm[];
  /** Everything that failed, for the player to see. */
  issues: string[];
  status: Status;
  /** Something failed: the answer is shown as one to check against the articles. */
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
  const cleaned = text.replace(/(?:ст|ч|п|статья|часть|пункт)\.?\s*\d+(?:\.\d+)*/gi, ' ');
  return (cleaned.match(/\d{1,3}(?:[\s .]\d{3})+(?!\d)|\d+/g) ?? []).map((n) => Number(n.replace(/[\s .]/g, '')));
}

function checkNorm(pack: ServerPack, sources: Map<string, Source>, norm: AnswerNorm): CheckedNorm {
  const source = sources.get(norm.source);
  if (!source) {
    const issue = articleExists(pack, norm.ref)
      ? `${norm.ref}: ИИ сослался на статью, которой не было среди найденных, — её текст он не видел`
      : `${norm.ref || norm.source}: такой статьи нет в законах сервера «${pack.server.name}»`;
    return { norm, issues: [issue] };
  }
  const { article, document } = source.hit;
  const issues: string[] = [];
  const named = parseRef(norm.ref);
  if (named && (named.number !== article.number || !(document.short.toLowerCase() === named.short || document.aliases.includes(named.short)))) {
    issues.push(`${norm.ref}: ИИ указал не тот номер — источник ${norm.source} это ${document.short} ${article.number}`);
  }
  let part = source.hit.part;
  // An article written as one whole has no parts to get wrong: «ч. 1» of it is the article itself.
  if (norm.part && article.parts.some((p) => p.number)) {
    part = article.parts.find((p) => p.number === norm.part);
    if (!part) issues.push(`${document.short} ${article.number}: в статье нет части ${norm.part}`);
  }
  return { norm, hit: { article, document, ...(part ? { part } : {}) }, issues };
}

/** Checks an answer against the sources it was given and the server's laws. */
export function validateAnswer(pack: ServerPack, sources: Source[], answer: LegalAnswer): Validation {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const norms = answer.norms.map((norm) => checkNorm(pack, byId, norm));
  const issues = norms.flatMap((n) => n.issues);

  // Figures of the punishment and the procedure must be in the articles the answer stands on.
  const known = new Set(
    norms.flatMap((n) =>
      n.hit ? [...figures(articleText(n.hit.article)), ...n.hit.article.parts.flatMap((p) => (p.stars ? [p.stars.min, p.stars.max] : []))] : [],
    ),
  );
  const said = [...figures(answer.punishment), ...answer.procedure.flatMap(figures)];
  const invented = [...new Set(said.filter((n) => n >= 2 && !known.has(n)))];
  if (invented.length) issues.push(`В названных статьях нет цифр: ${invented.join(', ')} — проверьте наказание по тексту статей`);

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
