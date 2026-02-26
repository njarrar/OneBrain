-- Keys for the iPhone app and its share sheet. Only a hash of each key is stored.
create table app_tokens (
  id           text primary key,
  token_hash   text not null unique,
  name         text not null,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at text
);
