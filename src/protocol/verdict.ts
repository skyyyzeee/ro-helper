// A question answered «да» or «нет» («Обязан ли сотрудник ГИБДД представиться?»): the answer starts with the verdict,
// so the player knows it before the details. The verdict is the model's, held to its sources like any statement.

/** «обязан ли», «можно ли», «имеет ли право», «законно ли», «должен ли»… — a modal word, then «ли». */
const CLOSED =
  /(?:^|[\s,(«"])(?:обязан[аоы]?|долж(?:ен|на|ны|но)|можно|нельзя|могу|может|могут|можем|имею|имеет|имеют|вправе|законно|незаконно|правомерно|нужно|надо|разрешено|запрещено|допустимо|положено|полагается|является|являются|считается|будет|правда|есть|был[аио]?)\s+ли(?=[\s,?!.]|$)/i;

/** Whether the player asks a question answered yes or no. */
export function isClosedQuestion(text: string): boolean {
  return CLOSED.test(text.replace(/ё/gi, 'е'));
}

/** The verdict as the model gives it; «depends» when it turns on a fact not known. */
export type VerdictAnswer = 'yes' | 'no' | 'depends';

/** What the player is shown: the model's verdict when it stands on the sources, «нужно уточнение» when it does not. */
export type ShownVerdict = VerdictAnswer | 'clarify';

export const VERDICT_LABELS: Record<ShownVerdict, string> = {
  yes: 'Да',
  no: 'Нет',
  depends: 'Зависит от обстоятельств',
  clarify: 'Нужно уточнение',
};
