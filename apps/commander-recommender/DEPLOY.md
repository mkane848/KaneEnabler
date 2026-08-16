# Deploying to Render (free)

This repo includes a `render.yaml` Blueprint that provisions both services —
the Express API and the static frontend — in one go.

## Steps

1. Push this repo to GitHub (Render deploys from a Git repo, not a local
   folder).
2. In the [Render dashboard](https://dashboard.render.com), click **New** →
   **Blueprint**.
3. Connect the repo. Render will detect `render.yaml` and show you both
   services (`mtg-recommender-server` and `mtg-recommender-client`).
4. Click **Apply**. Render creates and deploys both services.

That's it — no manual env var entry needed. The client's build step pulls
the server's URL automatically.

## What happens on first deploy

- The server's build command downloads the current Scryfall Oracle Cards
  file and seeds SQLite from it, then compiles TypeScript. This takes a few
  minutes (~100–150MB download + ~30k rows to insert) — expect the first
  deploy to be slower than a typical Node app.
- The client build reads the server's assigned hostname and bakes it in as
  `VITE_API_URL`.
- The client's About dialog shows a "Updated" timestamp taken from `git log
  -1` on the commit the build ran against — Render always builds from a
  fresh checkout of what was just pushed, so this lands within seconds of
  the real deploy with nothing to hand-maintain. If you ever build from a
  source tarball with no `.git` directory, this silently falls back to the
  literal build time instead of failing.

## Good to know

- **Cold starts:** the server (`mtg-recommender-server`) is a free compute
  instance and spins down after 15 minutes of inactivity — the first request
  after a lull takes 30–60 seconds while it wakes back up. The client is a
  static site served from Render's CDN, so it has no compute instance and
  no cold start. Fine for a personal project; upgrade the server to a paid
  instance type later if the wake-up delay ever bothers you.
- **Data freshness:** the card database is rebuilt from scratch on every
  deploy (see `README.md` for why this is fine — it's read-only reference
  data, not something that needs to persist). Redeploy manually from the
  Render dashboard whenever you want to pick up a ban list or Game Changers
  update; you don't need to do this often.
- **Locking down CORS:** by default the API accepts requests from any
  origin, which is fine since there's no auth or private data involved. If
  you'd rather restrict it, add a `CLIENT_ORIGIN` environment variable to
  the `mtg-recommender-server` service in the Render dashboard, set to your
  client's URL (e.g. `https://mtg-recommender-client.onrender.com`).
- **Renaming services:** if you rename either service in `render.yaml`, the
  `fromService` reference for `SERVER_HOST` must use the server's new name
  too, or the client build won't find it.
