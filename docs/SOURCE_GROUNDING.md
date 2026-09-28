# Source grounding

The rule: every article, part and figure the player is shown comes from the server's laws, and an answer that
cannot be traced back to them is never shown as confirmed. It is enforced by code, not by the prompt alone.

## What the AI is given

Only the articles the search found, each under an id (`[S3] УК ст. 65 «Кража» — Уголовный кодекс`), with its text
and its punishment as the pack stores it. It must cite by that id and copy the label.

## What is checked (`src/protocol/validate.ts`, no AI involved)

| Check | Fails when | Shown as |
|---|---|---|
| The article exists | the id was not given and the label names no article of this server | «такой статьи нет в законах сервера» |
| It was among the sources | the label names a real article the AI was not shown | «ИИ сослался на статью, которой не было среди найденных» |
| The label matches the source | the id is S3 but the label names another document or number | «ИИ указал не тот номер» |
| The part exists | the article has numbered parts and none has that number | «в статье нет части N» |
| The figures | a number in the punishment or the procedure is in none of the cited articles (nor their stars) | «В названных статьях нет цифр: …» |

Any failure sets `needsReview`: the answer carries «Требует проверки» and a warning, never «Подтверждено», and a
failed article never reaches the calculator.

## The status

Taken from the sources and the checks, never from the model's opinion of itself:

- **Подтверждено** — every cited article passed, each fits the facts outright, nothing was assumed;
- **Вероятно подходит** — articles fit, but partly, or on an assumption, or a check failed;
- **Нужно уточнение** — no article fits outright and the AI asks what is missing;
- **Не найдено** — no article of the server's laws bears on it.

## The punishment

The AI copies the sanction; the app shows, per article, the punishment from the pack («По базе: …») and, for the
charges of the criminal and administrative codes that fit outright, the calculator's total by the server's rules
(`calculateDetention`) — term, bail, stars, fines. The AI never adds terms up; an alternative («либо грабёж»,
`fit: partial`) is not added to the sum.

## History

A saved conversation keeps the AI's answer and the ids of its sources; opened again, it is checked again against
the laws as they are now — an article removed since shows as not found.

Tests: `src/protocol/protocol.test.ts` (an answer citing a non-existent article does not pass), `src/ui/AiAnswer.test.tsx`.
