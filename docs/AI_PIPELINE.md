# AI pipeline

Кремлёвский Ассистент with the AI is laws + search + a deterministic calculator + sources, with the AI as an interpreter on top. The AI is
never a source of law. The pipeline lives in `src/protocol` (pure TypeScript, no React/Tauri — a boundary test
enforces it); the React side (`src/ui/ai.ts`, `AiView`, `AnswerView`) only asks and shows.

```
player's situation
  → law terms            AI call 1 (counts=false): 4–8 search phrases in the words of the law
  → search               findForSituation — per word + the terms + the server's synonyms (deterministic)
  → sources              labelSources: the found articles under ids S1…S14
  → context              buildContext: СЕРВЕР / ОРГАНИЗАЦИЯ / ТОЧКА ЗРЕНИЯ / ФАКТЫ ДЕЛА / … / НАЙДЕННЫЕ СТАТЬИ
  → analysis             AI call 2: one JSON object (answer.ts: LegalAnswer); a format miss is asked once more
  → validation           validateAnswer — every article, part and figure checked against the laws (no AI)
  → calculation          calculateCharges → calculateDetention: the calculator, not the AI, counts
  → answer on screen     AnswerView: status, blocks, source cards, calculator line, clarifying questions
```

Two AI calls per question, as before the pipeline: the checks cost nothing.

## The answer format (`src/protocol/answer.ts`)

`situation`, `facts`, `assumptions`, `norms[] {source, ref, part, why, fit, charge, stage}`, `violation`,
`punishment` (the sanction as the article writes it — never a total), `procedure[]`, `uncertainty[]`,
`questions[] {question, options}` (1–3), `notFound`, and `reply` for something that is no legal question.

## Depth

- **Быстрый разбор** — 1–2 main articles, short blocks; the model thinks minimally.
- **Полный разбор** — all fitting articles with alternatives, procedure by steps; `think: true` lets the server's
  model reason longer (reasoning effort `low`, 4× the tokens). Slower and a little dearer.

The player's choice is kept in the setting `ai.depth`; questions over the game are always quick.

## The case and follow-ups

Each answer leaves a `CaseState`: facts, assumptions, the articles it stood on (labels and ids), the conclusion.
A follow-up («а если он был в маске?», «нет, он был сотрудником МВД», a pressed clarification) is sent with that
state instead of the whole conversation; the model changes only the facts it touches and marks them «(изменено)».
Its sources are the case's articles first, then what the change itself finds, then what the case with the change
finds — so the analysis is not started from scratch.

## Points of view

Государство / Гражданский / Адвокат / Крайм change only the question asked of the same sources (`PERSPECTIVE_FOCUS`
in `context.ts`); the search and the facts are the same for all four (a test checks it).

## Providers (`src/protocol/provider.ts`)

`AiProvider.complete(request)` — `serverProvider` (the AI server of `server/`, OpenAI-compatible, the key on the server) and
`geminiProvider` (the player's key, sent in a header). A new model is a new provider; nothing else changes.
Failures are `AiError` with a `kind`: `offline`, `key`, `busy`, `limit`, `timeout` (90 s, 150 s when thinking),
`empty`, `format`, `failed`. Whatever fails, the search keeps working and the screen says so.
