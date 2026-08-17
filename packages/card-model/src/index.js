/**
 * Reading raw Scryfall bulk-data card fields correctly across every layout —
 * single-faced, transform, modal DFC, split, adventure, and flip.
 *
 * Plain .js with JSDoc types, not .ts, throughout this package — unlike
 * every other packages/*, this one is imported directly by
 * apps/time-counters/scripts/fetch-card-data.mjs, which runs under bare
 * `node` with no build step or TypeScript loader (same constraint documented
 * on apps/time-counters/src/utils/colorIdentity.mjs) — a .ts file simply
 * isn't loadable there. See this package's own tsconfig.json for how the
 * JSDoc types are still checked, and package.json for why this source tree
 * is consumed two different ways depending on the caller:
 *
 *   - fetch-card-data.mjs (bare node, ESM) and import-scryfall.ts (tsx, also
 *     ESM) both resolve the "import" condition straight to this source —
 *     already plain JS, so there is nothing to build for either.
 *   - commander-recommender/server has no "type": "module" in its own
 *     package.json, so tsx compiles import-scryfall.ts's `import` syntax
 *     down to a `require()` call at runtime — and a CommonJS `require()`
 *     cannot load this package's ESM source directly (a hard Node.js
 *     restriction, not a TypeScript one). The "require" condition instead
 *     points at a real CommonJS build (see tsconfig.build.json), the same
 *     shape `@mtg/rules` already needed for the same reason.
 *
 * This is deliberately a toolkit of small field readers, not one "normalize
 * everything" function returning a single wide Card shape. Each app's own
 * stored/wire card shape (server's CardRow, time-counters' CardData,
 * commander-recommender/client's CommanderCardDTO) is narrow for a real,
 * independent reason — SQLite storage format, client bundle size, wire-dedup
 * bandwidth — and forcing all three through one shared shape would fight
 * those constraints rather than respect them. What genuinely duplicated
 * across the two apps' Scryfall-import scripts was the *reading*, not the
 * *shape*: which face's mana cost/power/toughness to use, which face's
 * image to show, and which layouts are genuinely two-sided. That's what
 * this package owns.
 *
 * Commander eligibility's own front-face reading (type_line/oracle_text, CR
 * 712.4) is a Magic rule and lives in `@mtg/rules`' `frontFaceCharacteristics`
 * instead — this package doesn't duplicate it, and doesn't depend on
 * `@mtg/rules` either, since bare Node can't resolve that package's
 * .ts-pointing export from a script with no loader.
 */
export {
  backFaceName,
  backImageUri,
  frontFaceField,
  frontImageUri,
  isTwoSidedLayout,
} from './scryfallFields.js';
