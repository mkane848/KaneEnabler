# Manual TODO

Things that need a human (dashboard access, credentials, or judgment I don't have) — not tracked
elsewhere. Delete items as you do them.

## Render

- [x] **Retire the three superseded static sites** now that `kaneenabler-platform` is live and
      verified: `kaneenabler-home`, `mtg-recommender-client`, `drwho-companion-edh`. There's no
      Render API to delete a service, so this is dashboard-only. Do this _before_ removing their
      entries from `render.yaml` (see that file's top comment) — otherwise Render just leaves them
      running unmanaged.
- [x] Once retired, remove their service blocks from `render.yaml` (root) so the blueprint matches
      reality again.

- [ ] **Switch on the shared Spellbook cache** (W9). The code ships switched off until:
  1. `supabase/migrations/20261127000000_spellbook_cache.sql` is applied to the production
     Supabase project (a session can do this with the Supabase connector once you OK it);
  2. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set on the `mtg-recommender-server` Render
     service (dashboard → Environment). The service-role key is a secret: never commit it.

## Sandbox egress

**Re-tested 2026-09-04 — most of what used to be blocked now works.** The three items that were
listed here as things to allowlist are all reachable, so they've been struck. What a session can
and can't reach, measured rather than assumed:

| Host                               | State       | Notes                                                                                                                                          |
| ---------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.scryfall.com`                 | OK          | Bulk data + the API; `prepare-data` runs end to end                                                                                            |
| `ctkrhgvboeohmijcpiji.supabase.co` | OK          | Returns 401 without a key, i.e. reachable                                                                                                      |
| `*.onrender.com`                   | OK          | A session can hit the live deploy directly                                                                                                     |
| `fonts.googleapis.com` / `gstatic` | OK          | But see the Chromium note below                                                                                                                |
| `magic.wizards.com`                | OK          |                                                                                                                                                |
| `mtgjson.com`                      | OK          |                                                                                                                                                |
| `cards.scryfall.io`                | **Blocked** | 403 at the egress gateway. Card _images_ — so browser screenshots render card frames with no art. Cosmetic only; nothing in the build needs it |
| `api.academyruins.com`             | **Blocked** | Still the blocker for Phase 3a CR ingestion                                                                                                    |
| `media.wizards.com`                | **Blocked** |                                                                                                                                                |
| `raw.githubusercontent.com`        | OK          | Read the TCGdex and Pokémon TCG data READMEs (2026-11-27)                                                                                      |
| GitHub `git clone` (public)        | OK          | Served by the session's git proxy; `pokemon-decks`' `build-snapshot` clones TCGdex this way                                                    |
| `www.pokemon.com`                  | OK          | Allowlisted 2026-11-27 for Pokémon rule text; rejects `HEAD`, so test with `GET`                                                               |
| `gymleaderchallenge.com`           | OK          | Allowlisted 2026-11-27 for GLC rules and ban list                                                                                              |
| `tcgdex.dev` / `api.tcgdex.net`    | OK          | Allowlisted 2026-11-27; docs only — the app never calls the API (docs/api-policy.md)                                                           |

- [ ] Allowlist `api.academyruins.com` (and `media.wizards.com`) if you want CR ingestion
      (`docs/handoff.md` Phase 3a) to be runnable from a session rather than locally or in Actions.
      These two are the only remaining blockers for it. **Measured 2026-11-25 from the owner's
      local Windows machine: all three "blocked" hosts respond normally** (400/404/404 at their
      roots — real server responses, not egress blocks), so the block is sandbox-specific and CR
      ingestion can run locally without any allowlist change. **Phase 3a shipped 2026-11-25**
      (`packages/rules/scripts/ingest-cr.mjs` + `cr-refresh.yml`), so these allowlist items now
      only matter if a sandbox session itself needs to re-ingest the CR.
- [ ] Optional, cosmetic: allowlist `cards.scryfall.io` so a session's screenshots show real card
      art instead of empty card frames.

**Gotcha for future sessions:** outbound traffic goes through an HTTPS CONNECT proxy
(`$HTTPS_PROXY`). `curl` and Node pick it up from the environment, but a browser launched by
Playwright does **not** — pass `proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }`
and `args: ['--ignore-certificate-errors']` (the proxy MITMs TLS), **and** run the script with
`PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK=1` in the environment. That variable is the
part that's easy to miss: Playwright appends `<-loopback>` to Chromium's bypass list, which sends
`localhost` _through_ the proxy whatever `bypass` says (re-verified 2026-09-25 on Playwright
1.56.1). Without both, requests to a local dev server get swallowed by the proxy and the page
renders as "agent-proxy relay: this proxy only accepts HTTPS CONNECT tunnels". This is why earlier
sessions concluded the sandbox "can't reach Supabase" — it can; the browser just wasn't using the
proxy.

## Verification only a real browser/human can do

- [ ] **Sign up → confirm → sign in → like/tag/favourite**, end to end, in a real browser against
      production, with a real account. RLS itself is verified (`docs/handoff.md` Phase 7).
      Narrowed 2026-09-04: the signed-in _UI_ has now been exercised in a real browser (the
      `/profile` lenses and the recommender's dislike-hides-a-commander control), but with the
      Supabase session and REST responses stubbed at the network layer, deliberately, so no rows
      were written to your `auth.users`. What remains unverified is specifically **real Supabase
      auth** — signup, the confirmation email, token refresh — and RLS as enforced on a live
      session rather than in impersonated-role SQL.
- [ ] Favourite a combo, then reload `apps/home`'s `/profile` page with the network blocked
      (devtools offline mode) — it should render the combo from the stored `snapshot` with zero
      Spellbook requests (see `docs/handoff.md` Phase 8, Verification item 6).

## Repo housekeeping

- [x] Confirm the original `HardlyKnowHer` and `DrWhoCompanionEDH` GitHub repos got archived
      read-only with a README pointing here, per `docs/handoff.md` Phase 0's plan — **done
      2026-11-25**: both were still live, so each got an archive notice prepended to its README
      (pointing at `apps/commander-recommender` / `apps/time-counters` here) and was then archived
      via `gh repo archive`; `isArchived: true` confirmed for both.
