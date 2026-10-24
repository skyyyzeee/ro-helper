-- «Популярное у игроков» on the home screen: which articles were opened, a day and a server, by everyone. Nothing of
-- the player: no account, no computer, only the article's key («uk-65#1»). The app sends the counts through
-- count_articles once an hour, on the same switch as the anonymous counts (usage_counts); anyone reads the top of
-- the last week through popular_articles. The table itself is closed.

create table if not exists public.article_counts (
  day date not null,
  server text not null,
  article text not null,
  count bigint not null default 0,
  primary key (day, server, article)
);

alter table public.article_counts enable row level security;

create or replace function public.count_articles(counts jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
begin
  if jsonb_typeof(counts) <> 'array' or jsonb_array_length(counts) > 200 then
    return;
  end if;
  for item in select * from jsonb_array_elements(counts) loop
    -- Only what the app sends: a server's id, an article's key («pdd-I-1.5~2#3»), a recent day, a sane count.
    if (item ->> 'server') ~ '^[a-z]{3,20}$'
      and (item ->> 'article') ~ '^[a-zA-Z0-9][a-zA-Z0-9.~-]{0,60}#[0-9.]{0,10}$'
      and (item ->> 'day') ~ '^\d{4}-\d{2}-\d{2}$'
      and (item ->> 'count') ~ '^\d{1,4}$'
      and (item ->> 'day')::date between current_date - 7 and current_date + 1
      and (item ->> 'count')::int between 1 and 500 then
      insert into article_counts (day, server, article, count)
      values ((item ->> 'day')::date, item ->> 'server', item ->> 'article', (item ->> 'count')::int)
      on conflict (day, server, article) do update set count = article_counts.count + excluded.count;
    end if;
  end loop;
end;
$$;

-- The ten articles opened most on a server over the last week; one opened fewer than 5 times is no trend yet.
create or replace function public.popular_articles(target text) returns table (article text, count bigint)
language sql stable security definer set search_path = public as $$
  select c.article, sum(c.count)::bigint
  from article_counts c
  where c.server = target and c.day >= current_date - 7
  group by c.article
  having sum(c.count) >= 5
  order by 2 desc, 1
  limit 10;
$$;

revoke all on function public.count_articles(jsonb) from public;
revoke all on function public.popular_articles(text) from public;
grant execute on function public.count_articles(jsonb) to anon, authenticated;
grant execute on function public.popular_articles(text) to anon, authenticated;
