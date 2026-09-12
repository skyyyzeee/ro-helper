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
import { CALCULATOR_ID } from './pinLayout';
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

/** The pinned article: only its part — heading, punishment and text — and whose case it is. */
export function articlePinCard(hit: SearchHit, rules?: CalculatorRules): PinCard {
  const own = entryPart(hit.article, hit.part);
  const part = own ?? leadPart(hit.article) ?? hit.part ?? hit.article.parts.find((p) => p.text);
  const title = articleTitle(hit.article);
  const only = part?.jurisdiction?.length === 1 ? part.jurisdiction[0] : undefined;
  const warning = only && rules?.jurisdictionWarnings[only];
  // The rules of the project and the charters keep their punishment in a note under the article.
  const penalty = part?.punishment ? undefined : penaltyNote(hit.article);
  const heading = `${hit.document.short} ${articleLabel(hit.article, own, hit.document.unit)}` + (title ? `. ${title}` : '');
  // A point written as a list (ФСО 5.1) shows its items too; a rule, whose text is its own heading, does not repeat it.
  const lines = [...(part?.text ? [part.text] : []), ...(part?.points.map((point) => `${pointLabel(point)} ${point.text}`) ?? [])];
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
function administrativeTotal(result: AdministrativeResult): string {
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
