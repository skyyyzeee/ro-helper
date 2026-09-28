// The AI's analysis as data: blocks the app lays out and checks, not a text it has to trust.

/** How far the act went, as the calculator takes it. */
export type Stage = 'done' | 'attempt' | 'preparation';

/** An article the AI holds applicable, by the id of the source it was given («S3») and its label. */
export interface AnswerNorm {
  source: string;
  /** The label as the sources give it: «УК ст. 65». */
  ref: string;
  /** The part the AI points at, when the article has several. */
  part?: string;
  /** Why it applies, in a sentence. */
  why: string;
  /** Whether the article fits the facts outright, or only if something unsaid holds. */
  fit: 'direct' | 'partial';
  /** A charge for the calculator: the act is punished under it. */
  charge: boolean;
  stage: Stage;
}

/** A question whose answer would change the analysis, with the likely answers as buttons. */
export interface Clarification {
  question: string;
  options: string[];
}

export interface LegalAnswer {
  /** A reply to something that is no legal question («привет»): shown as is, nothing else is. */
  reply: string;
  /** What happened, as the AI understood it. */
  situation: string;
  /** The facts of the case: what was said, and what the player corrected since. */
  facts: string[];
  /** What the AI took for granted to answer; a clarification may overturn it. */
  assumptions: string[];
  norms: AnswerNorm[];
  /** What exactly is broken. */
  violation: string;
  /** The punishment as the sources write it; the app checks its figures. */
  punishment: string;
  /** What the rules say must be done, step by step. */
  procedure: string[];
  /** What depends on circumstances not known. */
  uncertainty: string[];
  questions: Clarification[];
  /** The AI found nothing in the sources that bears on the situation. */
  notFound: boolean;
}

export class AnswerFormatError extends Error {}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const texts = (value: unknown, max = 8): string[] => (Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, max) : []);
const STAGES = new Set<Stage>(['done', 'attempt', 'preparation']);

/**
 * The AI's JSON read into a `LegalAnswer`: fences around it are dropped, missing blocks are empty, anything
 * of the wrong shape is left out. An answer that is no JSON object, or says nothing at all, is a format error.
 */
export function parseAnswer(raw: string): LegalAnswer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|```\s*$/g, ''));
  } catch {
    throw new AnswerFormatError('ИИ ответил не в том формате.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new AnswerFormatError('ИИ ответил не в том формате.');
  const o = parsed as Record<string, unknown>;
  const norms = (Array.isArray(o.norms) ? o.norms : [])
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .map(
      (n): AnswerNorm => ({
        source: text(n.source).toUpperCase(),
        ref: text(n.ref),
        ...(text(n.part) || typeof n.part === 'number' ? { part: String(n.part).trim() } : {}),
        why: text(n.why),
        fit: n.fit === 'partial' ? 'partial' : 'direct',
        charge: n.charge === true,
        stage: STAGES.has(n.stage as Stage) ? (n.stage as Stage) : 'done',
      }),
    )
    .filter((n) => n.source || n.ref)
    .slice(0, 8);
  const questions = (Array.isArray(o.questions) ? o.questions : [])
    .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object')
    .map((q) => ({ question: text(q.question), options: texts(q.options, 4) }))
    .filter((q) => q.question)
    .slice(0, 3);
  const answer: LegalAnswer = {
    reply: text(o.reply),
    situation: text(o.situation),
    facts: texts(o.facts, 12),
    assumptions: texts(o.assumptions),
    norms,
    // The blocks have their own headings: «Наказание: …» inside «Наказание» is said once.
    violation: text(o.violation).replace(/^нарушение\s*:\s*/i, ''),
    punishment: text(o.punishment).replace(/^наказание\s*:\s*/i, ''),
    procedure: texts(o.procedure),
    uncertainty: texts(o.uncertainty),
    questions,
    notFound: o.notFound === true,
  };
  if (!answer.reply && !answer.situation && !answer.norms.length && !answer.notFound && !answer.questions.length) {
    throw new AnswerFormatError('ИИ прислал пустой разбор.');
  }
  return answer;
}
