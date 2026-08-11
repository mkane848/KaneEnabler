# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

A single-page Commander companion app for a Jeskai (W/U/R) "Doctor Who"
deck built around **The Tenth Doctor // Rose Tyler** as partner commanders.
No backend — card data is a static JSON file built at build time from
Scryfall's bulk data, and all game state lives in the browser's
`localStorage`. React 19 + TypeScript + Vite, CSS Modules for styling, no
component library, no test framework configured.

Read `README.md` first — it documents the product behavior (Next Turn vs.
Time Travel, themes, counter mechanics, project layout table) in more
depth than this file repeats. This file is about how to work in the code,
not what the code does.

## Commands

- `npm run dev` — local dev server (runs `ensure-catalog` first, which
  seeds `public/cards.json` from `scripts/seed-cards.json` if it's missing)
- `npm run build` — `tsc -b && vite build`; treat a failing typecheck as a
  real error, not noise — `strict`, `noUnusedLocals`, and
  `noUnusedParameters` are all on in `tsconfig.json`
- `npm run fetch-cards` — rebuilds the real card catalog from Scryfall
  (network access required; not available in this environment — see
  README's "About the decklist scan")
- No test suite or linter is configured. Verify changes by running
  `npm run build` (typecheck) and exercising the UI in a browser.

## Architecture

- `src/types.ts` — shared types; the source of truth for the data model.
  `Mechanic` is `'suspend' | 'vanishing' | 'fading' | 'saga' | 'custom'`.
  `GameState.commanders` holds per-commander state (command-zone cast
  count/tax, Rose Tyler's own Bad Wolf time counters) that doesn't belong
  on the tracked-cards board.
- `src/hooks/useGameState.ts` — all game-state mutation logic (add/remove
  cards, manual count edits, Next Turn, Time Travel, commander tax/Bad
  Wolf actions, the game log). Every mutation derives its next value from
  `prev` inside `setTracker`, never from a render-time snapshot — preserve
  that pattern for any new mutation, since it's what keeps rapid taps from
  clobbering each other.
  - `nextTurn()` runs two ordered steps as one atomic update: **upkeep**
    (Suspend/Vanishing/Fading count down) then **precombat main** (Sagas
    gain a lore counter, firing any chapter ability newly reached). Each
    `TurnChange` carries a `step` so the UI can group by when it happened.
  - `applyTimeTravel()` only accepts Suspend/Vanishing cards and,
    conditionally, Rose Tyler's own counters (`id: 'rose'`) — never
    Fading or Saga, since neither uses time counters.
- `src/utils/counters.ts` — oracle-text detection for Suspend/Vanishing/
  Fading, plus display labels/colors/resolve text per mechanic, and the
  rules-distinction helpers below. Sagas aren't oracle-text-detected —
  chapter text is entered by hand in `AddCardPanel`.
  - **`usesTimeCounters(mechanic)`** — true only for Suspend/Vanishing.
    **Fading uses fade counters** (rule 702.32) and **Saga uses lore
    counters** — neither is a time counter, even though all four are
    tracked through the same `count`/`direction` fields for UI
    simplicity. Anything that models the *time counter* keyword action
    (Time Travel) or Rose Tyler's Bad Wolf trigger must go through this
    helper rather than assuming "tracked mechanic" == "time counter."
  - **`turnStepForMechanic(mechanic)`** — which Next Turn step
    auto-adjusts this mechanic (`'upkeep'` for Suspend/Vanishing/Fading,
    `'precombatMain'` for Saga).
  - **`newlyTriggeredChapters()`** — given a Saga's chapter texts and an
    old/new lore count, returns the chapter(s) that just triggered. A
    chapter ability fires the instant its number is reached, not only at
    the final chapter (that's the "Saga going off before it's ready" bug
    class — always trigger per-chapter, never just check the final target).
- `src/components/` — one file + co-located `.module.css` per component;
  no shared component library, styling is local CSS Modules reading
  theme values from CSS custom properties (`--color-*`, `--font-*`, set by
  `data-theme` on `<html>`)
  - `CommanderTaxModal.tsx` — opened by tapping a commander portrait/name
    in `CommanderBanner.tsx`; commander tax for both, plus Rose Tyler's
    Bad Wolf section and The Tenth Doctor's Timey-Wimey → Time Travel
    shortcut (`initialPasses={3}` on `TimeTravelPanel`).
- `src/utils/storage.ts` / `src/utils/theme.ts` — the only two
  `localStorage` touchpoints (game state, theme preference respectively).
  `storage.ts` default-fills `commanders` for saves from before that field
  existed — extend that migration pattern for any future `GameState` field.

## Conventions

- Comments are rare and explain *why*, not *what* — see existing files for
  the tone (e.g. `useGameState.ts`'s doc comments on `nextTurn` and
  `applyTimeTravel` explain the rules distinction between the two, not
  just what the function does). Match that style; don't add narrating
  comments.
- This app models real Magic rules, not just arbitrary product features —
  when adding or changing a mechanic, check the actual Comprehensive
  Rules wording (or a reliable secondary source) rather than guessing.
  Getting a keyword's timing or trigger condition wrong is a bug here,
  not just a style nit.
- The turn model is intentionally **single-player-centric**: this is a
  Commander (multiplayer) app, but it only tracks *this player's* turn
  number and the phases/steps that matter for the effects this deck
  cares about (upkeep triggers, precombat main for Sagas, etc.), not a
  full multi-player turn order.
- Keep `README.md`'s "Project layout" table and "Counter mechanics"
  section in sync with any structural or rules-model changes.
- Bump `CHANGELOG.md` (Keep a Changelog format, semver) and the version
  shown in `AboutModal.tsx` for user-visible feature work, matching how
  `1.0.0` was recorded.

## Confirmed rules facts (as of the turn-cycle/commander-tax feature)

Verified via web search against the Comprehensive Rules and reliable
secondary sources — reuse rather than re-deriving:

- Turn structure (CR 500–514): Beginning (Untap, Upkeep, Draw), Precombat
  Main, Combat (Begin Combat, Declare Attackers, Declare Blockers, Combat
  Damage, End Combat), Postcombat Main, Ending (End, Cleanup).
- Suspend/Vanishing trigger at upkeep, using time counters. Fading also
  triggers at upkeep but uses fade counters (rule 702.32) — not a time
  counter.
- Sagas: a lore counter is added as precombat main begins (a turn-based
  action, no stack). Each chapter ability triggers the instant the lore
  count reaches that number — not just at the final chapter. The Saga
  sacrifices after its final chapter ability fully resolves.
- Commander tax (rule 903.10): +{2} per previous cast of *that specific
  commander* from the command zone this game, tracked independently per
  commander, for the whole game (doesn't reset on zone changes).
- The Tenth Doctor: *"Allons-y — Whenever you attack, exile cards from the
  top of your library until you exile a nonland card, put three time
  counters on it, gains suspend if it doesn't have it."* Timey-Wimey:
  *"{7}: Time travel three times. Activate only as a sorcery."*
- Rose Tyler: *"gets +1/+1 for each time counter on it."* Bad Wolf:
  *"Whenever Rose Tyler attacks, put a time counter on it for each
  suspended card you own and each other permanent you control with a time
  counter on it."*

## Working with the user

This repo's owner plays this exact deck. When implementing new mechanics,
confirm the precise rules text/timing before writing logic — prefer
surfacing an open rules question over guessing silently, since a wrong
guess here means the app gives incorrect in-game advice at the table.
