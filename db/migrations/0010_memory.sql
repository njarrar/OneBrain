-- Memory features (ideas from the brain-recall and brain-reader builds). Additive only.
--   sort_at        the list order (posted date, else saved date), so pages can follow a cursor
--   reminders      when an item comes back in Resurface, with a small spaced-repetition state
--   resurface_log  which cards were answered each day
--   embedded_at    when the item's meaning vector was last made; null means "make it again"
--   weekly_digests one short write-up per week of what was saved

-- A virtual generated column: nothing is rewritten, and the list can page by (sort_at, id) on an index.
alter table items add column sort_at text generated always as (coalesce(posted_at, created_at)) virtual;
create index items_sort_idx on items (sort_at desc, id desc);

create table reminders (
  item_id       text primary key references items (id) on delete cascade,
  due_at        text not null,
  interval_days real not null default 0,
  ease          real not null default 2.5,
  reviews       integer not null default 0,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index reminders_due_idx on reminders (due_at);

-- Which Resurface cards were answered on which day, so an answered card doesn't come back the same day.
create table resurface_log (
  item_id text not null references items (id) on delete cascade,
  day     text not null,                    -- YYYY-MM-DD (UTC)
  how     text not null check (how in ('keep', 'later', 'done')),
  primary key (item_id, day)
);

alter table items add column embedded_at text;
create index items_unembedded_idx on items (created_at desc) where embedded_at is null and deleted_at is null;

create table weekly_digests (
  week_start text primary key,              -- the Monday the week starts on, YYYY-MM-DD (UTC)
  body       text not null,                 -- Claude's write-up, with [n] marks for item_ids[n-1]
  item_ids   text not null default '[]',    -- JSON array of the items it mentions
  saved      integer not null default 0,    -- how many things were saved that week
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
