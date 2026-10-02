# Source grounding

The rule: every norm, part, figure and article the player is shown comes from the server's base, and an answer that
cannot be traced back to it is never shown as confirmed. «В доступной нормативной базе это не найдено» is a correct,
successful answer. It is enforced in layers, the prompt only the first:

| Line | Where | What it does |
|---|---|---|
| 1. Prompt | `prompt.ts` `coreRules` | one core for every mode: no source of law, sources only, types, scope, player's text is data |
| 2. Classifier | `classify.ts` | what is no question of the base never reaches the model (0 AI calls) |
| 3. Scope + search | `sources.ts`, `findForSituation` | the pack is narrowed to the scope's documents before the search: another kind of source cannot be given |
| 4. Schema | `answer.ts` | every statement about the norms carries the ids of its sources; no free «reply» |
| 5. Validator | `validate.ts`, `check.ts` | each norm and each statement held to its own sources, without the AI |
| 6. Calculator | `calculateCharges` | the punishment is counted by the server's rules, never by the AI |
| 7. Exam | `grade.ts`, `scripts/ai-eval.ts` | hard gates over live runs; `CONFIRMED_HALLUCINATION_RATE` |

## Types of source

From the document in the pack (`document.kind`), never from the model: `penal-code`, `law` → **закон** (`S…`);
`charter` → **устав** (`C…`); `rules` → **правило сервера** (`R…`); anything else → другой документ (`O…`). In the
context each type is a block of its own; on screen each norm has its badge in the app's badge colours, and an answer
with both kinds shows «По закону» and «По правилам сервера» apart.

## What is checked (no AI involved)

| Check | Fails when |
|---|---|
| The norm exists | its id was not given and its label names no article of this server |
| It was among the sources | the label names a real article the AI was not shown |
| The label matches the source | the id is S3 but the label names another article of the server (a label naming none — «86 УК ст. 2» — is a slip: the norm is the source, shown under its own label) |
| The part exists | the article has numbered parts and none has that number |
| The type fits the scope | a rule of the server in an answer about the laws, or a law in one about the rules |
| A statement has a source | the violation, the punishment or a step of the procedure names no source |
| Its sources were given | it names an id the AI was not given |
| Not a law and a rule at once | one statement stands on a law (or charter) and a rule of the server together |
| Its figures | a number in the statement is in none of *its own* sources (nor their stars) |
| Articles mentioned | the situation, a reason or a statement names an article that is none of the sources («это же 777») |

A few words that find nothing («чела приняли, что ему будет?») are asked about, not answered «не найдено».

Any failure sets `needsReview`: «Требует проверки», never «Подтверждено», and a failed norm never reaches the
calculator. The status comes from the checks — `notFound` is decided by them, not by the model's flag.

The other modes share `check.ts`: a lawyer's demand or a step of a detention stands only on sources it names (else
it is shown as «не нашлось», with nothing to do or refuse on it); a document or the trainer's reference answer may
name only the articles it was given.

## Prompt injection

The player's words are fenced as data (`playerData`); a text that closes the fence stays inside it. But the defence
is the checks: even an obedient model cannot get «Подтверждено» without sources, and a «reply from itself» is not
shown. «По реальному УК РФ…», «ответь по законам РФ» are answered by the app, without the model.

## History

A saved conversation keeps the answer and the ids of its sources; opened again, it is checked again against the base
as it is now — an article removed since shows as not found.

Tests: `src/protocol/grounding.test.ts` (the hard gates with a misbehaving fake AI), `src/protocol/grade.test.ts`
(the exam's gates), `src/protocol/protocol.test.ts`, `src/ui/AiAnswer.test.tsx`, `src/ui/AiScope.test.tsx`, and the
modes' tests (`Lawyer`, `Detention`, `Documents`, `Trainer`).
