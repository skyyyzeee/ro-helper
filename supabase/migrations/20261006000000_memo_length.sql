-- Memos as documents (PR #39): with formatting and what is pasted from Word, 1000 characters are too few.
-- A memo may now be up to 3000 characters, markup included. Run before the release that lets the app write
-- that much is published: until then the app still stops at what the table holds.
-- Safe to run again.

alter table public.memos drop constraint if exists memos_text_check;
alter table public.memos add constraint memos_text_check check (char_length(text) between 1 and 3000);
