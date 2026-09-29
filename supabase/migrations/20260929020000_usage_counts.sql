-- Anonymous counts for the author (ticket 13, Q8/Q17): how many articles were opened, searches made and
-- punishments worked out, a day and a server. Nothing of the player: no account, no computer, no article.
-- The app sends them through count_usage (anyone may call it; the table itself is closed); the author reads
-- the table in the dashboard. Players turn the sending off in the settings.

create table if not exists public.usage_counts (
  day date not null,
  server text not null,
  event text not null,
  count bigint not null default 0,
  primary key (day, server, event)
);

alter table public.usage_counts enable row level security;

create or replace function public.count_usage(counts jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
begin
  if jsonb_typeof(counts) <> 'array' or jsonb_array_length(counts) > 60 then
    return;
  end if;
  for item in select * from jsonb_array_elements(counts) loop
    -- Only what the app sends: a known event, a server's id, a recent day, a sane count.
    if (item ->> 'event') in ('open', 'search', 'calculation')
      and (item ->> 'server') ~ '^[a-z]{3,20}$'
      and (item ->> 'day') ~ '^\d{4}-\d{2}-\d{2}$'
      and (item ->> 'count') ~ '^\d{1,4}$'
      and (item ->> 'day')::date between current_date - 7 and current_date + 1
      and (item ->> 'count')::int between 1 and 5000 then
      insert into usage_counts (day, server, event, count)
      values ((item ->> 'day')::date, item ->> 'server', item ->> 'event', (item ->> 'count')::int)
      on conflict (day, server, event) do update set count = usage_counts.count + excluded.count;
    end if;
  end loop;
end;
$$;

revoke all on function public.count_usage(jsonb) from public;
grant execute on function public.count_usage(jsonb) to anon, authenticated;
