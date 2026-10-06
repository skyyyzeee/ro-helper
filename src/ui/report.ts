import { formatRubles, type DetentionResult } from '../core';
import { administrativeTotal } from './pinCards';
import type { PlayerCard } from './player';

export interface ReportInput {
  /** What the calculator counted: the charges are the report's, the punishment the calculator's — never retyped. */
  result: DetentionResult;
  /** The fine the officer typed, when the punishment is one. */
  fineTyped?: number;
  server: string;
  organization: string;
  /** The officer's game name and position, if they gave them in the profile. */
  player?: PlayerCard;
  now?: Date;
}

const BLANK = '____________________';
const moscow = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** What the detainee gets under the criminal code, in a line: the term with its stars and bail, or the fine. */
function criminalLine({ criminal }: DetentionResult, fineTyped?: number): string | null {
  if (!criminal) return null;
  if (criminal.mode === 'custody') {
    return [
      `лишение свободы на ${criminal.term} мес`,
      criminal.stars > 0 && `розыск ${'★'.repeat(criminal.stars)}`,
      criminal.bail?.amount && `залог ${formatRubles(criminal.bail.amount)}`,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (!criminal.fineLimit) return null;
  return fineTyped ? `штраф ${formatRubles(fineTyped)}` : `штраф до ${formatRubles(criminal.fineLimit.max)}`;
}

/**
 * A report from what is in the calculator (issue #40): the charges and the punishment filled in, the detainee,
 * what happened and the signature left for the officer. Plain text, to paste where reports are filed.
 */
export function reportText({ result, fineTyped, server, organization, player, now = new Date() }: ReportInput): string {
  const author = [player?.position, player?.gameName].filter(Boolean).join(' ');
  const criminal = criminalLine(result, fineTyped);
  const administrative = result.administrative ? administrativeTotal(result.administrative) : '';
  return [
    'РАПОРТ',
    `${moscow.format(now)} (МСК) · ${server} · ${organization}`,
    '',
    `Составил: ${author || BLANK}`,
    `Задержанный: ${BLANK}`,
    '',
    `Обвинение: ${result.charge}`,
    ...(criminal ? [`Наказание: ${criminal}`] : []),
    ...(administrative ? [`${criminal ? 'По КоАП' : 'Наказание'}: ${administrative}`] : []),
    '',
    'Обстоятельства (что произошло):',
    BLANK,
    '',
    `Подпись: ${author || BLANK}`,
  ].join('\n');
}
