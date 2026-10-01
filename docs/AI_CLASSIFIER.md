# The question classifier

`src/protocol/classify.ts` — what a question is, decided before any AI is asked. Plain rules over the words and the
server's own vocabulary; no AI, no network. A question the base cannot answer never reaches the model.

| Type | How it is told | What happens | AI calls |
|---|---|---|---|
| `greeting` | «привет», «спасибо», «что ты умеешь» | the app says what it does | 0 |
| `nonsense` | no word of the server's documents (core `unknownWords`), nor a word of the laws or rules; keyboard mashing | «Не понял вопрос…» | 0 |
| `out_of_scope` | the weather, the news, exchange rates, medicine, real politics; **the real laws of Russia** («по УК РФ», «по законам РФ») | «Я работаю только с законами… загруженными в ассистент» / «не использую реальные законы РФ» | 0 |
| `article_lookup` | a bare number: «65», «ук 10.2», «статья 65 ч 2» | the search's articles, as buttons | 0 |
| `legal` | words of the laws (статья, штраф, задержали, мент…), the server's synonyms («украл», «гнал»…), traffic words | analysis in the laws (+ charters) | 2 |
| `server_rule` | words of the project's rules (по правилам, nonRP, DM, MG, бан, варн, деморган, капт…) | analysis in the rules of the server | 2 |
| `mixed` | both kinds of words | analysis in both, told apart | 2 |
| `unclear` | neither | the AI's first call says what it is (with the search phrases); still unclear → «Закон или правила сервера?» | 1 (+1) |

The player's switch «Законы» / «Правила сервера» is the scope whatever the words say; when they look like the other
kind, the answer carries a note («вопрос похож на правила сервера, а выбран режим «Законы»»). A follow-up stays in its
case's scope; only what is plainly no question (a greeting, gibberish, out of scope) stops it.

Details worth knowing:
- JavaScript's `\b` and `\w` know only Latin letters: the patterns are written with them and rewritten (`ru()`) into
  a word edge and a letter that know Russian.
- «по правилам дорожного движения» is a law (ПДД), not the rules of the server; «административный» is not «админ».
- The lists grow from the players' own words — the reviewed dictionary of `.scratch/ai-closed-loop/spec.md` (P2).

Tests: `src/protocol/grounding.test.ts` («the classifier: what is no question of the base never reaches the AI»).
