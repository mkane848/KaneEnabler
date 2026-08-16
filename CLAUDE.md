# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

`KaneEnabler` is the root of all Magic: The Gathering tooling in this account. It currently holds
two submodules awaiting consolidation into a pnpm/Turborepo monorepo:

- `HardlyKnowHer` — Commander recommender (React + Vite client, Express + SQLite server)
- `DrWhoCompanionEDH` — in-game counter companion for one specific Doctor Who deck

**Read [`docs/handoff.md`](./docs/handoff.md) first.** It is the execution brief for the
consolidation and everything that follows, and it explains decisions that are easy to unknowingly
reverse.

## Documents

| Document                                       | What it's for                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| [`docs/handoff.md`](./docs/handoff.md)         | The plan: target architecture, all seven phases, verification steps           |
| [`docs/rules-audit.md`](./docs/rules-audit.md) | Every Magic rules defect found in the incoming code, with file:line citations |
| [`docs/api-policy.md`](./docs/api-policy.md)   | **Hard rule.** External API limits and etiquette                              |

## Hard rules

1. **Respect external API limits.** Read [`docs/api-policy.md`](./docs/api-policy.md) before
   touching anything that makes a network call. **Any change to what we call, how often, or what
   triggers a call must be confirmed with the repo owner before implementation** — including changes
   that look incidental, like moving a lookup from a click handler into a route loader or a
   `useEffect`. The riskiest traffic changes don't look like network changes; they look like
   refactors.

2. **Magic rules go in `@mtg/rules`, once.** Every rules primitive cites the Comprehensive Rules
   number it implements and is tested against it. Don't re-derive colour identity, commander
   legality, or counter semantics in an app — if it isn't in the package yet, add it there.

3. **Don't assume the legacy logic is correct.** Both incoming projects cite CR numbers in comments,
   which makes them easier to audit, not automatically right. Several documented defects sit
   directly underneath a comment describing the correct rule. See
   [`docs/rules-audit.md`](./docs/rules-audit.md).

4. **Never write oracle text from memory.** Copy it out of the card database. Scryfall has moved
   much self-referential wording from card names to "this creature" / "this land", which silently
   broke two rules in the recommender that were written from recall.

## Conventions

Both incoming projects share these, and they should survive consolidation:

- **Comments explain _why_, not _what_.** They are rare and load-bearing. Match the existing tone;
  don't add narrating comments.
- **Semantic Versioning + [Keep a Changelog](https://keepachangelog.com/).** `package.json`'s
  `version` is the single source of truth.
- **A failing typecheck is a real error, not noise.** `strict`, `noUnusedLocals` and
  `noUnusedParameters` are on.
- **Tests before fixes** for anything in the rules audit.

## Environment notes

- The remote sandbox can reach `api.scryfall.com` only. `media.wizards.com`, `mtgjson.com` and
  `api.academyruins.com` are blocked by the egress proxy — the Comprehensive Rules ingestion script
  must run locally or in GitHub Actions and commit its output.
- Playwright and Chromium are pre-installed; do not run `playwright install`.
