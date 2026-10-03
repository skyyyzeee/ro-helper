# Who may do what with the AI

One engine; what it does for a player depends on their **profile**, taken from the organisation chosen in the
profile (`aiProfileOf` in `src/account/capabilities.ts`):

| Profile | Organisation | AI capabilities |
|---|---|---|
| Гражданский | none («Без организации») | `ai.analysis`, `ai.server_rules`, `ai.documents` (заявление, жалоба, иск) |
| Крайм | `kind: 'crime'` | the same |
| Государство | `kind: 'state'` (МВД, ФСБ, суд, адвокатура…) | the same + the service's tools: `ai.check`, `ai.practice`, `ai.official_documents` |
| — | the admin, any profile | + `ai.debug` |

`aiCapabilitiesOf({ admin, organization })` gives the set; the overlay hands it to the AI screens (`AiAccess` in
`AiView.tsx`). The AI works signed in or not — it never did need an account.

## What each one opens

- `ai.check` — the checks of an officer's actions: «Требования адвоката» and «Разбор задержания». Without it the
  tabs are not shown, a tab left open goes back to the analysis when the organisation changes, and the modes
  themselves (`useLawyerCheck`, `useDetentionReview`) refuse before any AI call (`NO_CHECK`).
- The side a case is seen from (`perspectivesFor` in `src/ui/ai.ts`) follows the profile: a citizen — citizen,
  lawyer; the state — state, lawyer, citizen; the crime — crime, lawyer, citizen. A side the profile may not take
  is not taken, even when asked for in code.
- `ai.practice` — the trainer: learning the laws by heart is the service's job; hidden and refused otherwise.
- `ai.official_documents` — an officer's documents (рапорт, протокол задержания); the others see a citizen's only.
- `ai.cases` — «Дела» (ADR 0003): names, pins, archive, the laws of then, «было → стало», copy as text. Only the
  forces of the state — organisations marked `"force": true` in `data/<server>/organizations.json` (МВД, ГИБДД, ФСБ,
  ФСО, Армия, СК, Прокуратура, Правительство). The others keep a plain «История»: open or delete.
- `ai.analysis`, `ai.server_rules`, `ai.documents` are everyone's; they are named so the
  interface asks for them, and a change of who gets them is one place.
- `ai.debug` — the admin's «Как ИИ пришёл к ответу» under each analysis (`DebugView.tsx`, docs/AI_FEEDBACK.md).

## Trust

The organisation is the player's own choice, confirmed by no one (decision 1а in
`.scratch/ai-closed-loop/spec.md`): the tools are for training, little harm in trusting it, and the interface says
so. That is also why the AI server does not check the profile yet — it would only check what the app tells it.
Moving to confirmed membership (roles of leaders and deputies, or a «сотрудник» role given by the leader) is a
change of `aiCapabilitiesOf` plus a check of the account's token on the AI server; nothing else needs to change.

Tests: `src/account/capabilities.test.ts`, `src/ui/perspectives.test.ts`, «who may check an officer's actions» in
`src/ui/Lawyer.test.tsx`.
