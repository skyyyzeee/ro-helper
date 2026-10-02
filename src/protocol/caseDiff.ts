// «Было → стало» (ADR 0003): what a change of the case changed — its facts, its articles, the punishment the
// calculator counted, the conclusion — told by comparing the case before and after, with no AI. There is no graph
// «fact → conclusion»: the conclusions are the AI's words, and the link in them is not to be trusted; the whole
// case is analysed again and the two are put side by side.
import type { CaseState } from './context';

/** A case with what the calculator counted for it: «40 мес · 4★», or none when nothing was counted. */
export interface CaseView {
  case: CaseState;
  punishment?: string;
}

export interface CaseDiff {
  /** A fact as it was and as it is: only `was` — dropped; only `now` — new. */
  facts: { was?: string; now?: string }[];
  norms: { added: string[]; removed: string[] };
  punishment?: { was: string; now: string };
  conclusion?: { was: string; now: string };
}

/** A fact without the AI's mark of a correction: «у метро (изменено)» is «у метро». */
const plain = (fact: string) => fact.replace(/\s*\(изменено\)\s*$/i, '').trim();
const key = (text: string) => plain(text).toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim();

/** What changed from one state of a case to the next; null when nothing that matters did. */
export function diffCases(before: CaseView, after: CaseView): CaseDiff | null {
  const was = before.case.facts.map(plain);
  const now = after.case.facts.map(plain);
  const wasKeys = new Set(was.map(key));
  const nowKeys = new Set(now.map(key));
  const dropped = was.filter((fact) => !nowKeys.has(key(fact)));
  // A fact the AI marked as corrected pairs with a dropped one; the rest are new, or dropped.
  const added = after.case.facts.filter((fact) => !wasKeys.has(key(fact)));
  const corrected = added.filter((fact) => /\(изменено\)\s*$/i.test(fact)).map(plain);
  const fresh = added.filter((fact) => !/\(изменено\)\s*$/i.test(fact)).map(plain);
  const facts: CaseDiff['facts'] = [];
  const left = [...dropped];
  for (const fact of corrected) facts.push(left.length ? { was: left.shift(), now: fact } : { now: fact });
  // As many new as dropped: read as each replacing one, in order; otherwise told apart.
  const pairRest = left.length === fresh.length;
  for (const fact of fresh) facts.push(pairRest && left.length ? { was: left.shift(), now: fact } : { now: fact });
  for (const fact of left) facts.push({ was: fact });

  const wasNorms = new Set(before.case.norms);
  const nowNorms = new Set(after.case.norms);
  const norms = { added: after.case.norms.filter((n) => !wasNorms.has(n)), removed: before.case.norms.filter((n) => !nowNorms.has(n)) };

  const punishment = (before.punishment ?? '') !== (after.punishment ?? '') ? { was: before.punishment || '—', now: after.punishment || '—' } : undefined;
  const conclusion = before.case.conclusion.trim() && after.case.conclusion.trim() && key(before.case.conclusion) !== key(after.case.conclusion) ? { was: before.case.conclusion, now: after.case.conclusion } : undefined;

  if (!facts.length && !norms.added.length && !norms.removed.length && !punishment) return null;
  return { facts, norms, ...(punishment ? { punishment } : {}), ...(conclusion ? { conclusion } : {}) };
}
