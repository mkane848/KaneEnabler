# Contributing

Thanks for taking a look at this project. It started as a solo hobby
project, so there's no heavyweight process — just a few conventions that
keep it consistent.

## Setup

See the [README](./README.md#setup) for install/run/test instructions. In
short:

```bash
npm install && npm run install:all
cd server && npm run prepare-data   # downloads real Scryfall card data
npm run dev                          # from the repo root
```

If you don't have network access to Scryfall (or Commander Spellbook) in
your environment, `handoff.md`'s "Verifying without network access" section
describes how to hand-build a small fixture SQLite database instead of
skipping verification.

## Before opening a PR

- **Typecheck and test both packages**: `npm run build`/`npm test` in
  `server/` and `client/` (or `tsc --noEmit`/`tsc -b` if you just want the
  type check). Both test suites are dependency-free (`node:assert` + `tsx`,
  no framework) and run in a few seconds — there's no reason to skip them.
- **Actually run the app** for anything user-visible. A clean typecheck and
  passing tests are necessary, not sufficient — they don't catch things
  like a CSS rule that silently stopped applying (this has happened before
  in this repo; see `CHANGELOG.md`).
- **Add a `CHANGELOG.md` entry** under `[Unreleased]` for any user-facing
  change, in the same style as the existing entries.
- **Keep `handoff.md`'s file map current** if you add, rename, or remove a
  file it lists — it's meant to stay accurate, not drift like it did once
  before.

## Code conventions

- No unnecessary comments. A comment should explain a non-obvious *why*
  (a hidden constraint, a workaround for a specific bug, something that
  would surprise a reader) — not restate what the code already says.
- Keep changes proportional to the ask. This codebase deliberately favors a
  short, readable heuristic over a more "complete" system in a few places
  (synergy detection, Bracket estimation) — see `handoff.md`'s "Core logic"
  section for why, before trying to make one of those more sophisticated.
- Match the existing pattern for whichever file you're touching rather than
  introducing a new one nearby. If the surrounding code uses a plain
  function and a Set, don't reach for a class or a new dependency to do the
  same job.

## Reporting bugs / requesting features

Open an issue. There are templates for both — fill in what applies, skip
what doesn't.

## Questions about a specific design decision

`handoff.md` is the deeper "why" behind most of the non-obvious choices in
this codebase (why Zustand *and* TanStack Query, why the SQLite database is
rebuilt on every deploy instead of persisted, why Commander Spellbook is
only ever called on an explicit click, and so on). Check there before
assuming something is accidental.
