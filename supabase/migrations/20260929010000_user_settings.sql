-- The settings that follow a player between computers (tickets 10 and 11): one row a setting, readable and
-- writable by its owner only. The app sends each change with the time it was made; an older one never
-- overwrites a newer one (a change made offline on another computer arrives later but is not newer).

create table if not exists public.user_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (char_length(key) <= 100),
  value jsonb,
  updated_at timestamptz not null,
  primary key (user_id, key),
  check (pg_column_size(value) <= 262144)
);

alter table public.user_settings enable row level security;

drop policy if exists "own settings: read" on public.user_settings;
drop policy if exists "own settings: add" on public.user_settings;
drop policy if exists "own settings: change" on public.user_settings;
create policy "own settings: read" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "own settings: add" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own settings: change" on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The later change wins.
create or replace function public.user_settings_keep_newer() returns trigger language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists user_settings_keep_newer on public.user_settings;
create trigger user_settings_keep_newer before update on public.user_settings
  for each row execute function public.user_settings_keep_newer();
