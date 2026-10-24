-- The whole of article_counts for one server, a day at a time, for whoever needs more than the home screen's top ten
-- (the AI server among them). The same anonymous numbers popular_articles adds up: a day, an article's key and how
-- many times it was opened — nothing of the player. The table stays closed; this is the one more way to read it.
-- At most the last 30 days, today included; the API returns up to its row limit (1000 by default) at a time, more
-- with `limit` / `offset` in the request.

create or replace function public.article_stats(target text, days int default 7)
returns table (day date, article text, count bigint)
language sql stable security definer set search_path = public as $$
  select c.day, c.article, c.count
  from article_counts c
  where c.server = target
    and c.day > current_date - least(greatest(coalesce(days, 7), 1), 30)
  order by c.day desc, c.count desc, c.article;
$$;

revoke all on function public.article_stats(text, int) from public;
grant execute on function public.article_stats(text, int) to anon, authenticated;
