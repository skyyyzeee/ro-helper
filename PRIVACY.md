# Политика конфиденциальности

Редакция от 12 сентября 2026 года. Относится к программе РО Хелпер для Windows.

## Коротко

РО Хелпер не собирает и не отправляет данные о вас. В нём нет аккаунтов, аналитики, рекламы и телеметрии. Всё, что вы настраиваете, остаётся на вашем компьютере. В интернет программа обращается только за обновлениями — к GitHub, и это можно отключить.

## Что хранится на компьютере

- Настройки: сервер, организация, горячая клавиша, прозрачность, положение окон.
- Избранное и недавние статьи.
- Последняя просмотренная версия законов (для экрана «Что изменилось») и версия обновления, отложенная кнопкой «Позже».

Всё это лежит в файле `%APPDATA%\com.skyze.rohelper\settings.json`. Служебные файлы окна (WebView2) — в `%LOCALAPPDATA%\com.skyze.rohelper`. Никуда не передаются. При удалении программы отметьте «Удалить данные приложения» — установщик сотрёт обе папки.

## Что уходит в интернет

**Проверка обновлений.** При запуске и раз в 6 часов программа запрашивает файл с номером последней версии: `https://github.com/skyyyzeee/ro-helper/releases/latest/download/latest.json`. Если вы нажмёте «Обновить», она скачает установщик новой версии оттуда же. В запросах нет ничего о вас, кроме того, без чего не работает интернет: GitHub видит IP-адрес и технические заголовки запроса, как при открытии любой страницы. Как GitHub обращается с этими данными, описано в [его политике конфиденциальности](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

Автоматическую проверку можно выключить: «Настройки» → «Проверять обновления автоматически». Тогда программа не обращается в интернет, пока вы сами не нажмёте «Проверить обновления».

**Ссылки.** «Тема на форуме», «Что нового», GitHub и Discord открываются в вашем браузере и только когда вы на них нажмёте. Дальше действуют правила этих сайтов.

Больше программа ничего не отправляет. Законы встроены в неё и работают без интернета.

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

**Privacy policy of RO Helper (РО Хелпер) for Windows, as of 12 September 2026.**

RO Helper does not collect or send any data about you: no accounts, analytics, ads or telemetry.

- **Stored locally only:** settings (server, organisation, hotkey, transparency, window positions), favourite and recent articles, the last seen version of the laws and a postponed update version — in `%APPDATA%\com.skyze.rohelper\settings.json`; WebView2 files in `%LOCALAPPDATA%\com.skyze.rohelper`. The uninstaller removes both when "Delete the application data" is checked.
- **Network:** the only automatic connection is the update check — at start and every 6 hours the app fetches `https://github.com/skyyyzeee/ro-helper/releases/latest/download/latest.json`, and downloads the new installer from the same place when you click "Update". No personal data is sent; GitHub sees your IP address and standard request headers ([GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)). Automatic checks can be turned off in the settings. Links (forum, release notes, GitHub, Discord) open in your browser only when you click them.
- **Keyboard, clipboard, game:** only the hotkey you choose is registered with Windows; other keystrokes are not recorded. The clipboard is written only when you copy a charge and is never read. The app does not read or modify game memory or inject into the game; it only remembers the active window to give it the focus back.

Contact: [Discord](https://discord.gg/VBNn86EmDd) or [GitHub issues](https://github.com/skyyyzeee/ro-helper/issues).
