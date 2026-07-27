-- Trash and unread, for the new iPhone design.
--   deleted_at  set when an item goes to Trash; cleared when it comes back. Trashed items
--               leave every list but Trash, until they are deleted for good.
--   read_at     set when an item is opened or marked read; null shows an unread dot.
-- Additive only: nothing is dropped or rewritten.
alter table items add column deleted_at text;
alter table items add column read_at text;
create index items_deleted_idx on items (deleted_at);

-- Items already read or archived count as read. Inbox items start unread.
update items set read_at = coalesce(updated_at, created_at) where status <> 'inbox';
