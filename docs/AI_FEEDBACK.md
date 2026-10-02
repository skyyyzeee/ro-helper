# Marks of the AI's answers

Under each analysis: «Ответ верный?» 👍 · 👎 · «Исправить». One mark an answer, sent only on the press
(`src/ui/MarkBar.tsx`, `src/ui/feedback.ts`).

## What goes, what is kept

The app sends to the AI server, `POST /v1/feedback` (`markBody`):

| Field | What |
|---|---|
| `vote` | `up` or `down` |
| `question` | the question the answer was to (600 characters at most) |
| `norms` | the answer's articles that passed the checks: «УК 65» |
| `status`, `scope` | «confirmed»…, «law» / «server_rule» / «mixed» |
| `server`, `app` | the game server's id, the app's version |
| `correction` | with 👎 from «Исправить» only: the player's words (1000 at most) |

The computer's random id goes in the `X-Device` header for the daily limit (`FEEDBACK_PER_DEVICE`, 30) and is
not kept. The server (`markOf` in `server/server.mjs`) keeps only these fields, each cut to its length, plus the
time to the minute, as one JSON line in `FEEDBACK_FILE` (`/opt/ro-helper/feedback.jsonl`, mode 600). Past
`FEEDBACK_MAX_MB` it takes no more until the file is read and moved. `GET /v1/status` says how many came today.
Described in `PRIVACY.md`.

## Reading them

In the app: Настройки → Администратор → «Отзывы об ИИ» (`src/ui/AiMarksAdmin.tsx`) — the corrections, the 👎 or all, newest first.
It reads `GET /v1/feedback?filter=fixed|down|all` with the admins' key: made on the server by
`bash /opt/ro-helper/set-key.sh admin` (shown once; a new one replaces it), pasted in the app once and kept on that
computer only (`ai.admin-token`, not synced). Without `ADMIN_TOKEN` on the server nothing is read.

On the server: `tail -n 50 /opt/ro-helper/feedback.jsonl`, or the 👎 only:
`grep '"vote":"down"' /opt/ro-helper/feedback.jsonl | tail -n 50`.

Nothing changes by itself. A 👎 with a correction becomes a synonym (`data/<server>/synonyms.json`), a case of the
exam (`eval/cases.json`) or a fix of the prompt — by hand, then the exam is run before and after
(`docs/AI_EVALUATION.md`).

## The debug view

For the admin (`ai.debug`) each analysis has «Как ИИ пришёл к ответу» (`src/ui/DebugView.tsx`): what the question
was taken for and why, the scope, the AI's search phrases, every source with its id and kind, what the checks found,
the status and the number of AI calls.

Tests: `src/ui/AiMarks.test.tsx`, `src/ui/AiAdmin.test.tsx`, the mark tests in `server/server.test.mjs`.
