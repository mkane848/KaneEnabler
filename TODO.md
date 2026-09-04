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

- [ ] Allowlist `api.academyruins.com` (and `media.wizards.com`) if you want CR ingestion
      (`docs/handoff.md` Phase 3a) to be runnable from a session rather than locally or in Actions.
      These two are the only remaining blockers for it.
- [ ] Optional, cosmetic: allowlist `cards.scryfall.io` so a session's screenshots show real card
      art instead of empty card frames.

**Gotcha for future sessions:** outbound traffic goes through an HTTPS CONNECT proxy
(`$HTTPS_PROXY`). `curl` and Node pick it up from the environment, but a browser launched by
Playwright does **not** — pass `proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }`
and `args: ['--ignore-certificate-errors']` (the proxy MITMs TLS). Without the bypass, requests to
a local dev server get swallowed by the proxy and the page renders as a proxy error. This is why
earlier sessions concluded the sandbox "can't reach Supabase" — it can; the browser just wasn't
using the proxy.

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

- [ ] Confirm the original `HardlyKnowHer` and `DrWhoCompanionEDH` GitHub repos got archived
      read-only with a README pointing here, per `docs/handoff.md` Phase 0's plan — they're outside
      this session's repo scope so it was never actually confirmed as done.
