# 18: Вход через Telegram

**What to build:** Вход через Telegram к тому же аккаунту (Q13): привязка в профиле, проверка подписи серверной функцией.

**Blocked by:** —

**Status:** done — бот @rohelper_loginbot, функция развёрнута, вебхук установлен; ждёт проверки входа в установленной 2.1.3

Сделано через бота, а не Login Widget (тому нужен свой сайт): хелпер открывает `t.me/<бот>?start=<sha256(секрета)>`, «Запустить» у бота → вебхук (edge function `supabase/functions/telegram-login`, проверка заголовка secret_token) записывает, кто это; хелпер забирает вход по секрету и получает сессию (generateLink + verifyOtp). «Привязать Telegram» — к аккаунту Discord (таблица `telegram_accounts`). Таблицы: `supabase/migrations/20260929000000_telegram.sql`. Проверено: юнит-тесты клиента и прогон функции в Node на заглушках (16 сценариев).
