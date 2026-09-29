# 13: Статистика

**What to build:** Личная статистика в профиле (открытые статьи, поиски, расчёты, частые статьи). Общие обезличенные счётчики для автора, переключатель «не отправлять», раздел в `PRIVACY.md` (Q8, Q17).

**Blocked by:** 12

**Status:** done — таблица usage_counts и count_usage созданы, вышло в 2.2.3

Сделано: личные счётчики по компьютерам (`stats:<device>`, `stats.devices` синхронизируются), профиль складывает их (`src/ui/stats.ts`, `StatsBlock`); обезличенные счётчики дня по серверу — `usage.pending`, отправка раз в час через `count_usage` (`src/account/usage.ts`, `supabase/migrations/20260929020000_usage_counts.sql`), переключатель в «О программе». PRIVACY.md и README обновлены.
