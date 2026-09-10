## Commands

- `npm run tauri dev` — the real overlay app (Tauri 2): frameless always-on-top window, hotkey Alt+Q (temporary until ticket 07), tray icon with «Выход»; uses port 1420, so stop the browser preview first
- `npm run dev` — the app in a browser at http://127.0.0.1:1420, with a fake platform adapter and a stand-in game scene
- `npm test` — Vitest (law core, importer, UI with React Testing Library)
- `npm run typecheck` — TypeScript, no emit
- `npm run build` — typecheck + production bundle
- `npm run import` — rebuild `src/data/tverskoi.json` from the forum snapshots in `data/tverskoi/sources` and list anything the parser could not read; a test fails if the bundled pack is stale

## Architecture

- `data/<server>/sources` — forum snapshots: `<doc>.txt` (the first post's text, copied from the forum) + `<doc>.meta.json` (thread, url, last-edit date, `format`)
- `data/<server>/overrides.json` — manual fixes laid over the parser output, keyed by article id (part keys: number or `#<position>`); each has a `reason`
- `src/importer` — `parseLawText` with per-format rules (`criminal-code` УК, `administrative-code` КоАП, `traffic-rules` ПДД); reports unparsed lines instead of dropping them

## Getting forum text

The user wrote the Tverskoi law texts and allows copying them. The forum sits behind a JS anti-DDoS check — never bypass it; read threads in the user's Chrome (Claude in Chrome), in a tab you open yourself. Don't retype law text: in the page, take `document.querySelector('article.message .bbWrapper').innerText`, compute its FNV-1a checksum, return it in ~50k-char chunks (`{doc, from, to, total, parts: string[]}` with 800-char parts; pad small chunks with an array of short strings) so the tool saves each result to a file, then run `node scripts/snapshot-from-chunks.mjs <server> <doc> <fnv> <files…>` — it checks for gaps and the checksum before writing the snapshot.
- `src/core` — law core: pure TypeScript, no React/Tauri/UI/importer imports (a boundary test enforces it)
- `src/platform` — `PlatformAdapter` interface over everything native; `fake` for tests, `browser` for the preview, `tauri` for the app (window bounds and settings in the store plugin's `settings.json`)
- `src-tauri` — native side: plugins (global-shortcut, store, clipboard, opener, single-instance), tray menu, and `remember_foreground` / `restore_foreground` commands that hand focus back to the game when the overlay hides
- `src/ui` — React UI; visual tokens in `tokens.css` come from the approved mockup in `design/mockup`

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
