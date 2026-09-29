# Политика конфиденциальности

Редакция от 29 сентября 2026 года. Относится к программе «Кремлёвский Ассистент» (раньше — «РО Хелпер») для Windows.

## Коротко

Пока вы не вошли в аккаунт, Кремлёвский Ассистент не собирает и не отправляет данные о вас. Рекламы в нём нет. Автору уходят только обезличенные счётчики — сколько за день открыто статей, сделано поисков и расчётов на каждом сервере, без чего-либо о вас; их можно выключить. Всё, что вы настраиваете, остаётся на вашем компьютере. В интернет программа обращается за обновлениями — к GitHub, и это можно отключить.

Вход через Discord или Telegram — по желанию. Если вы войдёте, в аккаунте хранятся ваши данные оттуда: из Discord — номер, имя, аватар и почта, из Telegram — номер, имя и ник (подробно — ниже).

## Что хранится на компьютере

- Настройки: сервер, организация, горячая клавиша, прозрачность, положение окон.
- Избранное и недавние статьи.
- Последняя просмотренная версия законов (для экрана «Что изменилось»), последняя запущенная версия программы (для «Что нового») и версия обновления, отложенная кнопкой «Позже».
- Законы, скачанные с GitHub, — в папке `laws` рядом с настройками.

- Если вы вошли в аккаунт: ваше имя и аватар из Discord (или имя и ник из Telegram) и ключи входа, по которым программа помнит вас без интернета.

Всё это лежит в файле `%APPDATA%\com.skyze.rohelper\settings.json`. Служебные файлы окна (WebView2) — в `%LOCALAPPDATA%\com.skyze.rohelper`. Никуда не передаются. При удалении программы отметьте «Удалить данные приложения» — установщик сотрёт обе папки.

## Что уходит в интернет

