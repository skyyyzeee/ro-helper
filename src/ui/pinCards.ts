import {
  SUBJECT_LABELS,
  articleLabel,
  articleTitle,
  formatRubles,
  leadPart,
  pointLabel,
  penaltyNote,
  punishmentBySubject,
  type AdministrativeResult,
  type CalculatorRules,
  type DetentionResult,
  type Part,
  type SearchHit,
} from '../core';
import type { PinCard } from '../platform/types';
import { CALCULATOR_ID, PHRASES_ID, TIMER_ID } from './pinLayout';
import { entryPart, hitKey } from './saved';

/**
 * The whole punishment of a part, as the article itself shows it: a line for everyone, or one per whom
 * it is for, and the measures that come on top.
 */
function punishmentOf(part?: Part): Pick<PinCard, 'punishment' | 'extra'> {
  if (!part?.punishment) return {};
  const lines = punishmentBySubject(part.punishment);
  const named = lines.some((line) => line.subject !== null);
  return {
    punishment: lines.map((line) => ({ ...(named && line.subject ? { who: SUBJECT_LABELS[line.subject] } : {}), text: line.text })),
    ...(part.punishment.additional.length ? { extra: part.punishment.additional } : {}),
  };
}

/**
 * The pinned article: the whole of it — every part, numbered, with its points — to read over the game without
 * the overlay (issue #19). The heading names the part it was pinned from, whose punishment it carries, and
 * whose case it is.
 */
export function articlePinCard(hit: SearchHit, rules?: CalculatorRules): PinCard {
  const own = entryPart(hit.article, hit.part);
  const part = own ?? leadPart(hit.article) ?? hit.part ?? hit.article.parts.find((p) => p.text);
  const title = articleTitle(hit.article);
  const only = part?.jurisdiction?.length === 1 ? part.jurisdiction[0] : undefined;
  const warning = only && rules?.jurisdictionWarnings[only];
  // The rules of the project and the charters keep their punishment in a note under the article.
  const penalty = part?.punishment ? undefined : penaltyNote(hit.article);
  const heading = `${hit.document.short} ${articleLabel(hit.article, own, hit.document.unit)}` + (title ? `. ${title}` : '');
  // Every part, numbered when there are several; a point written as a list (ФСО 5.1) shows its items too; a
  // rule, whose text is its own heading, does not repeat it.
  const several = hit.article.parts.filter((p) => p.text || p.points.length).length > 1;
  const lines = hit.article.parts.flatMap((p) => [
    ...(p.text ? [several && p.number ? `${p.number}. ${p.text}` : p.text] : []),
    ...p.points.map((point) => `${pointLabel(point)} ${point.text}`),
  ]);
  return {
    id: hitKey(hit),
    kind: 'article',
    heading,
    ...punishmentOf(part),
    ...(penalty ? { penalty } : {}),
    lines: lines.filter((line) => !heading.endsWith(line)),
    ...(warning ? { warning } : {}),
  };
}

/** «штраф 35 000 ₽ · арест 20 сут · Лишение права управления: ст. 8.6 ч. 3». */
export function administrativeTotal(result: AdministrativeResult): string {
  const counted = result.items.filter((r) => r.applicable);
  return [
    counted.some((r) => r.fine) && `штраф ${formatRubles(result.fineTotal)}`,
    result.arrestDays > 0 && `арест ${result.arrestDays} сут`,
    ...result.other,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The pinned calculator, to read the charges out to the detainee: the total (term and stars, or the fine),
 * the charges, the administrative total and the warnings.
 */
export function calculatorPinCard(result: DetentionResult, fineTyped?: number): PinCard {
  const { criminal, administrative, stars } = result;
  const lines: string[] = [];
  let heading: string;
  if (criminal?.mode === 'custody') {
    heading = `${criminal.term} мес`;
  } else if (criminal?.fineLimit) {
    heading = fineTyped ? `Штраф ${formatRubles(fineTyped)}` : `Штраф до ${formatRubles(criminal.fineLimit.max)}`;
  } else {
    heading = administrative ? administrativeTotal(administrative) || 'КоАП' : '';
  }
  if (result.charge) lines.push(result.charge);
  if (criminal && administrative) {
    const total = administrativeTotal(administrative);
    if (total) lines.push(`КоАП: ${total}`);
  }
  const warnings = criminal?.warnings ?? [];
  return {
    id: CALCULATOR_ID,
    kind: 'calculator',
    heading,
    ...(stars && stars.count > 0 ? { stars: stars.count } : {}),
    lines,
    ...(warnings.length ? { warning: warnings.join('; ') } : {}),
  };
}

/** The phrases for the chat as a card over the game: a button each, as they are pasted — the profile's words in. */
export function phrasesPinCard(phrases: { title: string; text: string }[]): PinCard {
  return { id: PHRASES_ID, kind: 'phrases', heading: 'Заготовки для чата', lines: [], actions: phrases.map((p) => ({ label: p.title, text: p.text })) };
}

/** The detention timer as a card over the game: running since, or stopped at. */
export function timerPinCard(since: number, stopped?: number): PinCard {
  return { id: TIMER_ID, kind: 'timer', heading: 'Задержание', lines: [], since, ...(stopped ? { stopped } : {}) };
}

/** «12:05», «1:02:07»: how long a detention has run. */
export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(seconds / 3600);
  return hours ? `${hours}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}` : `${two(Math.floor(seconds / 60))}:${two(seconds % 60)}`;
}

/** The AI's short answer to a question asked over the game, as a card: the question on top, the answer's lines below. */
export function aiPinCard(id: number, question: string, answer: string): PinCard {
  const lines = answer
    .split('\n')
    .map((line) => line.replace(/\*\*/g, '').replace(/^[-•*]\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
  return { id: `ai:${id}`, kind: 'ai', heading: question.length > 90 ? `${question.slice(0, 88)}…` : question, lines };
}
