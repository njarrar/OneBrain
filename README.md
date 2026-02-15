# Digital Brain

One place for everything you save: X bookmarks, YouTube, Instagram saves,
screenshots, Feedly and things added by hand. Claude sorts and tags it all, and
nothing is thrown away.


## Layout

| Folder | What it is |
| --- | --- |
| `web/` | Next.js web app, run on Cloudflare Workers (and later the API the iPhone app uses) |
| `db/migrations/` | D1 (SQLite) schema, applied in name order by Wrangler |

Everything runs on Cloudflare: the app on Workers, the data in D1 (`digital-brain`),
and photos and screenshots in R2 (`digital-brain-files`).

## Run it locally

You need Node 20+. Wrangler keeps a local copy of D1 and R2 in `web/.wrangler`.

```sh
cd web
npm install
cp .dev.vars.example .dev.vars  # then set BETTER_AUTH_SECRET
npm run migrate                 # creates the tables in the local D1 copy
npm run dev                     # http://localhost:3000
npm run preview                 # the real Worker build, http://localhost:8787
```

## Import X bookmarks you already exported

The older `x-bookmark-manager` and `x-bookmarks-review` repos hold JSON exports.
Import one or both. Running it again is safe: bookmarks already there are skipped.

```sh
cd web
npm run import:x -- ../../x-bookmark-manager/bookmarks_export.json ../../x-bookmarks-review/bookmarks_db.json
```

Add `--remote` to load them into the real D1 database, and `--status read` to keep them out of the inbox.

## Put it online

Every push to `main` publishes the app: `.github/workflows/deploy.yml` applies new D1
migrations, then builds and deploys the Worker. It needs a `CLOUDFLARE_API_TOKEN`
repository secret (Edit Cloudflare Workers template, plus D1 Edit).

Worker secrets, set once with `npx wrangler secret put NAME`:

| Secret | What it is |
| --- | --- |
| `BETTER_AUTH_SECRET` | Long random string that signs sessions |
| `ALLOWED_EMAILS` | Who may create an account, comma separated. Unset means only the first account |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional. Shows "Continue with Google" |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_ID` | Optional. Shows "Continue with Apple" |

Google's redirect URL is `https://<your app>/api/auth/callback/google`, and Apple's is
`https://<your app>/api/auth/callback/apple`.

## Build order

1. Core app and adding by hand (this step)
2. Claude sorting and search
3. X and YouTube sync
4. iPhone app with share sheet and screenshots
5. Instagram, YouTube Watch Later, Feedly and Google Photos imports
6. Ask questions across the archive, weekly digest
