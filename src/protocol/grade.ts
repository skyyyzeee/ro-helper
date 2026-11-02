// How the AI exam (scripts/ai-eval.ts) scores one case — pure, so the gates themselves are tested. Two levels:
// hard gates, any one of which fails the case whatever else is right (a made-up norm shown as confirmed, a forbidden
// article cited, the wrong kind of answer for a question of no source), and quality (the right article found, the
// question read right). A beautiful answer that makes things up never passes.
import type { SearchHit } from '../core';
import { strayArticles, strayFigures } from './check';
import type { Outcome, SystemReason } from './pipeline';
import type { Analysis } from './pipeline';
import type { ScopeChoice, Source } from './sources';

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
  | 'ROLE_RESTRICTED'
  /** A player's question the admins approved with its right articles (docs/AI_DATASET.md). */
  | 'APPROVED'
  /** The lawyer's demands, as an officer tells them (officerChecks.ts). */
  | 'LAWYER'
  /** A detention, as the officer tells it (officerChecks.ts). */
  | 'DETENTION';

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
  /**
   * The articles that are the right answer, «УК 65»; «УК 10.1|УК 10.2» — any of them. Every entry must be found. A
   * number several documents share («Правила 5.1» is in three sets of rules) is named by the article's id in the
   * base instead: «rules-main-5.1» (eval.test.ts keeps every one of them single).
   */
  expect?: string[];
  /** Articles that must never be cited as applying: the player's false «статья 777», another server's numbering. */
  forbid?: string[];
  /** The player's switch: laws, rules or auto. */
  choice?: ScopeChoice;
  /** A follow-up asked after the situation, in the same case; the expectations are for its answer. */
  followUp?: string;
  /** The mode it is asked in: the analysis (the default), the lawyer's demands, or the review of a detention. */
  mode?: 'analysis' | 'lawyer' | 'detention';
  /** For a check of an officer: the verdicts that must be among its items — «unlawful», «violation», each once. */
  verdicts?: string[];
  /** For a check of an officer: the verdicts none of its items may have — «violation» for a detention done right. */
  noVerdict?: string[];
}

type Hit = Pick<SearchHit, 'document' | 'article'>;

/** «УК 65» for an article: the document's short name and the article's number. */
export const refOf = (hit: Hit) => `${hit.document.short} ${hit.article.number}`;

/** Whether any of the articles is one of the wanted «УК 10.1|rules-main-5.1»: by its label or by its id in the base. */
export const matchesRef = (wanted: string, hits: Hit[]) =>
  wanted.split('|').some((one) => hits.some((hit) => one.trim() === refOf(hit) || one.trim() === hit.article.id));

/**
 * Statements an answer marked «Подтверждено» may not hold — checked again here, apart from the checks that set the
 * status, so the exam would see it if those ever let one through: a norm that is none of the sources, a statement
 * with no source, an article or a figure its own sources lack — but for a figure of the case the player told, in
 * what is broken (validate.ts). Empty for an answer that is not confirmed.
 */
