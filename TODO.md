# Manual TODO

Things that need a human (dashboard access, credentials, or judgment I don't have) — not tracked
elsewhere. Delete items as you do them.

## Render

- [ ] **Retire the three superseded static sites** now that `kaneenabler-platform` is live and
      verified: `kaneenabler-home`, `mtg-recommender-client`, `drwho-companion-edh`. There's no
      Render API to delete a service, so this is dashboard-only. Do this *before* removing their
      entries from `render.yaml` (see that file's top comment) — otherwise Render just leaves them
      running unmanaged.
- [ ] Once retired, remove their service blocks from `render.yaml` (root) so the blueprint matches
      reality again.

## Sandbox egress (optional, makes future sessions more self-sufficient)

- [ ] Allowlist `*.onrender.com` — lets a session verify a live deploy directly instead of only
      building+serving+screenshotting a local copy as a proxy for the real thing.
- [ ] Allowlist your Supabase project (`ctkrhgvboeohmijcpiji.supabase.co`) — lets a session actually
      exercise the sign-in flow against real Supabase instead of only code-reviewing it. Heads up:
      this means test signups write real rows to your `auth.users`/`card_preferences`/
      `combo_preferences` tables (throwaway accounts, but real data).
- [ ] If you want CR (Comprehensive Rules) ingestion (`docs/handoff.md` Phase 3a) ever run from a
      session instead of locally: `academyruins.com`, `magic.wizards.com`, and `mtgjson.com` are all
      currently blocked too.

## Verification only a real browser/human can do

- [ ] **Sign up → confirm → sign in → like/tag/favourite**, end to end, in a real browser against
      production. RLS itself is verified (`docs/handoff.md` Phase 7), but the actual signed-in
      browser flow has never been exercised — the sandbox can't reach Supabase to do it.
- [ ] Favourite a combo, then reload the recommender profile with the network blocked (devtools
      offline mode) — it should render from the stored `snapshot` with zero Spellbook requests. No
      profile-browsing view exists yet to make this easy to trigger (see `docs/handoff.md`
      Verification item 6).

## Repo housekeeping

- [ ] Confirm the original `HardlyKnowHer` and `DrWhoCompanionEDH` GitHub repos got archived
      read-only with a README pointing here, per `docs/handoff.md` Phase 0's plan — they're outside
      this session's repo scope so it was never actually confirmed as done.
