# Кремлёвский Ассистент (formerly РО Хелпер)

A Windows overlay for the players of Russia Online (GTA V RP): the laws, charters and rules of each server,
searched in a keystroke over the game, a punishment calculator, cards pinned over the game, accounts and sync.
Owner: skyze (`skyyyzeee/ro-helper` on GitHub). A friend (`AidenArokij`, fork `AidenArokij/protocol`) works on
it too, through branches and pull requests. This file is shared by everyone's Claude Code: follow it as written.

**The name.** On 29.09.2026 the owner renamed the app «Кремлёвский Ассистент» (the icon: PR #6; the rest of the
rename: a separate pull request). What players read says «Кремлёвский Ассистент». What installed copies depend on
stays as it is, so their settings, sign-in and updates carry on: the identifier `com.skyze.rohelper` (and the
`%APPDATA%com.skyze.rohelper` folder), the repository `skyyyzeee/ro-helper` and its URLs (updates, laws,
`latest.json`), the binary `ro-helper`, the settings keys, the Supabase project and the bot — and the `productName` «РО Хелпер»
in `tauri.conf.json`: the Windows installer keys the install folder, the uninstall entry and the Start menu
shortcut by it, so changing it would install a second copy beside the old one (see the rename pull request).
Everything else players read says «Кремлёвский Ассистент» — the UI, the window title, the tray, the sign-in page,
the bot, README and PRIVACY; «хелпер» in players' texts became «ассистент». Older CHANGELOG entries keep the old name.

## Working in this repository

### Talking and writing
- Talk to the people in **Russian**, plainly and briefly. Everything players see — the UI, «Что нового» in
  `CHANGELOG.md`, `PRIVACY.md` — is Russian, written for players, not developers.
- Code, comments, commit messages and PR descriptions are **English**. Comments say what a thing is for in plain
  sentences, like the code around them; commit subjects say what changed («2.2.4: the favourite tiles as in
  mockup C»), the body why.

### Branches — nothing lands on `main` untested
- **`main`** is what players get: releases are tagged from it, and installed copies download the laws from
  `src/data/*.json` on `main` — whatever is merged there reaches players. Only the owner merges into `main`.
- **`dev`** is where work comes together and is tried: everyone else's changes go into `dev` by a pull request
  (the owner's own, and their agent's, may go straight in); when
  `dev` has been tried, a pull request `dev` → `main` and a release follow.
- **Work branches** start from `dev` (`design-…`, `ai-…`, `ticket-15-…`) and end as a pull request into `dev`.
  Keep them to one thing; CI (types, tests, the native tests) runs on every pull request and must be green.
- The one thing that may go straight to `main`: the owner's law updates (`npm run import`), so a fix reaches
  players at once — then merge `main` back into `dev`.
- Never force-push `main` or `dev`, never rewrite pushed history, never push a tag. Commit only the files you
  changed, by name (no `git add -A` / `git add .`): the owner keeps untracked files of their own in the tree.

### Releases — the owner's
- The version is only in `package.json`; «Что нового» is a `## <version>` section at the top of `CHANGELOG.md`
  (the build fails without one). A pushed tag `v*` builds a **draft** release; the owner installs it from the
  draft, tries it, and publishes it — only then do installed copies update. Tags are pushed by the owner only:
  a tag signs an update with the owner's key.

### Design
- The layout follows **direction C** of `design/mockup-v2/index.html` exactly: the side column always on
  screen (the server's mark, sections, settings and profile at its foot), results on one line, favourites as
  tiles in two columns, the server and faction switcher as a popover, Настройки as a page with its name in the
  header and no search. Open it with `npm run dev` at `http://127.0.0.1:1420/design/mockup-v2/index.html`, pick
  «C · Боковое меню» (the default is A), and match every screen you build or change — layout, sizes, texts.
- What C shows but isn't built yet (memos, the leader's tiles, roles) is finished ticket by ticket in C's look,
  never redesigned. Where C's text would be untrue, keep the look and make the text true.
