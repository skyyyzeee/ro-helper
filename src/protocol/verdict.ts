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

/** «Можно ли…», «законно ли…»: the verdict in the question's own word — «Нельзя», not a bare «Нет». */
const ASKED_WORDS: [RegExp, Record<VerdictAnswer, string>][] = [
  [/(?:^|[\s,(«"])(?:можно|могу|может|могут|можем|разрешено|допустимо|вправе|имею|имеет|имеют)\s+ли/i, { yes: 'Можно', no: 'Нельзя', depends: VERDICT_LABELS.depends }],
  [/(?:^|[\s,(«"])(?:законно|правомерно)\s+ли/i, { yes: 'Законно', no: 'Незаконно', depends: VERDICT_LABELS.depends }],
  [/(?:^|[\s,(«"])(?:обязан[аоы]?|долж(?:ен|на|ны|но)|нужно|надо|положено|полагается)\s+ли/i, { yes: 'Обязан', no: 'Не обязан', depends: VERDICT_LABELS.depends }],
];

/** The verdict's label for this question: in its own word where it has one, «Да» / «Нет» elsewhere. */
export function verdictLabel(verdict: ShownVerdict, question: string): string {
  if (verdict === 'clarify') return VERDICT_LABELS.clarify;
  const text = question.replace(/ё/gi, 'е');
  const words = ASKED_WORDS.find(([re]) => re.test(text))?.[1];
  return words?.[verdict] ?? VERDICT_LABELS[verdict];
}
