-- Every save gets searchable text, and Claude pulls out who, when and what.
--   transcript  words heard in a voice memo or video, or read from a screenshot or photo
--   facts       JSON from Claude: { people: [{ name, about }], dates: [{ date, what, person, yearly }] }
--   text_at     when Brain last read the item for this; null means "read it"
--   text_error  why the last read failed, so one bad file doesn't stop the rest
alter table items add column transcript text;
alter table items add column facts text;
alter table items add column text_at text;
alter table items add column text_error text;

-- Only saves with something to read: your own notes, pictures, audio and video files.
create index items_unread_text_idx on items (created_at desc)
  where text_at is null and deleted_at is null and kind in ('note', 'image', 'audio', 'video', 'file');

-- Word search now covers the transcript and the facts too, so "birthday" or a name finds a voice memo.
drop trigger items_fts_insert;
drop trigger items_fts_delete;
drop trigger items_fts_update;
drop table items_fts;

create virtual table items_fts using fts5 (
  title, note, summary, author, author_handle, body, transcript, facts,
  content = 'items', content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);

create trigger items_fts_insert after insert on items BEGIN
  insert into items_fts (rowid, title, note, summary, author, author_handle, body, transcript, facts)
  values (new.rowid, new.title, new.note, new.summary, new.author, new.author_handle, new.body, new.transcript, new.facts);
END;

create trigger items_fts_delete after delete on items BEGIN
  insert into items_fts (items_fts, rowid, title, note, summary, author, author_handle, body, transcript, facts)
  values ('delete', old.rowid, old.title, old.note, old.summary, old.author, old.author_handle, old.body, old.transcript, old.facts);
END;

create trigger items_fts_update after update of title, note, summary, author, author_handle, body, transcript, facts on items BEGIN
  insert into items_fts (items_fts, rowid, title, note, summary, author, author_handle, body, transcript, facts)
  values ('delete', old.rowid, old.title, old.note, old.summary, old.author, old.author_handle, old.body, old.transcript, old.facts);
  insert into items_fts (rowid, title, note, summary, author, author_handle, body, transcript, facts)
  values (new.rowid, new.title, new.note, new.summary, new.author, new.author_handle, new.body, new.transcript, new.facts);
END;

insert into items_fts (items_fts) values ('rebuild');