export function confirmedHallucinations(analysis: Analysis, told = ''): string[] {
  if (analysis.validation.status !== 'confirmed') return [];
  const found: string[] = [];
  const byId = new Map(analysis.sources.map((s) => [s.id, s]));
  for (const n of analysis.validation.norms) if (!n.hit || n.issues.length) found.push(`норма ${n.norm.ref || n.norm.source} не из источников`);
  const { answer } = analysis;
  const claims = [answer.violation, answer.punishment, ...answer.procedure].filter((c) => !!c);
  for (const claim of claims) {
    const own = claim.sources.flatMap((id) => byId.get(id) ?? []);
    if (!own.length) found.push(`утверждение без источника: «${claim.text}»`);
    const figures = strayFigures(claim.text, own, claim === answer.violation ? told : '');
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

  // «Что будет за кражу?» answered by the base alone (direct.ts): its articles are the answer, as the AI's would be.
  if (outcome.kind === 'system' && outcome.reason === 'punishment' && behavior === 'answer') {
    const given = outcome.hits ?? [];
    const expect = c.expect ?? [];
    const forbidden = (c.forbid ?? []).filter((f) => matchesRef(f, given));
    if (forbidden.length) hardGates.push(`применена запрещённая статья: ${forbidden.join(', ')}`);
    const found: Grade['found'] = !expect.length ? 'n/a' : expect.every((e) => matchesRef(e, given)) ? 'right' : 'missed';
    return {
      pass: !hardGates.length && (found === 'right' || found === 'n/a'),
      hardGates,
      found,
      ...(expect.length ? { searched: found === 'right' } : {}),
      classified: true,
      hallucinations: [],
      aiCalls,
      detail: `ответ базы без ИИ: ${given.map(refOf).join(', ')}`,
    };
  }
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
  const hallucinations = confirmedHallucinations(analysis, `${c.situation}\n${c.followUp ?? ''}`);
  if (hallucinations.length) hardGates.push(`подтверждённая выдумка: ${hallucinations.join('; ')}`);

  const valid = analysis.validation.norms.filter((n) => n.hit && !n.issues.length);
  // A claim-check («мне сказали, что…») is answered by the norm that really covers the act. The model often marks
  // every severity branch «partial» — the publicity, the sum — though it names the charge outright; for a false
  // claim a charged norm counts as the answer, as a direct one does elsewhere.
  const applied = valid.filter((n) => n.norm.fit === 'direct' || (c.category === 'FALSE_CLAIM' && n.norm.charge)).map((n) => n.hit!);
  const cited = valid.map((n) => n.hit!);
  const forbidden = (c.forbid ?? []).filter((f) => matchesRef(f, applied));
  if (forbidden.length) hardGates.push(`применена запрещённая статья: ${forbidden.join(', ')}`);

  const sources = analysis.sources.map((s) => s.hit);
  const expect = c.expect ?? [];
  const searched = expect.length ? expect.every((e) => matchesRef(e, sources)) : undefined;
  const found: Grade['found'] = !expect.length ? 'n/a' : expect.every((e) => matchesRef(e, applied)) ? 'right' : expect.every((e) => matchesRef(e, cited)) ? 'partly' : 'missed';
  const classified =
    behavior === 'answer' ? true : behavior === 'clarify' ? analysis.validation.status === 'clarify' || analysis.answer.questions.length > 0 : false;

  const detail = [
    `ИИ: ${applied.map(refOf).join(', ') || '—'}${cited.length > applied.length ? ` (ещё ${cited.filter((h) => !applied.includes(h)).map(refOf).join(', ')})` : ''}`,
    `статус: ${analysis.validation.status}${analysis.validation.needsReview ? ', требует проверки' : ''}`,
    searched === false ? 'поиск не нашёл нужную статью' : '',
    analysis.validation.issues.length ? `проверки: ${analysis.validation.issues.slice(0, 3).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const pass = !hardGates.length && classified && (found === 'right' || found === 'n/a');
  return { pass, hardGates, found, ...(searched === undefined ? {} : { searched }), classified, hallucinations, aiCalls, detail };
}

/** A judged item of a check of an officer — a lawyer's demand or a detention's step — with the sources it stands on. */
export interface OfficerItem {
  verdict: string;
  sources: string[];
}

/**
 * A check of an officer's work as the exam weighs it: the expected articles must be what its judged items stand on,
 * the expected verdicts among theirs, and none of the verdicts it may not give. Its items were grounded already
 * (officerChecks.ts): one on no source given is «unclear» and counts for nothing here.
 */
export function gradeOfficerCheck(c: EvalCase, items: OfficerItem[], sources: Source[], aiCalls: number): Grade {
  const hardGates: string[] = [];
  const judged = items.filter((item) => item.verdict !== 'unclear');
  const ids = new Set(judged.flatMap((item) => item.sources));
  const cited = sources.filter((s) => ids.has(s.id)).map((s) => s.hit);
  const forbidden = (c.forbid ?? []).filter((f) => matchesRef(f, cited));
  if (forbidden.length) hardGates.push(`применена запрещённая статья: ${forbidden.join(', ')}`);
  const wrong = (c.noVerdict ?? []).filter((v) => judged.some((item) => item.verdict === v));
  if (wrong.length) hardGates.push(`вердикт, которого быть не должно: ${wrong.join(', ')}`);
  if (aiCalls > 1) hardGates.push(`вызовов ИИ ${aiCalls} вместо одного`);

  const expect = c.expect ?? [];
  const searched = expect.length ? expect.every((e) => matchesRef(e, sources.map((s) => s.hit))) : undefined;
  const found: Grade['found'] = !expect.length ? 'n/a' : expect.every((e) => matchesRef(e, cited)) ? 'right' : 'missed';
  // Each expected verdict once: two «unlawful» wanted need two items so judged.
  const left = judged.map((item) => item.verdict);
  const verdictsOk = (c.verdicts ?? []).every((v) => {
    const at = left.indexOf(v);
    return at >= 0 && left.splice(at, 1).length > 0;
  });
  const detail = [
    `проверка: ${items.map((item) => item.verdict).join(', ') || '—'} · опирается на ${[...new Set(cited.map(refOf))].join(', ') || '—'}`,
    searched === false ? 'поиск не нашёл нужную статью' : '',
    verdictsOk ? '' : `нужны вердикты ${(c.verdicts ?? []).join(', ')}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const pass = !hardGates.length && verdictsOk && (found === 'right' || found === 'n/a');
  return { pass, hardGates, found, ...(searched === undefined ? {} : { searched }), classified: true, hallucinations: [], aiCalls, detail };
}
