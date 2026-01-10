-- Core tables for the digital brain, on Cloudflare D1 (SQLite). One person, one database.
-- Times are ISO 8601 text in UTC.

create table sources (
  id           text primary key,          -- x, youtube, instagram, photos, feedly, manual
  name         text not null,
  status       text not null default 'not_connected'
               check (status in ('connected', 'import', 'not_connected', 'error')),
  last_sync_at text,
  last_error   text,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

insert into sources (id, name, status) values
  ('manual',    'Added by hand',  'connected'),
  ('x',         'X',              'not_connected'),
  ('youtube',   'YouTube',        'not_connected'),
  ('instagram', 'Instagram',      'not_connected'),
  ('photos',    'Screenshots',    'not_connected'),
  ('feedly',    'Feedly',         'not_connected');

create table categories (
  name        text primary key,
  description text not null default '',
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table items (
  id            text primary key,
  title         text,
  summary       text,
  body          text,
  note          text,
  url           text,
  kind          text not null default 'link',   -- link, post, video, image, note, article
  category      text references categories (name) on update cascade on delete set null,
  status        text not null default 'inbox' check (status in ('inbox', 'read', 'archived')),
  author        text,
  author_handle text,
  posted_at     text,
  media         text not null default '[]',     -- JSON array of image URLs
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The same link saved in two places is one item.
create unique index items_url_key on items (url) where url is not null;
create index items_status_idx on items (status, created_at desc);
create index items_category_idx on items (category);

-- Word search. unicode61 handles Arabic and English alike.
create virtual table items_fts using fts5 (
  title, note, summary, author, author_handle, body,
  content = 'items', content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);

create trigger items_fts_insert after insert on items begin
  insert into items_fts (rowid, title, note, summary, author, author_handle, body)
  values (new.rowid, new.title, new.note, new.summary, new.author, new.author_handle, new.body);
end;

create trigger items_fts_delete after delete on items begin
  insert into items_fts (items_fts, rowid, title, note, summary, author, author_handle, body)
  values ('delete', old.rowid, old.title, old.note, old.summary, old.author, old.author_handle, old.body);
end;

create trigger items_fts_update after update of title, note, summary, author, author_handle, body on items begin
  insert into items_fts (items_fts, rowid, title, note, summary, author, author_handle, body)
  values ('delete', old.rowid, old.title, old.note, old.summary, old.author, old.author_handle, old.body);
  insert into items_fts (rowid, title, note, summary, author, author_handle, body)
  values (new.rowid, new.title, new.note, new.summary, new.author, new.author_handle, new.body);
end;

-- Where and when each item was saved. An item can have many saves.
create table saves (
  id           text primary key,
  item_id      text not null references items (id) on delete cascade,
  source_id    text not null references sources (id),
  external_id  text,
  saved_at     text,
  original_url text,
  raw          text,                          -- the source's data as JSON, kept as is
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (source_id, external_id)
);
create index saves_item_idx on saves (item_id);

create table tags (
  id         integer primary key autoincrement,
  name       text not null unique collate nocase,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table item_tags (
  item_id  text    not null references items (id) on delete cascade,
  tag_id   integer not null references tags (id) on delete cascade,
  added_by text    not null default 'user' check (added_by in ('user', 'claude', 'import')),
  added_at text    not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (item_id, tag_id)
);
create index item_tags_tag_idx on item_tags (tag_id);

-- Photos and files added by hand. The bytes live in R2 under r2_key.
create table files (
  id         text primary key,
  item_id    text    not null references items (id) on delete cascade,
  filename   text    not null,
  mime       text    not null,
  size       integer not null,
  r2_key     text    not null,
  created_at text    not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index files_item_idx on files (item_id);

create table sync_runs (
  id          integer primary key autoincrement,
  source_id   text not null references sources (id),
  started_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at text,
  added       integer not null default 0,
  error       text
);
