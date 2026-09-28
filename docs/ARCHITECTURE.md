# Architecture

```
src/core        law core — model, search, calculator, changes. Pure TypeScript (boundary test).
  ↑
src/protocol    the legal AI pipeline over the core — context, answer format, checks against the laws,
                calculator link, AI providers. Pure as well (its own boundary test). No React, no network
                of its own except through a provider.
  ↑
src/ui          React. ai.ts picks the provider from the settings and keeps the conversation; AiView,
                AnswerView, DocumentView, LawyerView, TrainerView, HistoryView lay it out.
src/platform    everything native behind PlatformAdapter (tauri / browser / fake for tests).
server/         the optional AI server: Node without dependencies, OpenAI-compatible upstream, daily limits.
```

The rule the layers keep: **the laws, the search and the calculator are deterministic; the AI only interprets
what they found.** The AI never sees the whole pack — only the articles found for a question, under ids — and
whatever it says is checked against the pack before it is shown (`docs/SOURCE_GROUNDING.md`). Without the AI
(offline, no key, the server down) everything but the AI screens works as before, and the AI screen says so.

## One question

`ui/ai.ts useAiChat.send` → `protocol/pipeline.ts analyse` → law terms (AI) → `core findForSituation` →
`protocol/context.ts buildContext` → analysis (AI, JSON) → `protocol/answer.ts parseAnswer` →
`protocol/validate.ts validateAnswer` + `calculateCharges` (→ `core calculateDetention`) → `ui/AnswerView`.
Details: `docs/AI_PIPELINE.md`.

## The conversation

Each answer leaves a `CaseState` (facts, assumptions, articles, conclusion). The next message — a follow-up,
a clarification pressed, a fact corrected with «исправить» — is analysed against it, keeping its articles
among the sources. The facts panel shows the case and the history of decisions (question → conclusion →
status). Saved conversations keep the AI's answer and the ids of its sources and are checked again when opened.

## Replacing the model

A new model is a new `AiProvider` in `protocol/provider.ts` (`complete(request) → text`) and a line in
`ui/ai.ts serviceFor`. The server is OpenAI-compatible, so a provider with that API is only a change of its
`.env` on the server — no new version of the app.
