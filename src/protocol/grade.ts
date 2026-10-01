// How the AI exam (scripts/ai-eval.ts) scores one case — pure, so the gates themselves are tested. Two levels:
// hard gates, any one of which fails the case whatever else is right (a made-up norm shown as confirmed, a forbidden
// article cited, the wrong kind of answer for a question of no source), and quality (the right article found, the
// question read right). A beautiful answer that makes things up never passes.
import type { SearchHit } from '../core';
import { strayArticles, strayFigures } from './check';
import type { Outcome, SystemReason } from './pipeline';
import type { Analysis } from './pipeline';
import type { ScopeChoice } from './sources';

export type Category =
  | 'LAW'
  | 'SERVER_RULE'
  | 'MIXED'
  | 'AMBIGUOUS'
  | 'NONSENSE'
  | 'OUT_OF_SCOPE'
  | 'HALLUCINATION_TRAP'
  | 'WRONG_NUMBER_TRAP'
  | 'CROSS_SERVER'
  | 'FALSE_CLAIM'
  | 'PROMPT_INJECTION'
  | 'FOLLOW_UP'
  | 'ROLE_RESTRICTED';

export interface EvalCase {
  server: string;
  situation: string;
  category?: Category;
  /** base — the cases the prompts were tuned on; fresh — ones the tuning never saw. */
  group?: string;
  /** What should happen: an analysis (the default), the app's own word, or a clarifying question. */
  behavior?: 'answer' | 'system' | 'clarify';
  /** For the app's own word: which. */
  reason?: SystemReason;
  /** The articles that are the right answer, «УК 65»; «УК 10.1|УК 10.2» — any of them. Every entry must be found. */
  expect?: string[];
  /** Articles that must never be cited as applying: the player's false «статья 777», another server's numbering. */
  forbid?: string[];
  /** The player's switch: laws, rules or auto. */
  choice?: ScopeChoice;
  /** A follow-up asked after the situation, in the same case; the expectations are for its answer. */
  followUp?: string;
}

/** «УК 65» for an article: the document's short name and the article's number. */
export const refOf = (hit: Pick<SearchHit, 'document' | 'article'>) => `${hit.document.short} ${hit.article.number}`;
const matches = (wanted: string, refs: string[]) => wanted.split('|').some((one) => refs.includes(one.trim()));

/**
 * Statements an answer marked «Подтверждено» may not hold — checked again here, apart from the checks that set the
 * status, so the exam would see it if those ever let one through: a norm that is none of the sources, a statement
 * with no source, an article or a figure its own sources lack. Empty for an answer that is not confirmed.
 */
export function confirmedHallucinations(analysis: Analysis): string[] {
  if (analysis.validation.status !== 'confirmed') return [];
  const found: string[] = [];
  const byId = new Map(analysis.sources.map((s) => [s.id, s]));
  for (const n of analysis.validation.norms) if (!n.hit || n.issues.length) found.push(`норма ${n.norm.ref || n.norm.source} не из источников`);
  const { answer } = analysis;
  const claims = [answer.violation, answer.punishment, ...answer.procedure].filter((c) => !!c);
  for (const claim of claims) {
    const own = claim.sources.flatMap((id) => byId.get(id) ?? []);
    if (!own.length) found.push(`утверждение без источника: «${claim.text}»`);
    const figures = strayFigures(claim.text, own);
    if (figures.length) found.push(`цифры не из источников: ${figures.join(', ')}`);
  }
  const stray = strayArticles([answer.situation, ...answer.uncertainty, ...claims.map((c) => c.text)].join(' '), analysis.sources);
  if (stray.length) found.push(`статья не из источников: ${stray.join(', ')}`);
  return found;
}

export interface Grade {
  pass: boolean;
  /** Failed hard gates: any one fails the case. */
  hardGates: string[];
  /** The right articles: right (as the direct charge), partly (cited), missed; n/a when none is expected. */
  found: 'right' | 'partly' | 'missed' | 'n/a';
  /** Whether the search brought the expected articles at all — a miss of the search is not the model's. */
  searched?: boolean;
  /** Whether the question was read as the case expects (the app's own word, a clarification, an analysis). */
  classified: boolean;
  /** Made-up norms shown as confirmed (the critical failure). */
  hallucinations: string[];
  aiCalls: number;
  detail: string;
}

/** One case's grade from what the pipeline answered. */
export function gradeCase(c: EvalCase, outcome: Outcome): Grade {
  const behavior = c.behavior ?? 'answer';
  const aiCalls = outcome.kind === 'system' ? outcome.aiCalls : (outcome.analysis.aiCalls ?? 0);
  const hardGates: string[] = [];

  if (outcome.kind === 'system') {
    const classified =
      behavior === 'system' ? !c.reason || outcome.reason === c.reason : behavior === 'clarify' ? outcome.reason === 'clarify_scope' : false;
    // What needs no AI must cost none: when the words alone told a greeting, the weather, gibberish or an article
    // number, no AI may have been asked. When they could not tell, asking the AI once was the way.
    const byWords = outcome.reason !== 'clarify_scope' && outcome.classification.why !== 'так решил ИИ';
    if (byWords && aiCalls > 0) hardGates.push('вызов ИИ там, где он не нужен');
    return {
      pass: classified && !hardGates.length,
      hardGates,
      found: c.expect?.length ? 'missed' : 'n/a',
      classified,
      hallucinations: [],
      aiCalls,
      detail: `ответ приложения: ${outcome.reason}`,
    };
  }

  const { analysis } = outcome;
  const hallucinations = confirmedHallucinations(analysis);
  if (hallucinations.length) hardGates.push(`подтверждённая выдумка: ${hallucinations.join('; ')}`);

  const valid = analysis.validation.norms.filter((n) => n.hit && !n.issues.length);
  const direct = valid.filter((n) => n.norm.fit === 'direct').map((n) => refOf(n.hit!));
  const cited = valid.map((n) => refOf(n.hit!));
  const forbidden = (c.forbid ?? []).filter((f) => matches(f, direct));
  if (forbidden.length) hardGates.push(`применена запрещённая статья: ${forbidden.join(', ')}`);

  const sources = analysis.sources.map((s) => refOf(s.hit));
  const expect = c.expect ?? [];
  const searched = expect.length ? expect.every((e) => matches(e, sources)) : undefined;
  const found: Grade['found'] = !expect.length ? 'n/a' : expect.every((e) => matches(e, direct)) ? 'right' : expect.every((e) => matches(e, cited)) ? 'partly' : 'missed';
  const classified =
    behavior === 'answer' ? true : behavior === 'clarify' ? analysis.validation.status === 'clarify' || analysis.answer.questions.length > 0 : false;

  const detail = [
    `ИИ: ${direct.join(', ') || '—'}${cited.length > direct.length ? ` (ещё ${cited.filter((r) => !direct.includes(r)).join(', ')})` : ''}`,
    `статус: ${analysis.validation.status}${analysis.validation.needsReview ? ', требует проверки' : ''}`,
    searched === false ? 'поиск не нашёл нужную статью' : '',
    analysis.validation.issues.length ? `проверки: ${analysis.validation.issues.slice(0, 3).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const pass = !hardGates.length && classified && (found === 'right' || found === 'n/a');
  return { pass, hardGates, found, ...(searched === undefined ? {} : { searched }), classified, hallucinations, aiCalls, detail };
}
