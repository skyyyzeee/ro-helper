# The AI exam (evaluation lab)

Not a player feature: a tool for the developers to see how a model, a prompt, the classifier or the search does on
the same questions — and to see at once when a change makes things worse.

```
npm run eval                      # all cases, through the app's AI server (counts against its daily limits!)
npm run eval:ai                   # the traps only (group «traps»)
npm run eval -- --gigachat        # GigaChat directly: GIGACHAT_AUTH_KEY + NODE_EXTRA_CA_CERTS (free, no server limits)
npm run eval -- --url … --model … # any OpenAI-compatible AI, key in AI_EVAL_KEY
  --category SERVER_RULE  --group fresh  --server tverskoi  --cases 46,47  --limit 5  --depth full  --debug
  --save-baseline                 # keep this run as the baseline to compare the next runs with
```

## Cases (`eval/cases.json`)

Each: `server`, `situation`, `category`, `group` (base — the prompts were tuned on them; fresh — never seen while
tuning; traps), and what should happen:
- `expect` — the right articles («УК 65»; «УК 10.1|УК 10.2» — any of them); every entry must be applied;
- `forbid` — articles that must never be applied (the player's false «45», another server's «10.2»);
- `behavior` — `answer` (default), `system` (the app's own word, optionally which `reason`), `clarify` (a question back);
- `choice` — the player's switch; `followUp` — a second message in the same case.

Categories: LAW, SERVER_RULE, MIXED, AMBIGUOUS, NONSENSE, OUT_OF_SCOPE, HALLUCINATION_TRAP, WRONG_NUMBER_TRAP,
CROSS_SERVER, FALSE_CLAIM, PROMPT_INJECTION, FOLLOW_UP (ROLE_RESTRICTED comes with the capabilities, P0b).

## Two levels of score (`src/protocol/grade.ts`)

**Hard gates** — any one fails the case, however right the rest:
- a confirmed answer holding a made-up norm: a norm that is none of the sources, a statement with no source, a figure
  or an article its own sources lack (checked again here, apart from the checks that set the status);
- a forbidden article applied;
- an AI call where the words alone decided (greeting, gibberish, out of scope, article number).

**Quality** — the right article applied (right / partly / missed), whether the search found it at all (a miss of the
search is not the model's), whether the question was read as expected, AI calls per category.

The critical metric: **`CONFIRMED_HALLUCINATION_RATE`** = analyses shown «Подтверждено» while holding a made-up norm
÷ all analyses. The target is **0**; a run with a failed hard gate exits with an error.

## Regression

Every run is written to `eval/results/last.json` (not committed); `--save-baseline` keeps it as
`eval/results/baseline.json`. The next run prints, against it: **НОВЫЕ ПРОВАЛЫ**, **ИСПРАВЛЕНО**, **РЕГРЕССИИ (новые
жёсткие ворота)**, **БЕЗ ИЗМЕНЕНИЙ**. Run it before and after changing a prompt, the classifier, the synonyms, the
schema, the validator or the model.

The hard gates also run **without a live model** on every pull request: `src/protocol/grounding.test.ts` and
`src/protocol/grade.test.ts` feed a misbehaving fake AI and require that nothing made up comes out confirmed.

## Results so far

- gpt-5-nano via the AI server, 15 base cases: 8/15 → 12/15 after the prompt rules and synonyms (PR #14).
- GigaChat-2, 45 cases: 37/45; fresh 23/30 (PR #14). Sber's filter refuses some topics (drugs near a school) — the
  AI server then asks the paid API (PR #15).