**Проверка обновлений.** При запуске и раз в 6 часов программа запрашивает файл с номером последней версии: `https://github.com/skyyyzeee/ro-helper/releases/latest/download/latest.json`. Если вы нажмёте «Обновить», она скачает установщик новой версии оттуда же. В запросах нет ничего о вас, кроме того, без чего не работает интернет: GitHub видит IP-адрес и технические заголовки запроса, как при открытии любой страницы. Как GitHub обращается с этими данными, описано в [его политике конфиденциальности](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

Автоматическую проверку можно выключить: «Настройки» → «Проверять обновления автоматически». Тогда программа не обращается в интернет, пока вы сами не нажмёте «Проверить обновления».

**Обновление законов.** С той же периодичностью и при нажатии «Проверить законы» программа запрашивает с GitHub файл со сведениями о свежих законах: `https://raw.githubusercontent.com/skyyyzeee/ro-helper/main/src/data/manifest.json`, — а если законы вашего сервера новее встроенных, скачивает их оттуда же (`…/src/data/<сервер>.json`) и сохраняет в `%APPDATA%\com.skyze.rohelper\laws`. В запросах нет ничего о вас. Выключается тем же переключателем «Проверять обновления автоматически».

**Аккаунт (по желанию).** Когда вы нажимаете «Настройки» → «Аккаунт» → «Войти через Discord», программа открывает в браузере вход через сервис Supabase (`https://evwyrdytojwxlvgqrkar.supabase.co`), который перенаправляет вас в Discord. Если вы подтвердите вход, Discord передаёт в аккаунт ваш номер пользователя Discord, имя, ссылку на аватар и адрес почты; Supabase хранит их вместе с датой входа и IP-адресом, с которого вы входили. После подтверждения браузер возвращается в программу через адрес `http://127.0.0.1:47321` — он работает только на вашем компьютере и только во время входа. Аватар программа загружает с серверов Discord. Кнопка «Выйти» забывает вход на этом компьютере; чтобы удалить аккаунт целиком, напишите автору. Как Supabase обращается с данными, описано в [его политике конфиденциальности](https://supabase.com/privacy).

**Обезличенная статистика для автора.** Раз в час, когда ассистент открыт, программа отправляет на сервер Кремлёвского Ассистента (Supabase) числа за день: сколько открыто статей, сделано поисков и расчётов наказания — отдельно по каждому серверу игры. Без аккаунта, без номера компьютера, без самих статей и запросов; сервер складывает их с числами всех остальных игроков. Выключается в «Настройки» → «О программе» → «Отправлять автору обезличенную статистику»; тогда ничего не отправляется, а накопленное стирается.

**Ваша статистика (если вы вошли).** В профиле видно, сколько вы открыли статей, сделали поисков и расчётов и какими статьями пользуетесь чаще всего. Эти числа хранятся в вашем аккаунте вместе с настройками (по одному набору на компьютер) и видны только вам.

**Синхронизация (если вы вошли).** Чтобы на всех ваших компьютерах было одно и то же, в аккаунте хранятся: сервер и организация, игровой ник и должность, если вы их указали, тема, акцент и прозрачность, избранное, недавние статьи и наборы закреплённых карточек — каждого сервера. Горячая клавиша, положение окон, карточки, закреплённые прямо сейчас, и отметки о просмотренном остаются только на компьютере. Программа отправляет изменение через пару секунд после него и забирает изменения с других компьютеров при запуске и каждый раз, когда вы открываете ассистент; без интернета изменения ждут на компьютере. Эти данные видны только вам: правила базы не дают читать и менять чужие. «Выйти» останавливает синхронизацию, а данные на компьютере остаются.

**Вход через Telegram (по желанию).** «Войти через Telegram» (или «Привязать Telegram» к аккаунту Discord) открывает в Telegram бота Кремлёвского Ассистента со случайным кодом входа. Когда вы нажимаете у бота «Запустить», Telegram передаёт боту ваш номер пользователя Telegram, имя и ник; сервер Кремлёвского Ассистента на Supabase сохраняет их в аккаунте и отвечает вам одним сообщением. Пока вход не завершён, программа раз в две секунды спрашивает у сервера, нажали ли вы «Запустить»; код входа забывается через 10 минут. Бот не читает других сообщений и никому не пишет сам. Как Telegram обращается с данными, описано в [его политике конфиденциальности](https://telegram.org/privacy).

**Ссылки.** «Тема на форуме», «Что нового», GitHub и Discord открываются в вашем браузере и только когда вы на них нажмёте. Дальше действуют правила этих сайтов.

Больше программа ничего не отправляет. Без входа в аккаунт она обращается к Supabase только с обезличенными счётчиками (если они не выключены) и не обращается к боту в Telegram. Законы встроены в неё и работают без интернета; скачанные с GitHub лишь заменяют встроенные, когда те устарели.

## Клавиатура, буфер обмена и игра

- Программа регистрирует в Windows только выбранную вами горячую клавишу и не записывает другие нажатия. Текст в строке поиска не сохраняется; запоминаются только открытые статьи — в списке недавних.
- В буфер обмена программа записывает обвинение, только когда вы нажмёте «Скопировать» или <kbd>Ctrl</kbd>+<kbd>C</kbd>. Содержимое буфера она не читает.
- Программа не читает и не изменяет память игры и не внедряется в её процесс. Она лишь запоминает, какое окно было активным, чтобы вернуть ему фокус, когда оверлей скрывается.

## Изменения

Новая редакция политики выходит вместе с программой и публикуется в этом файле; история изменений видна в [репозитории](https://github.com/skyyyzeee/ro-helper/commits/main/PRIVACY.md).

## Связь

Вопросы — в [Discord](https://discord.gg/VBNn86EmDd) или в [issues на GitHub](https://github.com/skyyyzeee/ro-helper/issues). Автор — skyze.

---

## English

**Privacy policy of Kremlin Assistant («Кремлёвский Ассистент», formerly Kremlin Assistant) for Windows, as of 29 September 2026.**

Until you sign in, Kremlin Assistant does not collect or send any data about you and shows no ads. It sends the author only anonymous daily counts — articles opened, searches and punishment calculations per game server, nothing about you — which can be turned off. Signing in with Discord or Telegram is optional.

- **Stored locally only:** settings (server, organisation, hotkey, transparency, window positions), favourite and recent articles, the last seen version of the laws and a postponed update version — in `%APPDATA%\com.skyze.rohelper\settings.json`; WebView2 files in `%LOCALAPPDATA%\com.skyze.rohelper`. The uninstaller removes both when "Delete the application data" is checked.
- **Network:** the only automatic connection is the update check — at start and every 6 hours the app fetches `https://github.com/skyyyzeee/ro-helper/releases/latest/download/latest.json`, and downloads the new installer from the same place when you click "Update". No personal data is sent; GitHub sees your IP address and standard request headers ([GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)). Automatic checks can be turned off in the settings. Links (forum, release notes, GitHub, Discord) open in your browser only when you click them.
- **Account (optional):** "Profile" → "Sign in with Discord" opens a sign-in through Supabase (`https://evwyrdytojwxlvgqrkar.supabase.co`) and Discord in your browser, which comes back to the app at `http://127.0.0.1:47321` (local to your computer, only during the sign-in). If you agree, your Discord user id, name, avatar link and email are stored in your account at Supabase, with the sign-in time and IP address ([Supabase Privacy Policy](https://supabase.com/privacy)); your name, avatar and sign-in keys are also kept in `settings.json`. "Sign out" forgets the sign-in on this computer; to delete the account, contact the author.
- **Anonymous counts:** at most once an hour the app adds its day's counts (articles opened, searches, calculations, per game server) to the author's at Supabase, with no account, computer id, articles or queries. Settings → About → "Send the author anonymous statistics" turns it off and clears what was waiting.
- **Your statistics (when signed in):** the counts shown in your profile, and the articles you use most, are kept in your account (one set per computer) and seen by you only.
- **Sync (when signed in):** your server and organisation, the game name and position if you gave them, theme, accent and transparency, favourite and recent articles and saved sets of pinned cards are kept in your account at Supabase so that every computer you sign in on has the same; the hotkey, window positions, the cards pinned right now and what you have seen stay on the computer. Changes are sent a couple of seconds after they are made and fetched at start and whenever the overlay opens; the database's rules let only you read or change them.
- **Telegram (optional):** "Sign in with Telegram" (or "Link Telegram") opens the Kremlin Assistant bot with a random sign-in code; pressing "Start" there gives the bot your Telegram user id, name and username, which the Kremlin Assistant server at Supabase keeps in your account. Until then the app asks the server every two seconds; the code is forgotten after 10 minutes. The bot reads no other messages ([Telegram Privacy Policy](https://telegram.org/privacy)).
- **Keyboard, clipboard, game:** only the hotkey you choose is registered with Windows; other keystrokes are not recorded. The clipboard is written only when you copy a charge and is never read. The app does not read or modify game memory or inject into the game; it only remembers the active window to give it the focus back.

Contact: [Discord](https://discord.gg/VBNn86EmDd) or [GitHub issues](https://github.com/skyyyzeee/ro-helper/issues).
