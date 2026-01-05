# Digital Brain

One place for everything you save: X bookmarks, YouTube, Instagram saves,
screenshots, Feedly and things added by hand. Claude sorts and tags it all, and
nothing is thrown away.


## Layout

| Folder | What it is |
| --- | --- |
| `web/` | Next.js web app (and later the API the iPhone app uses) |
| `db/migrations/` | Postgres schema, run in name order |

## Run it locally

You need Node 20+ and a Postgres database (a free Supabase project works).

```sh
cd web
npm install
cp .env.example .env.local      # then fill in DATABASE_URL, APP_PASSWORD, SESSION_SECRET
npm run migrate                 # creates the tables
npm run dev                     # http://localhost:3000
```

## Import X bookmarks you already exported

The older `x-bookmark-manager` and `x-bookmarks-review` repos hold JSON exports.
Import one or both. Running it again is safe: bookmarks already there are skipped.

```sh
cd web
npm run import:x -- ../../x-bookmark-manager/bookmarks_export.json ../../x-bookmarks-review/bookmarks_db.json
```

Add `--status read` to keep them out of the inbox.

## Build order

1. Core app and adding by hand (this step)
2. Claude sorting and search
3. X and YouTube sync
4. iPhone app with share sheet and screenshots
5. Instagram, YouTube Watch Later, Feedly and Google Photos imports
6. Ask questions across the archive, weekly digest
