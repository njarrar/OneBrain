-- Keep BEGIN and END in capitals: the real D1 database only splits triggers correctly that way.
-- One key per saved thing, so the same post or link saved from two places is one item.
-- See web/src/lib/canonical.ts for the rules: x:<tweet id>, yt:<video id>, ig:<shortcode>,
-- url:<canonical link>, img:<sha-256 of the picture>, note:<sha-256 of the words>.
alter table items add column canon text;
create unique index items_canon_key on items (canon) where canon is not null;

-- Pictures are keyed by their bytes.
alter table files add column sha256 text;
create index files_sha256_idx on files (sha256) where sha256 is not null;

-- Fill the keys that can be read off the ids the X, YouTube and Instagram imports use.
-- Ids made by hashing a link are exactly 20 hex characters and are left alone.
-- Everything else (and any copy that would clash) is keyed by web/scripts/dedupe.ts.
update or ignore items set canon = 'x:' || substr(id, 3)
  where canon is null and id glob 'x-[0-9]*' and substr(id, 3) not glob '*[^0-9]*' and length(id) between 3 and 21;
update or ignore items set canon = 'yt:' || substr(id, 9)
  where canon is null and id glob 'youtube-*' and length(id) = 19 and substr(id, 9) not glob '*[^A-Za-z0-9_-]*';
update or ignore items set canon = 'ig:' || substr(id, 11)
  where canon is null and id glob 'instagram-*' and length(id) between 15 and 50
    and substr(id, 11) not glob '*[^A-Za-z0-9_-]*'
    and not (length(id) = 30 and substr(id, 11) not glob '*[^0-9a-f]*');
