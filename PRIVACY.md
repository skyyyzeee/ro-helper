# Политика конфиденциальности

Редакция от 29 сентября 2026 года. Относится к программе РО Хелпер для Windows.

## Коротко

РО Хелпер не собирает данные о вас. В нём нет аккаунтов, аналитики, рекламы и телеметрии. Всё, что вы настраиваете, остаётся на вашем компьютере. В интернет программа обращается за обновлениями — к GitHub (это можно отключить) — и, только когда вы сами спрашиваете ИИ, к Google Gemini с вашим ключом (или к серверу ИИ, если он настроен).

## Что хранится на компьютере

- Настройки: сервер, организация, горячая клавиша, прозрачность, положение окон.
- Избранное и недавние статьи.
- Последняя просмотренная версия законов (для экрана «Что изменилось»), последняя запущенная версия программы (для «Что нового») и версия обновления, отложенная кнопкой «Позже».
- Законы, скачанные с GitHub, — в папке `laws` рядом с настройками.
- Ваш ключ Gemini для ИИ-разбора, если вы его ввели.
- Ваши данные для документов (ФИО, звание, должность), если вы их ввели.
- История ИИ-разборов: ваши вопросы и ответы ИИ, последние 30 на каждом сервере. Удаляется по одному или вся сразу: 🕘 → «Очистить историю».
- Модель распознавания речи, если вы спрашивали голосом через сервер ИИ (около 45 МБ, в кэше программы).

Всё это лежит в файле `%APPDATA%\com.skyze.rohelper\settings.json`. Служебные файлы окна (WebView2) — в `%LOCALAPPDATA%\com.skyze.rohelper`. Никуда не передаются, кроме ключа Gemini (если вы его ввели), который уходит в Google вместе с вопросом. Записи голоса программа не сохраняет. При удалении программы отметьте «Удалить данные приложения» — установщик сотрёт обе папки.

## Что уходит в интернет

**ИИ-разбор, документы, тренажёр, требования адвоката.** Только когда вы спрашиваете ИИ, программа отправляет в Google Gemini (`generativelanguage.googleapis.com`) с вашим ключом: текст вопроса (или описания ситуации, или ответа в тренажёре), предыдущие вопросы и ответы этого разговора, тексты статей законов, найденных по вопросу, а для документов — ваши данные для документов. См. [условия Gemini API](https://ai.google.dev/gemini-api/terms) и [политику конфиденциальности Google](https://policies.google.com/privacy). Не пишите в вопросе ничего личного.

Если в программе настроен сервер ИИ (папка `server/` в репозитории) и в настройках выбран он, то же самое вместо Google уходит на этот сервер вместе со случайным номером вашего компьютера, который программа создала сама (по нему считается дневной лимит вопросов). Сервер передаёт вопрос в ИИ и возвращает ответ; он хранит только счётчики вопросов за день.

**Голосовой вопрос.** Микрофон включается, только когда вы нажмёте 🎤 или клавишу вопроса поверх игры (по умолчанию Alt + W), и выключается, когда вы нажмёте ещё раз или отпустите клавишу (и в любом случае через минуту). С вашим ключом Gemini запись отправляется в Google Gemini, чтобы превратить речь в текст. Через сервер ИИ речь распознаётся прямо на вашем компьютере (Vosk), и запись никуда не уходит: для этого при первом голосовом вопросе программа один раз скачивает с сервера модель распознавания русской речи (около 45 МБ). Записи голоса не хранятся.

**Проверка обновлений.** При запуске и раз в 6 часов программа запрашивает файл с номером последней версии: `https://github.com/skyyyzeee/ro-helper/releases/latest/download/latest.json`. Если вы нажмёте «Обновить», она скачает установщик новой версии оттуда же. В запросах нет ничего о вас, кроме того, без чего не работает интернет: GitHub видит IP-адрес и технические заголовки запроса, как при открытии любой страницы. Как GitHub обращается с этими данными, описано в [его политике конфиденциальности](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

Автоматическую проверку можно выключить: «Настройки» → «Проверять обновления автоматически». Тогда программа не обращается в интернет, пока вы сами не нажмёте «Проверить обновления».

**Обновление законов.** С той же периодичностью и при нажатии «Проверить законы» программа запрашивает с GitHub файл со сведениями о свежих законах: `https://raw.githubusercontent.com/skyyyzeee/ro-helper/main/src/data/manifest.json`, — а если законы вашего сервера новее встроенных, скачивает их оттуда же (`…/src/data/<сервер>.json`) и сохраняет в `%APPDATA%\com.skyze.rohelper\laws`. В запросах нет ничего о вас. Выключается тем же переключателем «Проверять обновления автоматически».

**Ссылки.** «Тема на форуме», «Что нового», GitHub, Discord и страница получения ключа Gemini открываются в вашем браузере и только когда вы на них нажмёте. Дальше действуют правила этих сайтов.

Больше программа ничего не отправляет. Законы встроены в неё и работают без интернета; скачанные с GitHub лишь заменяют встроенные, когда те устарели.

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

**Privacy policy of RO Helper (РО Хелпер) for Windows, as of 29 September 2026.**

RO Helper does not collect data about you: no accounts, analytics, ads or telemetry.

- **Stored locally only:** settings (server, organisation, hotkey, transparency, window positions), your Gemini key and document details if you entered them, the last 30 AI conversations per server (clearable in the app), favourite and recent articles, the last seen version of the laws and a postponed update version — in `%APPDATA%\com.skyze.rohelper\settings.json`; WebView2 files in `%LOCALAPPDATA%\com.skyze.rohelper`. The uninstaller removes both when "Delete the application data" is checked.
- **AI (analysis, documents, trainer, lawyer's demands):** only when you ask, your question, the earlier turns of the conversation, the law articles found for it and, for documents, your document details go to Google Gemini (`generativelanguage.googleapis.com`) with your key ([Gemini API terms](https://ai.google.dev/gemini-api/terms), [Google Privacy Policy](https://policies.google.com/privacy)) — or, if an AI server is set up and chosen, to that server together with a random id of your computer for its daily limits; the server keeps only per-day counters.
- **Voice question:** the microphone records only between two presses of 🎤 or of the over-the-game key (a minute at most). With your Gemini key the recording goes to Gemini to be written down; with an AI server speech is recognised on your computer (Vosk) and the recording goes nowhere — the Russian speech model (~45 MB) is downloaded from the server once. Recordings are not kept.
- **Network:** the only automatic connection is the update check — at start and every 6 hours the app fetches `https://github.com/skyyyzeee/ro-helper/releases/latest/download/latest.json`, and downloads the new installer from the same place when you click "Update". No personal data is sent; GitHub sees your IP address and standard request headers ([GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)). Automatic checks can be turned off in the settings. Links (forum, release notes, GitHub, Discord, the Gemini key page) open in your browser only when you click them.
- **Keyboard, clipboard, game:** only the hotkey you choose is registered with Windows; other keystrokes are not recorded. The clipboard is written only when you copy a charge and is never read. The app does not read or modify game memory or inject into the game; it only remembers the active window to give it the focus back.

Contact: [Discord](https://discord.gg/VBNn86EmDd) or [GitHub issues](https://github.com/skyyyzeee/ro-helper/issues).