- Exceptions the owner chose: the settings have a column on the left (the account card on top, then Основное,
  Внешний вид, Закреплённые, Законы и обновления, Клавиши, О программе) with the blocks on the right; the
  profile is the account at the top of the settings; the rows of results keep the document's badge and stars.
- A new design, or a change to these rules, is agreed with the owner first and comes as its own pull request
  into `dev`, with screenshots beside the mockup's.

### Doing the work
- Plans and decisions: `.scratch/ro-helper-v2/spec.md`; tickets, one a file, in `.scratch/ro-helper-v2/issues/`
  (status on each: needs-triage → in-progress → done, with a line on what was done); the backlog of defects and
  ideas in `.scratch/backlog/`.
- Test first where it can be: a React Testing Library test through `src/test/renderApp.tsx` (the whole app on
  the fake platform and fake accounts), unit tests beside the module. Before saying something is done:
  `npm test`, `npm run build`, `cargo check` in `src-tauri` for native changes — and for anything on screen,
  look at it in the browser preview and beside the mockup. Say plainly what was and wasn't checked.
- Anything that sends data anywhere new, or stores something new about the player, updates `PRIVACY.md`
  (a test checks its links against the app's allowed URLs) and the README's line on data, in the same change.

### Never
- Never generate, replace or read the update signing key (`%USERPROFILE%.taurio-helper.key`, GitHub secrets).
- Never create accounts, sign in, or type passwords, API keys or tokens anywhere. Supabase, Discord, the
  Telegram bot are set up by the owner; the code holds only Supabase's publishable key — never the secret or
  service_role key, the Discord client secret or the bot's token. Server changes are `supabase/migrations/*.sql`
  and `supabase/functions/*` files the owner runs and deploys.
- Never get past the forum's anti-DDoS check (see «Getting forum text»).

## Commands

- `npm run tauri dev` — the real overlay app (Tauri 2): frameless always-on-top window, hotkey Alt+Q by default, tray icon with «Выход»; uses port 1420, so stop the browser preview first. On the owner's PC Windows Smart App Control blocks the debug `ro-helper.exe` (and `cargo test`'s exe): check native changes with `cargo check`, the Rust tests run in CI, and the owner tries the installer from the draft release
- `npm run dev` — the app in a browser at http://127.0.0.1:1420, with a fake platform adapter and a stand-in game scene
- `npm test` — Vitest (law core, importer, UI with React Testing Library)
- `npm run typecheck` — TypeScript, no emit
- `npm run build` — typecheck + production bundle
- `npm run import` — rebuild `src/data/tverskoi.json` from the forum snapshots in `data/tverskoi/sources`, list anything the parser could not read and report what changed against the previous pack: changes to documents whose forum post was edited go into `data/tverskoi/changelog.json` (kept 90 days, shown in «Что изменилось»), other differences are the parser's and are only printed; `-- --check` reports without saving; a test fails if the bundled pack is stale

