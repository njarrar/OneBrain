-- Small key/value store for app settings, such as the Feedly hook key and the YouTube sign-in token.
create table settings (
  key        text primary key,
  value      text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
