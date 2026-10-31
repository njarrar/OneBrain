-- Clear the pile, "why I kept it" and the monthly podcast. Additive only.
--   kept_why       why a save was kept: use, learn, buy, someone or idea. Ask Brain reads it.
--   snoozed_until  a save snoozed in the pile stays out of it until then.
--   podcasts       a spoken recap of the last thirty days, two voices, kept in R2 as one MP3.
alter table items add column kept_why text check (kept_why in ('use', 'learn', 'buy', 'someone', 'idea'));
alter table items add column snoozed_until text;
create index items_pile_idx on items (sort_at, id) where status = 'inbox' and deleted_at is null;

create table podcasts (
  id         text primary key,
  title      text not null,
  from_day   text not null,                 -- YYYY-MM-DD, first day it covers
  to_day     text not null,                 -- YYYY-MM-DD, last day it covers
  script     text not null,                 -- JSON array of { host, text }
  item_ids   text not null default '[]',    -- JSON array of the saves it talks about
  r2_key     text not null,
  size       integer not null,
  seconds    real,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
