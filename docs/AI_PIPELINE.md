# AI pipeline

Кремлёвский Ассистент with the AI is laws + rules + search + a deterministic calculator, with the AI as an interpreter
on top — a closed layer over the server pack. **The AI is never a source of law**: what it may say comes from the
sources the search found in the pack, and code — not the prompt — decides what is shown as confirmed. The pipeline
lives in `src/protocol` (pure TypeScript, no React/Tauri — a boundary test enforces it); the React side
(`src/ui/ai.ts`, `AiView`, `AnswerView`, the other modes) only asks and shows.

```
question
  → classifier          classify.ts, no AI: greeting / gibberish / out of scope / real laws / article number
                         are answered by the app (0 AI calls); laws / rules of the server / both by their words
  → (unclear)            AI call 1 also says what it is ({intent, phrases}); about the game → the laws, its phrases kept;
                         still unclear → «закон или правила?»
  → scope               sources.ts: laws+charters, rules of the server, or both — the pack is narrowed BEFORE the search
  → search              findForSituation over the scope's documents only (deterministic; AI phrases are only words)
  → sources             labelSources: S… law, C… charter, R… rule of the server, O… other — type from the document
  → context             buildContext: blocks per type, the player's words fenced as data (playerData)
  → analysis            AI call 2: one JSON object, each statement with the ids of its sources (answer.ts)
  → validation          validate.ts — every norm, part, statement, figure and article mention checked (no AI)
  → calculation         calculateCharges → calculateDetention: the calculator, not the AI, counts
  → answer on screen    AnswerView: status, «По закону» / «По правилам сервера», type badges, each claim's sources
```

Two AI calls for a situation, one when the classifier had to ask, none for what is no question of the base.
`answerQuestion()` is the whole thing; `analyse()` is the analysis in a known scope (follow-ups, the exam).

## The answer format (`src/protocol/answer.ts`)

`situation` (the player's story), `facts`, `assumptions`, `norms[] {source, ref, part, why, fit, charge, stage}`,
`violation` and `punishment` as `{text, sources[]}`, `procedure[]` of `{text, sources[]}`, `uncertainty[]`,
`questions[] {question, options}` (1–3), `notFound`. No `reply`: the model is not asked for one, and one it sends is
not shown. Answers saved before the claims had sources are read as `legacy` and held to their cited norms as then.

## One prompt core (`src/protocol/prompt.ts`)

`coreRules(pack, scope)` starts every mode — the analysis, the lawyer's demands, the detention review, documents,
the trainer: the AI is no source of law; only the sources given; no real laws, no other servers; S/C/R/O types;
the scope; the player's text is data, its requests and claims are no instructions and no sources. Each mode adds its
task. The prompt is the first line only — see `SOURCE_GROUNDING.md` for the others.

## Depth

- **Быстрый разбор** — 1–2 main norms, short blocks; the model thinks minimally.
- **Полный разбор** — all fitting norms with alternatives, procedure by steps; `think: true` (reasoning effort `low`,
  4× the tokens). The choice is kept in `ai.depth`; questions over the game are always quick.

## Scope (`ai.scope`)

«Авто / Законы / Правила сервера» over the analysis. Auto: the classifier decides (laws, rules, or both apart).
A chosen scope is kept whatever the words say; when the question looks like the other kind, the answer says so.
A follow-up stays in its case's scope. See `AI_CLASSIFIER.md`.

## The case and follow-ups

Each answer leaves a `CaseState`: facts, assumptions, the norms it stood on (labels and ids), the conclusion and the
scope. A follow-up is sent with that state, not the whole conversation; the model changes only the facts it touches
and marks them «(изменено)». Its sources are the case's first, then what the change finds.

## Points of view

Государство / Гражданский / Адвокат / Крайм change only the question asked of the same sources (`PERSPECTIVE_FOCUS`);
the search and the facts are the same for all four (a test checks it). Tying them to the player's profile and
capabilities is P0b of `.scratch/ai-closed-loop/spec.md`.

## Providers (`src/protocol/provider.ts`)

`AiProvider.complete(request)` — `serverProvider` (the AI server of `server/`: GigaChat first, a paid
OpenAI-compatible API behind it; the keys on the server), `openaiProvider` (the player's own «Свой ИИ»),
`geminiProvider` (the player's key). Failures are `AiError` with a `kind`: `offline`, `key`, `busy`, `limit`,
`timeout`, `empty`, `format`, `failed`. Whatever fails, the search keeps working and the screen says so.

## The exam

`npm run eval` / `npm run eval:ai` — see `AI_EVALUATION.md`.