- Laws without a release: `npm run import` also writes `src/data/manifest.json` (each pack's `built` time and the `PACK_FORMAT`); installed copies poll it on `main` (`raw.githubusercontent.com`) and download a server's pack when it was built later than theirs, keeping it in `%APPDATA%\com.skyze.rohelper\laws`. So a law fix reaches players by committing the rebuilt packs to `main` — no tag. `built` changes only when a pack's content does. Bump `PACK_FORMAT` (`src/core/model.ts`) whenever the pack's shape changes in a way an older app would misread: older copies then keep their laws until they update
- Releases: the version lives only in `package.json`, «Что нового» in a `## <version>` section of `CHANGELOG.md` (the build fails without one; write it for every release, in Russian, for players); a pushed tag `v*` runs `.github/workflows/release.yml` (tests, NSIS installer, signed update, draft release with `latest.json` that installed copies poll). The update signing key is the user's (`%USERPROFILE%\.tauri\ro-helper.key`, GitHub secrets) — never generate or replace it
- Backlog of known defects and ideas put off for later: `.scratch/backlog/` (one ticket per file)
- `node scripts/readme-screenshots.mjs` — retake the README's `docs/screenshots` from the running browser preview (headless Edge over the DevTools protocol)
- `node scripts/icons.mjs` — rebuild `src/ui/symbols.ts`, the Material Symbols Rounded icons the app uses (names listed in the script), from the `@material-symbols/svg-400` dev dependency

## Architecture

- `data/<server>/sources` — forum snapshots: `<doc>.txt` (the first post's text, copied from the forum) + `<doc>.meta.json` (thread, url, last-edit date, `format`)
- `data/<server>/overrides.json` — manual fixes laid over the parser output, keyed by article id (part keys: number or `#<position>`); each has a `reason`
- `src/importer` — `parseLawText` with per-format rules (`criminal-code` УК, `administrative-code` КоАП, `traffic-rules` ПДД, `law` for every other law); reports unparsed lines instead of dropping them

## Getting forum text

The user wrote the Tverskoi law texts and allows copying them. The forum sits behind a JS anti-DDoS check — never bypass it; read threads in the user's Chrome (Claude in Chrome), in a tab you open yourself. Don't retype law text: in the page, take `document.querySelector('article.message .bbWrapper').innerText`, compute its FNV-1a checksum, return it in ~50k-char chunks (`{doc, from, to, total, parts: string[]}` with 800-char parts) so the tool saves each result to a file, then run `node scripts/snapshot-from-chunks.mjs <server> <doc> <fnv> <files…>` — it checks for gaps and the checksum before writing the snapshot.
- Each result must be 50,000–51,200 characters of pretty-printed JSON: a smaller one comes back inline instead of as a file, a larger one is cut at 50 KB by the browser tool. Pad a short chunk with a last key (`zz`) holding the document's own text repeated, sized by measuring `JSON.stringify(out, null, 2).length` (aim at ~50,800). Dashes or random letters don't work: too light or too heavy in tokens.
- One chunk per call (a batch joins the outputs), at most two calls at a time — more in parallel get dropped. Keep each thread's text in `sessionStorage` on the first visit (a new session starts a new tab, so it is gone then), then return the chunks without opening the threads again. Wait for `article.message .bbWrapper` before reading: the anti-DDoS page can come first.
- `src/core` — law core: pure TypeScript, no React/Tauri/UI/importer imports (a boundary test enforces it)
- `src/platform` — `PlatformAdapter` interface over everything native; `fake` for tests, `browser` for the preview, `tauri` for the app (window bounds and settings in the store plugin's `settings.json`)
- `src-tauri` — native side: plugins (global-shortcut, store, clipboard, opener, single-instance), tray menu, and `remember_foreground` / `restore_foreground` commands that hand focus back to the game when the overlay hides
- `src/account` — accounts (2.1): `Accounts` interface, Supabase with Discord (PKCE; the session in the settings, so signed-in works offline), a fake for tests. The browser comes back to a one-off listener of the app at `127.0.0.1:47321` (`src-tauri/src/sign_in.rs`), which must match the Supabase project's redirect URLs. Only the publishable key lives in the code — never the secret or service_role key
- `supabase/` — the server side of the accounts, deployed by the user (the agent never holds its secrets): `migrations/*.sql` pasted into the SQL editor, `functions/telegram-login` (Deno edge function, JWT verification off, secret `TELEGRAM_BOT_TOKEN`; `GET …/functions/v1/telegram-login?setup` points the bot's webhook at it). Signing in with Telegram goes through the helper's bot: the app opens `t.me/<bot>?start=<sha256 of a secret>`, the webhook notes who pressed «Start», the app claims the sign-in with the secret
- `src/ui` — React UI; visual tokens in `tokens.css` come from the approved mockup in `design/mockup`; the layout: see «Design» above

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
