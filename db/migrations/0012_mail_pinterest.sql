-- Gmail, Outlook and Pinterest as sources. Each connects with its own sign-in on the Sources page.
-- Email comes in with kind 'email' and status 'read': it shows under All and in search and
-- Ask Brain, but stays out of the Inbox. Pins come in with kind 'pin'.
-- From now on the AI reads every kind of save, not only notes, pictures and audio.
insert or ignore into sources (id, name, status) values
  ('gmail',     'Gmail',     'not_connected'),
  ('outlook',   'Outlook',   'not_connected'),
  ('pinterest', 'Pinterest', 'not_connected');

create index if not exists items_kind_idx on items (kind);

-- Every save not read yet, newest first, for the hourly reading.
create index if not exists items_unread_all_idx on items (created_at desc) where text_at is null and deleted_at is null;
