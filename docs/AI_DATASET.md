# The players' language: marks → review → dictionary and exam

Nothing the players write becomes true by itself, and nothing changes the model, the prompt or the search on its
own. The pipeline:

```
the player's question → classifier → search → AI answer → the player's mark (👍 / 👎 / «Исправить»)
  → raw (feedback.jsonl on the AI server, no id of anyone)
  → the admins' review: approved / rejected / to check again (reviews.json)
      approved with a normal form → the players' dictionary (GET /v1/aliases) → the search and the classifier
      approved with the right articles → an example for the exam (GET /v1/examples → npm run eval -- --approved)
```

## Review — in the app

Настройки → Администратор → «Отзывы об ИИ» (`src/ui/AiMarksAdmin.tsx`), with the admins' key (docs/AI_FEEDBACK.md).
Filters: Новые, С поправками, 👎, Утверждённые, На перепроверку, Отклонённые, Все. For each mark: the question, its
type, the articles and status of the answer, the player's correction — and **Утвердить**, **На перепроверку**,
**Отклонить**. «Утвердить» asks for the normal form:

| Field | Becomes |
|---|---|
| Выражение игрока — «чела приняли» | the dictionary's phrase, matched as whole words |
| Нормальная форма — «задержание» | searched like the player's words; no AI call for search phrases |
| Где искать — законы / правила сервера | settles a question the words alone could not classify |
| Что спрашивают — «наказание», «задержание» | for the admins and the exam |
| Правильные статьи — «УК 65» | an approved example of the exam |

A review is the admins' only: `POST /v1/feedback/review` with the key. The marks stay as they came in
(`feedback.jsonl`); the reviews are kept apart (`REVIEWS_FILE`, `reviews.json`), so a review can be changed.

## The dictionary — in the search

`src/protocol/aliases.ts`: `QueryAlias { phrase, normalized, scope?, intent? }`, `matchAliases` (whole words),
`aliasScope`. `answerQuestion({ aliases })`: an expression found in the question gives the search its normal form
(the AI is not asked for search phrases), and its scope settles an «unclear» question in «Авто». An alias finds
articles only through the search of the base: it is never a source.

The app reads `GET /v1/aliases` (public: phrases and normal forms only — no questions, no marks) the first time a
question goes to the search, keeps it on the computer (`ai.aliases`) and reads it again after six hours; offline it
uses what it kept, or none. The app's own answers (a greeting, an article number…) fetch nothing.

## The exam

`npm run eval -- --approved` with `AI_ADMIN_TOKEN` set adds the approved examples (category `APPROVED`) to
`eval/cases.json`'s, and asks every question with the approved dictionary: what was fixed once stays fixed. Run it
before and after a change of the search, the synonyms, the classifier or the prompt (docs/AI_EVALUATION.md).

Tests: the review test in `server/server.test.mjs`, «the players' expressions the admins approved» in
`src/protocol/grounding.test.ts`, the review in `src/ui/AiAdmin.test.tsx`.
