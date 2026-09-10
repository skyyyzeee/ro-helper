## Commands

- `npm run dev` — the app in a browser at http://127.0.0.1:1420, with a fake platform adapter and a stand-in game scene
- `npm test` — Vitest (law core, importer, UI with React Testing Library)
- `npm run typecheck` — TypeScript, no emit
- `npm run build` — typecheck + production bundle
- `npm run import` — rebuild `src/data/tverskoi.json` from the forum snapshots in `data/tverskoi/sources` and list anything the parser could not read; a test fails if the bundled pack is stale

## Architecture

- `data/<server>/sources` — forum snapshots: `<doc>.txt` (the first post's text, copied from the forum) + `<doc>.meta.json` (thread, url, last-edit date)
- `src/importer` — parsers that turn snapshots into a server pack; reports unparsed lines instead of dropping them
- `src/core` — law core: pure TypeScript, no React/Tauri/UI/importer imports (a boundary test enforces it)
- `src/platform` — `PlatformAdapter` interface over everything native; `fake` for tests, `browser` for the preview; Tauri implementation comes with ticket 06
- `src/ui` — React UI; visual tokens in `tokens.css` come from the approved mockup in `design/mockup`

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
