-- Signing in with Telegram (ticket 18). The app opens the bot with t.me/<bot>?start=<id>, where <id> is
-- the SHA-256 of a secret only the app knows; the player presses «Start», the bot's webhook (the edge
-- function telegram-login) writes down who they are under that id, and the app claims the sign-in with
-- the secret. Only the edge function, with the service role, touches these tables: no policies.

create table if not exists public.telegram_logins (
  id text primary key,
  created_at timestamptz not null default now(),
  telegram_id bigint not null,
  name text not null,
  username text
);

-- Which account a Telegram user signs in to: their own, or the Discord one they linked it to.
create table if not exists public.telegram_accounts (
  telegram_id bigint primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  linked_at timestamptz not null default now()
);

alter table public.telegram_logins enable row level security;
alter table public.telegram_accounts enable row level security;
