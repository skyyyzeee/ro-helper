// The AI's analysis as data: blocks the app lays out and checks, not a text it has to trust. Every statement about
// the norms carries the ids of the sources it stands on, so the checks can hold each one to its own sources.

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

/** A statement about the norms and the ids of the sources that say it. The player's facts are no sources. */
export interface Claim {
  text: string;
  sources: string[];
}

/** A question whose answer would change the analysis, with the likely answers as buttons. */
export interface Clarification {
  question: string;
  options: string[];
}

export interface LegalAnswer {
  /**
   * Only in answers saved before the classifier: a reply to something that was no legal question. The model is not
   * asked for one any more — what is no question of the laws never reaches it.
   */
  reply?: string;
  /** What happened, as the AI understood it — the player's story, not a statement of the norms. */
  situation: string;
  /** The facts of the case: what was said, and what the player corrected since. */
  facts: string[];
  /** What the AI took for granted to answer; a clarification may overturn it. */
  assumptions: string[];
  norms: AnswerNorm[];
  /** What exactly is broken. */
  violation: Claim | null;
  /** The punishment as the sources write it; the calculator, not the AI, counts. */
  punishment: Claim | null;
  /** What the norms say must be done, step by step. */
  procedure: Claim[];
  /** What depends on circumstances not known. */
  uncertainty: string[];
  questions: Clarification[];
  /** The AI found nothing in the sources that bears on the situation (the checks decide, not this flag alone). */
  notFound: boolean;
  /** Saved before statements carried their sources: they are held to the norms the answer cited, as then. */
  legacy?: boolean;
}

export class AnswerFormatError extends Error {}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const texts = (value: unknown, max = 8): string[] => (Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, max) : []);
const STAGES = new Set<Stage>(['done', 'attempt', 'preparation']);
const ids = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s]+/) : [])
    .map((id) => text(id).toUpperCase())
    .filter((id) => /^[A-Z]\d+$/.test(id))
    .slice(0, 8);

/** A claim as the model wrote it — an object with its sources, or (an older answer) a bare text with none. */
function claim(value: unknown, heading?: RegExp): Claim | null {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : { text: value };
  let said = text(raw.text);
  // The blocks have their own headings: «Наказание: …» inside «Наказание» is said once.
  if (heading) said = said.replace(heading, '');
  return said ? { text: said, sources: ids(raw.sources) } : null;
}

const claims = (value: unknown): Claim[] => (Array.isArray(value) ? value.map((item) => claim(item)).filter((c): c is Claim => !!c).slice(0, 8) : []);

/**
 * The AI's JSON read into a `LegalAnswer`: fences around it are dropped, missing blocks are empty, anything of the
 * wrong shape is left out. An answer that is no JSON object, or says nothing at all, is a format error.
 */
export function parseAnswer(raw: string): LegalAnswer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|```\s*$/g, ''));
  } catch {
    throw new AnswerFormatError('ИИ ответил не в том формате.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new AnswerFormatError('ИИ ответил не в том формате.');
  const answer = readAnswer(parsed as Record<string, unknown>);
  // A reply «from itself» is not shown: what is no question of the laws is answered by the app, without the model.
  delete answer.reply;
  // A fresh answer is held to its own sources: a statement the model wrote as bare text has none.
  delete answer.legacy;
  if (!answer.situation && !answer.norms.length && !answer.notFound && !answer.questions.length) {
    throw new AnswerFormatError('ИИ прислал пустой разбор.');
  }
  return answer;
}

/** An answer object — from the model, or saved in the history in either format — in today's shape. */
export function readAnswer(o: Record<string, unknown>): LegalAnswer {
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
  return {
    ...(text(o.reply) ? { reply: text(o.reply) } : {}),
    situation: text(o.situation),
    facts: texts(o.facts, 12),
    assumptions: texts(o.assumptions),
    norms,
    violation: claim(o.violation, /^нарушение\s*:\s*/i),
    punishment: claim(o.punishment, /^наказание\s*:\s*/i),
    procedure: claims(o.procedure),
    uncertainty: texts(o.uncertainty),
    questions,
    notFound: o.notFound === true,
    ...(o.legacy === true || [o.violation, o.punishment, ...(Array.isArray(o.procedure) ? o.procedure : [])].some((v) => typeof v === 'string' && v.trim())
      ? { legacy: true }
      : {}),
  };
}
