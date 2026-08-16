# Handoff: Commander? I Hardly Know 'Er

A personal/hobby project (not work-related) — keep solutions simple and
maintainable for a solo developer. This document exists so a fresh agent
session (e.g. Claude Code) has full context without re-deriving decisions
already made in the design conversation. It has been updated across many
sessions since the project started — if something here looks inconsistent
with the actual code, the code wins; open an issue with the mismatch (or
just fix this file) rather than trusting a stale paragraph.

## What this is

A web app: upload a list of Magic: The Gathering cards, and it recommends
legal Commanders — including Partner/Background pairs, not just solo cards
— based on synergies found within that list. Every suggestion is checked
against the current Commander ban list and tagged with an estimated power
Bracket (1–5, per the Commander Format Rules Committee's Bracket System).
See `README.md` for the user-facing feature list; this file is the deeper
"why," aimed at whoever (human or agent) picks this codebase up next.

## Status at handoff — read this first

This is a working, previously-deployed app (`v1.0.0` was tagged, and
Partner/Background support plus several UX features have shipped since —
see `CHANGELOG.md`). It is not a fresh scaffold: `npm install`, real
Scryfall data, `npm run dev`, and a real decklist have all been run and
verified working, repeatedly, across many prior sessions. Don't assume the
opposite just because a *specific* environment happens to lack
`node_modules/` or network access at any given moment — that's a property
of the sandbox you're in right now, not of the project's maturity.

**What every session should still verify for itself**, since the exact
state of the environment you're in is never guaranteed: whether
dependencies are installed, whether `server/data/cards.sqlite` exists and is
seeded, and whether the app actually starts. `git status` and a quick
`ls server/data/` answer most of this in seconds.

### Getting oriented in a fresh session

1. `npm install` at the repo root, then `npm run install:all` (installs
   `server/` and `client/` separately). Watch for `better-sqlite3` failing to
   fetch/build its native binary — see "Known risk areas" below.
2. Get card data if `server/data/cards.sqlite` doesn't already exist:
   `cd server && npm run prepare-data` (fetches the current Scryfall Oracle
   Cards bulk file and imports it into SQLite). Needs network; takes a few
   minutes. If the sandbox has no network access to Scryfall, hand-build a
   small fixture database instead (see "Verifying without network access"
   below) rather than treating the feature as unverifiable.
3. `npm run dev` at the root. Confirm the server comes up on `:4000` and the
   client on `:5173`, and that `http://localhost:5173` loads.
4. Run `npm test` in both `server/` and `client/` — fast, dependency-free,
   and the first thing to catch a regression before you go looking by hand.
5. If you changed anything user-visible, paste a real decklist in (or your
   fixture DB's cards) and confirm you get back sane-looking suggestions —
   passing tests and a clean typecheck are necessary, not sufficient.

### Verifying without network access

Scryfall and Commander Spellbook are both frequently unreachable from a
sandboxed session (see "Known risk areas" for the exact symptom). That is
not a reason to skip verification — hand-build a small SQLite fixture
matching the `cards` table schema in `server/scripts/import-scryfall.ts`
(a handful of realistic rows covering whatever you're testing), point the
dev server at it, and hit `/api/recommend` / `/api/combos` directly with
`curl`, or drive the real UI with Playwright (pre-installed in this
environment — see the system prompt for how to launch it). This is how
Partner/Background pairing and the merge-reconciliation work in this file
were both verified when Scryfall wasn't reachable. Delete the fixture DB
and any throwaway scripts before finishing — `server/data/` should stay
empty (just `.gitkeep`) in the committed tree.

## Tech stack & why

All explicitly requested by the user unless noted:

- **Vite + React + TypeScript** (client)
- **MTG presentation conventions** live in `client/src/lib/mtg.ts`: colors are
  always shown in WUBRG order (never alphabetical, never raw data order), and
  a color identity is named — "Golgari", not "Black/Green" — because that's
  what players read. Symbols are the real mana glyphs, inlined as SVG paths in
  `lib/manaSymbols.ts` and drawn by `components/ManaSymbol.tsx`.
  These came from the `mana-font` package (MIT), but **the package itself is
  deliberately not a dependency**: its stylesheet offers no woff2, so a
  browser downloads a ~408KB `.woff` plus an unused body-text face to render
  six pips. Six inlined paths cost ~12KB of markup instead. Don't "simplify"
  this back to the font without re-checking that trade.

- **Radix UI** for interactive controls that need real keyboard and
  screen-reader behaviour — currently just `Dialog`, for the card-detail,
  card-image, and About popovers. TanStack has no equivalent — it ships
  data and interaction *logic*, not accessible UI primitives — so the two
  are used side by side rather than one instead of the other. The filter
  chips used to be a Radix `ToggleGroup`, but that only supports a
  single-select/multi-select model, not the three-state
  include/exclude/off cycle the filters now use — so they're plain
  `<button>`s with manual `aria-pressed`-equivalent state classes instead,
  and `@radix-ui/react-toggle-group` was dropped as a dependency.

- **Zustand + TanStack Query** for state, split by what the state *is*:
  Zustand (`client/src/store/useAppStore.ts`) holds client state only — the
  textarea contents and the list that was actually submitted — and is where a
  user session would go once there are accounts. Everything fetched lives in
  Query (`client/src/api/queries.ts`), which owns its caching and
  loading/error state. Recommendations are modelled as a *query* keyed on the
  submitted list, not a mutation: the POST is only because a deck list is too
  big for a query string, and nothing changes server-side. That keying is why
  the form and the results section can read the same data without passing
  anything between them.
  **The defaults in `main.tsx` are load-bearing.** Query retries failed
  queries three times and refetches on window focus out of the box; against
  Commander Spellbook that would mean more traffic than the hand-rolled
  version sent. `retry`, `refetchOnWindowFocus` and `refetchOnReconnect` are
  all off deliberately — don't restore them without thinking about who is
  being called.
- **Express + TypeScript + better-sqlite3** (server) — user chose this over
  a fully client-side/WASM-SQLite approach when offered the choice, wanting
  a more conventional setup with easier persistence.
- **CommonJS**, not ESM, on the server — avoids Node ESM's relative-import
  `.js`-extension requirement, which is unnecessary friction for a solo
  hobby project.
- **Scryfall bulk data**, not EDHREC — explicit user requirement ("do not
  scrape the EDHREC API"). Scryfall's official "Oracle Cards" JSON export
  already includes `legalities.commander` (legal/banned/not_legal) and a
  `game_changer` boolean per card, so the ban list and Game Changers list
  don't need to be hand-maintained anywhere in this codebase — just re-import
  periodically to stay current.

### A deliberate architectural point worth preserving

There are no user accounts and no saved uploads — recommendations are
computed fresh per request from whatever list is pasted in. That means the
SQLite database is effectively **static read-only reference data**, not
app state. This is why the Render deploy rebuilds it from scratch on every
deploy instead of using a persistent disk (see `DEPLOY.md`) — don't
"fix" that into a persistent-disk setup without remembering why it's this
way.

## File map

This map is meant to stay current — update it in the same commit whenever
you add or rename a file here, rather than letting it drift like it did for
most of this project's early history.

```
package.json          root convenience script (npm run dev via concurrently); canonical app version
render.yaml            Render Blueprint — provisions both services
README.md              setup + usage instructions for a human
DEPLOY.md              Render deployment walkthrough
CHANGELOG.md            Keep a Changelog + SemVer — bump this and the version together

client/                Vite + React + TS + Zustand + TanStack Query/Table
  vite.config.ts         dev-server proxy: /api -> localhost:4000; injects __APP_VERSION__
  .env.example            documents VITE_API_URL (blank in dev)
  src/
    main.tsx, App.tsx     entry point / page shell / navbar
    index.css              design system: parchment/ink palette, mana pips
    store/useAppStore.ts   client state only: rawList, submittedList, dismissed
    store/usePreferencesStore.ts  durable UI prefs (results-per-page), persisted to
                                   localStorage via zustand/middleware — deliberately a
                                   separate store from useAppStore, which is NOT persisted
                                   (dismissals surviving a browser restart against
                                   whatever list is pasted in next would be surprising;
                                   a page-size choice should outlive the tab)
    api/
      client.ts             fetchRecommendations/fetchCombos, wakeServer, cold-start retry
      queries.ts             TanStack Query hooks wrapping the above
    lib/
      mtg.ts                 WUBRG ordering, color-identity naming (Dimir, Golgari, ...)
      filters.ts              SuggestionFilters + matching logic (color/category/bracket/theme)
      sort.ts                 SortMode ('relevance' | 'colorNameValue'); compares a unit's
                               joined display name and summed mana value across its 1-2 cards
      suggestions.ts           "still has supporting cards after the identity filter" helpers
                               (visibleThemeSupport/visibleKindredSupport/visibleKeywordSupport)
                               shared by the card display and the filter bar's option lists
      manaSymbols.ts           inlined SVG path data for the 6 mana glyphs
    types/index.ts          DTOs mirroring the server's response shape — a suggestion is
                             `{ unitId, cards: CommanderCardDTO[], colorIdentity, ... }`, one-or-two
                             cards per unit, not a single flattened card
    components/
      CardListUpload.tsx        paste or upload .txt, submit; collapses after a load succeeds
      RecommendationResults.tsx  filter bar + sort + export controls + paginated suggestion grid
      ResultFilters.tsx          color/color-category/bracket/theme filter controls + sort dropdown
      CommanderCard.tsx          one suggestion: pips, one `CommanderFace` per card (1 or 2),
                                  "why" disclosure; art wrapped in CardImageDialog per face.
                                  Cited supporting cards get a hover-only art preview
                                  (`SupportingCardName`, @radix-ui/react-hover-card,
                                  portalled so `.support-cards`' own `overflow: hidden`
                                  can't clip it) alongside the existing click-to-open
                                  CardImageDialog — hover is additive for pointer devices;
                                  touch has no hover, but tapping already opens the full
                                  dialog, which is a better view on a small screen than a
                                  thumbnail your own finger would be covering anyway.
      CardDetailDialog.tsx        full rules-text modal for one card of a unit (art, mana cost,
                                   full text, Scryfall link); takes `card` + the unit's `bracket`
      CardImageDialog.tsx         whole-card art-only preview (no rules text) — separate from
                                   CardDetailDialog above; used for commander art and every
                                   cited supporting card's name
      ManaSymbol.tsx, ManaCost.tsx  render mana pips / a full cost string
      ComboFinder.tsx             click-to-run Commander Spellbook lookup inside a suggestion;
                                   takes `commanderNames: string[]` (1 or 2) for pair support.
                                   Ready-to-go/Almost-there each paginate independently
                                   (`ComboList`'s own `pageIndex` state) at
                                   usePreferencesStore's `combosPerPage`; the whole results
                                   block can be hidden after fetching without discarding
                                   the query (TanStack Query still has it cached — collapsing
                                   is a view-state toggle, not a re-fetch)
      AboutDialog.tsx             version, credits, repo link
  scripts/                 npm test — dependency-free node:assert + tsx, no framework
    fixtures.ts               makeSuggestion/makeCommanderCard/makeSupportingCard test builders
    test-mtg.ts                WUBRG ordering + color-identity naming cases
    test-suggestions.ts         "still has supporting cards" filter cases
    test-filters.ts             SuggestionFilters matching + availableFilterValues cases
    test-sort.ts                sort mode ordering cases, incl. Partner-pair name/mana-value ties

server/                Express + TS + better-sqlite3
  src/
    index.ts               app entry; CORS via optional CLIENT_ORIGIN env var
    db.ts                   SQLite connection; findCardsByNames (incl. DFC face-name fallback),
                             getCommanderCandidates, getBackgroundCards (legal legendary Backgrounds)
    types.ts                CardRow shape (mirrors the cards table), incl. partner_ability/
                             partner_target/is_background (rule 702.124)
    routes/
      recommend.ts            POST /api/recommend — returns every suggestion scoreCommanders
                               clears its own bar for, uncapped; no server-side slice. The
                               client owns pagination over the full set (RecommendationResults.tsx,
                               controlled TanStack Table pagination state driven by
                               usePreferencesStore's `suggestionsPerPage`), since it also needs
                               the whole thing for the filter bar's counts and option lists —
                               truncating server-side would make both of those lie.
      combos.ts                POST /api/combos — proxies to Commander Spellbook, on request only;
                                takes `commanderNames: string[]` (1-2) for a Partner unit
    services/
      parseList.ts            decklist text -> [{name, quantity}]; handles the major export formats
      singleton.ts             merges repeated cards and trims copies to what 903.5b allows,
                                before anything is scored
      partners.ts              builds every legal `CommanderUnit` (solo + Partner-family pairs)
                                from the candidate pool — see "Partner/Background" below
      synergy.ts               profile-building + commander scoring (the core logic), operating on
                                `CommanderUnit`s (1-2 cards), not single cards
      bracket.ts               Game-Changer-count -> Bracket estimate (still computed and
                                still on the API response, but its UI is hidden — see below)
      eligibility.ts           front-face-only commander eligibility (CR 712.4); the reason
                                Westvale Abbey is not a legal commander
      spellbook.ts             Commander Spellbook adapter: cache, backoff, response normalisation
  scripts/
    fetch-scryfall.ts        downloads current Oracle Cards bulk file (skips if a recent copy exists)
    import-scryfall.ts       parses that file into server/data/cards.sqlite + card_face_names;
                             also detects Partner-family abilities and Background enchantments
                             (rule 702.124) from oracle text, and stores each DFC's back-face
                             image/name for the art preview's flip control
    test-parse-list.ts        npm test — parser cases (node:assert via tsx)
    test-spellbook.ts          npm test — Spellbook adapter cases, against a local mock
    test-bracket.ts             npm test — Bracket-estimate cases
    test-partners.ts             npm test — every pairing variant + negative cases (rule 702.124)
    test-eligibility.ts           npm test — front-face rule for DFC/flip/adventure/split layouts
    test-singleton.ts             npm test — copy limits, exemptions, and repeated-line merging
    test-synergy.ts               npm test — profiling + scoring, incl. union-across-a-pair semantics
  data/                     gitignored; oracle-cards.jsonl + cards.sqlite live here
```

## Core logic, summarized (read the files for full detail)

- **`parseList.ts`** — regex-based parser. Handles bare names, `1 Sol Ring`,
  `1x`/`1 x` quantities, and strips whatever export metadata trails the name:
  `(SET) 263` and `[SET] 84` set codes (Moxfield/Arena/MTGO use parentheses,
  TCGplayer Mass Entry uses square brackets), `*F*`/`*CMDR*` markers,
  Archidekt `[Category]` tags and `^Label,#hex^` color labels, and
  spelled-out set names like `(Commander 2021)`. Because sites combine these
  in different orders, the stripping runs in a loop rather than as one
  anchored regex — that ordering assumption is what made the original version
  miss every Archidekt and TCGplayer line. Skips blank lines, `//`/`#`
  comments, zone headers and `Creature (12)` grouping headers.
  `npm test` (`scripts/test-parse-list.ts`, node:assert via tsx, no test
  framework) covers each format; run it if you touch this file.

- **`spellbook.ts` + `routes/combos.ts`** — Commander Spellbook lookup, used
  by the "Find combos" button inside a suggestion's expanded details. It runs
  **only on an explicit click** — never on page load, on a timer, or as part
  of a recommendation — and hits `find-my-combos`, the endpoint they built for
  this exact question, rather than crawling their whole database. Answers are
  cached in memory for an hour, keyed on commander + card set, so repeat
  clicks cost them nothing; a 429 is surfaced with their `Retry-After` and
  **not** retried. Keep those properties if you touch this: the polite
  behaviour is the reason it's acceptable to call them at all.
  **The live request/response contract is unverified.** Their API shape isn't
  in any public doc I could reach, so the adapter normalises defensively
  (`{card:{name}}`, `{card}` and plain strings all work) and
  `scripts/test-spellbook.ts` pins the behaviour against a local mock built
  from a best reading of their API. If real responses come back empty, the
  field mapping in `normalizeVariant` is the first thing to check.

- **`partners.ts`** — builds every legal `CommanderUnit` (rule 702.124: a
  commander as actually played, one card or two) from the eligible candidate
  pool: one solo unit per candidate, plus one pair per valid Partner,
  Partner—[text], Partner with [Name], Friends forever, Choose a Background,
  or Doctor's companion combination. A card with a partner ability still gets
  its own solo unit too — every variant is optional, so e.g. a Partner card
  is a perfectly legal commander by itself, and both the solo and every valid
  pairing show up as separate entries on the same ranked suggestion list
  (not a separate section, and not precomputed — this runs fresh per
  request). Pairing is grouped by ability variant rather than a blind
  cross-product over the whole pool (different variants never combine with
  each other per 702.124f), which keeps it cheap enough to run per request
  with an eligible pool in the tens to low hundreds. `Partner with [Name]` is
  checked for symmetric naming (each card must name the other, not just be
  named by it); Doctor's companion is checked for an *exact* {Time Lord,
  Doctor} creature-type set, not just "has those types among others."

- **`synergy.ts`** — the heart of the app.
  1. Builds a `CollectionProfile` from the matched cards: color-identity
     counts, creature-type counts, keyword counts (from Scryfall's
     `keywords` field — e.g. a Flying-heavy list), and counts against a set
     of hand-picked oracle-text theme regexes (sacrifice, graveyard,
     +1/+1 counters, tokens, artifacts, enchantments, planeswalkers,
     equipment, auras, spellslinger, lifegain, mill, death triggers,
     landfall, reanimation, doublers/multipliers). There is deliberately no
     standalone "card draw" theme — drawing cards isn't a synergy or an
     archetype on its own the way sacrifice or tokens are; almost every deck
     draws cards, so it added noise ("Themes: Card Draw" on nearly anything
     that could draw a card) rather than signal.

     `sacrifice`'s pattern requires an indefinite object right after the
     word — `/\bsacrifice (a|an|another|your|this|that|target|it|them|up to
     \w+|one|two|three|four|five|\d+)\b/i` — not a bare `/sacrifice/i`. A
     fetch land's own text reads "Sacrifice Arid Mesa: …": it sacrifices
     only itself, by its own proper name, as a cost for an unrelated effect.
     That is not the creature/permanent-sacrifice archetype even though the
     literal word appears, and a bare match was counting every fetch land
     in the format toward it.
  2. `ARCHETYPES` is a second layer on top of the theme list: a named label
     (Aristocrats, Voltron) for a *combination* of themes, applied when a
     candidate matches enough of the archetype's component theme keys.
     Spellslinger is **not** in this layer — it's just the existing
     `spellslinger` theme under its real name, since that already was the
     archetype under a blander label; adding a parallel archetype for it
     would just duplicate the same detection twice.
  3. Scores every `CommanderUnit` from `partners.ts` (not a single `CardRow`
     — see above): requires nonzero color-identity overlap AND at least one
     kindred/theme/keyword/archetype signal to even be considered. A signal
     counts only if at least `MIN_SIGNAL_COUNT` (3) *distinct* cards back it
     **after** narrowing to that unit's color identity. Every signal is
     unioned across both cards in a pair (`unitColorIdentity`/
     `unitKeywords`/`unitOracleText`) per rule 702.124e — a Partner pair
     matches anything either half of it would match solo, and its combined
     color identity is the union, not the intersection.

     **Kindred requires caring, not sharing** (`caresAboutCreatureType`).
     A creature type counts only if the unit's own oracle text names it —
     Krenko counts Goblins, Lathril taps Elves, The First Sliver gives
     Sliver spells cascade. Merely *having* the type does nothing, which is
     why Silas Renn no longer collects a "Human" tag off a list that happens
     to hold Humans. The commander need not have the type at all
     (Ghoulcaller Gisa is a Human Wizard Zombie commander), so this reads
     the text rather than the type line. `pluralOfType` handles the
     irregular plurals Magic actually uses — Elf/**Elves** matters, since
     Lathril's text never says "Elf". Note this is the one signal whose
     gate is per-unit text rather than a shared profile lookup, so the
     candidate type list is narrowed once outside the scoring loop.

     Each signal then scores its **density**: the share of the unit's
     castable pool (distinct cards fitting its identity) that backs it,
     times a per-kind weight — `kindred * 15 + theme * 10 + keyword * 8 +
     archetype * 20`. So a signal every playable card supports is worth its
     full weight; one that half of them support is worth half.

     Color identity decides *which cards are eligible* and contributes
     nothing to the score. It used to: an earlier formula opened with
     `coverageRatio * 50`, the largest term, which a five-color commander
     banked in full for free — it could out-rank a mono-color commander
     that matched the list twice as well, before synergy was even weighed.
     Reach is what lets a commander play your cards; it is not a reason to
     prefer one. See the two "scoring measures focus" cases in
     `test-synergy.ts`, which pin this down.
  - Partner-family keywords (Partner, Partner with, Friends forever, Choose
    a Background, Doctor's companion) are excluded from the shared-keyword
    signal on purpose — they mean something structural about who can be
    your commander, not a thematic pattern, and showing "Partner" as a
    generic shared-keyword tag would read as a confused echo of the
    dedicated Partner/Background handling in `partners.ts`, not a second,
    unrelated theme.
  - Every signal here requires the *candidate's own text* to match too, not
    just the profile. This is consistent but has a real cost for Voltron
    specifically: a commander that's a great Voltron target purely on
    stats (evasive, hard to remove) but whose own text never says
    "equip"/"enchant"/"Aura" won't be flagged. Documented in the archetype's
    own description string, not hidden.
  - This is intentionally a short, readable heuristic, not a combo/archetype
    *engine* — documented as a known limitation, not a bug to silently "fix"
    into something more complex without discussing it first.

- **`bracket.ts`** — Bracket estimate is based *only* on Game Changer count
  among matched cards + the suggested commander itself: 0 → "Bracket 1–2",
  1–3 → "Bracket 3", 4+ → "Bracket 4–5". Explicitly does not model combo
  speed, mass land destruction, or extra-turn density — the real Bracket
  system does, but that's not reliably detectable from card text. This
  caveat is surfaced in the UI copy; keep it there if this logic changes.

- **`eligibility.ts`** — commander eligibility, judged on a card's **front
  face only**. A double-faced card has only its front face's characteristics
  outside the battlefield (CR 712.4), and Scryfall's top-level `type_line`
  for one is the two faces joined ("Land // Legendary Creature — Demon").
  Reading that whole made Westvale Abbey look legal off the back face's
  "Legendary" and "Creature" — it is a plain non-legendary land in the
  command zone. Same reading fixes `flip` (Bushi Tenderfoot is not
  legendary, only its flipped side is) and `adventure`. `split` is the
  documented exception and stays joined: one face, both halves'
  characteristics in every zone (CR 709.4).

  Lives apart from `import-scryfall.ts`, its only caller, purely so it can
  be tested against real card shapes without running an import. **This is
  import-time**, so an existing `cards.sqlite` keeps the old flag until
  re-imported — deploys rebuild from scratch every time, so it self-heals
  there; locally, re-run `npm run import-scryfall`.

  Note this also narrows `creature_types` to the front face: a card in your
  library is its front face, so Delver of Secrets counts toward Wizards
  rather than the Insect its battlefield-only back side becomes.

- **`db.ts`** — `isSeeded` check so the API returns a helpful 503 instead
  of a raw SQL error if `npm run prepare-data` hasn't been run yet. Also
  the double-faced-card lookup: `findCardsByNames` tries the full card name
  first, then falls back to a `card_face_names` table (built in
  `import-scryfall.ts` for `transform`/`modal_dfc` layouts only) so a
  decklist naming just one face — "Fable of the Mirror-Breaker" rather than
  the full "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki" —
  still matches. That table is checked for existence before use (via the
  same `tableExists` helper `isSeeded` uses) so an old local database from
  before this existed degrades to exact-match-only instead of crashing the
  server on the first prepared statement.

## Known risk areas / things to verify

- **The role vocabulary in `signals.ts` is provisional and wants review.**
  `Role` is currently `is / produces / consumes / rewards / amplifies`. It
  replaced an earlier "Outlet / Payoff" split that was reported as *not
  quite right*, and the five roles are an inference drawn from worked
  examples rather than a model anyone has signed off on. The specific
  problem with Outlet/Payoff was that real cards almost never separate the
  two — Lathril's activated ability consumes ten Elves and rewards you in
  the same breath, and Viscera Seer is a sacrifice outlet whose entire
  point is the scry it hands back. Splitting `consumes` from `rewards`
  lets one ability be both, which Outlet/Payoff could not express.
  Cases known to still sit awkwardly:
  - **Goblin Sharpshooter** reads as `rewards` on creature-death (it untaps
    whenever a creature dies), but players describe it as a *sacrifice
    outlet*, because with any outlet it becomes a machine gun. It enables a
    loop it does not itself contain, and no current role captures
    "enables". If a sixth role is ever added, this is the case that
    justifies it.
  - **`is` is deliberately not wired into Aristocrats.** A vanilla creature
    genuinely is sacrifice fodder, but counting it would make every
    creature deck read as Aristocrats.
  - **Changelings** are every creature type by rule, but Scryfall's type
    line says `Creature — Shapeshifter`, so no type-based test will ever
    see one as a Goblin. Accepted, not special-cased.
- **Never write oracle text from memory — copy it out of the database.**
  Scryfall has switched much of its self-referential wording from the card's
  name to "this creature" / "this land". Two rules were written against
  recalled text and were wrong on real cards: Goblin Sharpshooter no longer
  says "Goblin" anywhere (so it is not, as first claimed, an instance of the
  name bug — Gitrog, Horror of Zhava is), and Arid Mesa reads "Sacrifice this
  land", not "Sacrifice Arid Mesa", which silently broke self-sacrifice
  detection and left it with no signals at all. Every string in
  `test-signals.ts` is now copied verbatim from the imported database. Keep
  it that way.
- **Scoring produces large ties.** A real 34-card Goblin list returned 1,504
  suggestions with ten commanders sharing a score of 46.60, because they all
  match the same three signals with the same supporting-card counts. Nothing
  distinguishes them. This is the strongest argument for the score floor
  above, and possibly for a tie-breaker (mana value? how *deeply* the
  commander engages, i.e. role count?).
- **Aristocrats is credited to any creature-token maker.** `produces:
  create ... creature token` means Krenko, Mob Boss reads as an Aristocrats
  card. Tokens genuinely are sacrifice fodder, so this is defensible, but it
  inflates: it fires on most go-wide cards. Worth revisiting if Aristocrats
  starts showing up on commanders that have nothing to do with it.
- **The density denominator is every identity-fitting card (choice A).**
  `scoreCommanders` divides a signal's supporting-card count by *all*
  distinct castable cards, lands included. The alternative considered and
  not taken (**choice B**) excludes lands from the denominator, on the
  reasoning that lands are infrastructure every deck needs in roughly equal
  measure rather than evidence that a commander fits your list — a Mountain
  says nothing about fit, whereas a vanilla Goblin genuinely does (it's a
  body a go-wide commander uses and a spellslinger doesn't). Choice A was
  kept deliberately, to be revisited once there's real testing to compare
  against. Note the change is smaller than it sounds: the depth bonus is a
  flat card count and unaffected by the denominator, so only the breadth
  term moves. If you switch, expect breadth to rise across the board and
  the score floor (below) to need recalibrating with it.
- **There is still no minimum score to be recommended.** A floor of ~5.0
  was proposed as a starting point — roughly "one signal with 8 or more
  real cards behind it" on a 100-card list — but deliberately not
  implemented, because the signal rework changes the score distribution and
  a floor calibrated against the old numbers would over-prune. Set it after
  running real lists.
- **`better-sqlite3` is a native module.** This bit us on the real Render
  deploy: v11 (the original pin) has no prebuilt binary for newer Node
  versions and falls back to compiling from source, which fails outright
  on Node 26 because its addon code calls a V8 API
  (`PropertyCallbackInfo::This()`) that Node 26's V8 removed. Fixed by
  upgrading to v13, which is built on `node-addon-api` (N-API) instead of
  raw V8 bindings — N-API is ABI-stable across Node versions, so it
  doesn't break on newer Node the way v11 did. `server/package.json`'s
  `engines.node` is now `>=22` to match v13's own requirement. If this
  breaks again on some future Node version, check whether it's the same
  class of issue before assuming it's something else.
- **Scryfall's API/bulk-data shape.** `fetch-scryfall.ts` and
  `import-scryfall.ts` assume a specific JSON shape (`data[].type ===
  'oracle_cards'`, `card.legalities.commander`, `card.game_changer`,
  `card.color_identity`, etc.) based on Scryfall's documented API as of
  this project's creation. Worth a quick sanity check against a live
  response if anything about the import looks off.
- **Scryfall requires `User-Agent` and `Accept` headers** on every request
  and answers HTTP 400 without them — this broke the first real deploy.
  The User-Agent has to name this app specifically; Scryfall flags the
  defaults HTTP libraries send (Node's built-in `fetch` included) as junk
  traffic. `fetch-scryfall.ts` sets both. Don't drop them, and if you add
  new Scryfall calls anywhere, send them there too.
- **`render.yaml`'s `fromService`/`property: host` syntax** for wiring the
  client's `VITE_API_URL` to the server's URL was written from Render's
  Blueprint docs. If the Blueprint fails to sync on a fresh deploy, this is
  the first thing to check.
- **Card name matching is exact (case-insensitive) only** — no fuzzy
  matching. Double-faced cards are the one exception: they match by either
  face's name alone (see `card_face_names` in the Core logic section above),
  not just the full combined name. Anything else — typos, alternate
  shorthand names — comes back in the "not found" list. Real decklists will
  likely have some near-misses; worth seeing how bad this is in practice
  before deciding whether a fuzzy-match fallback is worth adding.
- **The compiled build must keep `src/` as its root.** `db.ts` finds the
  card database with `path.join(__dirname, '..', 'data')`, which only
  lands on `server/data` if the compiled `db.js` sits one level under
  `server/` (i.e. `dist/db.js`). This is why the build runs against
  `tsconfig.build.json` (`rootDir: "src"`, `src/` only) rather than the
  root `tsconfig.json`, which type-checks `scripts/` too and would root
  the output a level higher (`dist/src/db.js`). That nesting broke the
  first working deploy in a nasty way: the server started fine and
  `/api/health` passed, but `db.ts` created an empty database at
  `dist/data/` that nothing ever seeds, so every recommendation returned
  the "database is empty" 503. If you change the build layout, start the
  compiled server and actually POST a list — a passing health check
  proves nothing here.

## Deployment

`render.yaml` + `DEPLOY.md` set up a free two-service deploy on Render
(static frontend + Node backend), with the backend rebuilding its SQLite
data from Scryfall on every deploy rather than using a persistent disk. See
`DEPLOY.md` for the walkthrough and "Known risk areas" above for the
specific failure modes that have bitten a deploy before.

## Releasing (tagging + GitHub Releases)

Cutting a release is still a deliberate, manual decision — bump the version
in all three `package.json` files (root, `server/`, `client/`), move
`CHANGELOG.md`'s `[Unreleased]` entries under a new `## [x.y.z] — date`
heading, and get that merged to `main`. What's automated is only the
mechanical last step: `.github/workflows/release.yml` runs on every push to
`main` and checks whether the root `package.json`'s version already has a
matching `vX.Y.Z` git tag. If not, it extracts that version's section from
`CHANGELOG.md` and creates the tag + a GitHub Release from it, via `gh
release create` using the workflow's own `GITHUB_TOKEN` — not this
session's git credentials, which are sandboxed and cannot push tags
directly (`git push origin <tag>` gets a 403 from the local git proxy; this
is why the workflow exists instead of a plain `git tag && git push`).

Ordinary PRs that don't touch the version are a no-op here — nothing
releases unless someone deliberately bumped `package.json`. This preserves
the "batch several PRs into one release if you want" flexibility discussed
when this was set up, while still turning "merge the version-bump commit"
into "the release exists," with no separate manual tagging step.

## Explicit non-goals for v1 (don't scope-creep these back in without asking)

- No user accounts, saved lists, or deck history
- No fuzzy/typo-tolerant card name matching
- No combo detection for Bracket estimation
- No EDHREC data pulled yet — see "Pending decisions" below. A
  **non-functional** "EDHRec" placeholder button sits next to "Find combos"
  in `ComboFinder.tsx`; it fetches nothing and is `disabled`. The original
  "no EDHREC data of any kind" instruction has been clarified, not
  rescinded: the user wants to wait until this can be done responsibly, not
  ruled it out in principle.

## Pending decisions — proposed, not implemented

- **EDHREC integration.** Still not built — the placeholder button above is
  the only trace of this in the codebase. The user's current lean (as of
  the conversation that added the placeholder): a one-time, click-triggered
  lookup per commander, the same shape as the existing Commander Spellbook
  "Find combos" flow, rather than anything that runs automatically or scrapes
  in bulk. Don't wire up the button or add any EDHREC network call without
  the user confirming the approach first — the same politeness/caching
  discipline documented for `spellbook.ts` above should apply here once it's
  built (identifying User-Agent, cache repeat lookups, respect rate limits).

## Partner / Background support (rule 702.124)

Implemented: a commander suggestion with a Partner-family ability generates
both a solo entry and one entry per valid pairing, unified on the same
ranked list (see `partners.ts` and `synergy.ts` above). Covers all six
variants: Partner, Partner—[text] (grouped by suffix), Partner with [Name]
(symmetric name check), Friends forever, Choose a Background (paired against
every legal legendary Background), and Doctor's companion (paired against
an exact {Time Lord, Doctor} creature-type set). `CommanderSuggestion.cards`
is `CardRow[]` (length 1 or 2); the API's `CommanderSuggestionDTO.cards` is
`CommanderCardDTO[]` with a top-level `unitId` (both oracle ids, sorted and
joined — see `unitKey()`) used as the dismiss/row key instead of a single
card's own id. `/api/combos` takes `commanderNames: string[]` (1-2) so a
Spellbook lookup can be run against a pair. There is no "Partner" badge in
the UI by design — Partner-family keywords stay excluded from the generic
shared-keyword signal (see `synergy.ts`'s `EXCLUDED_KEYWORDS` note) rather
than surfaced as a tag, since the pairing itself is the feature.
Unverified against real Scryfall data — this environment has no network
access to Scryfall, so the detection regexes and pairing logic were
validated against hand-authored fixtures modeled on real card templating,
not the live bulk file. Worth a spot-check against a handful of real
Partner/Background cards (e.g. Tymna the Weaver, Kraum Ludevic's Opus,
Tiana Ship's Caretaker + a real Background) after the next `prepare-data`
run.

## Merged with `main`'s independent Partner/Background work

While this branch built the above, a separate PR (`main`, PR #2, commit
`7997147`) independently built the *same* feature with a different design:
single-card suggestions carrying a `pairing` field plus a `partnerOptions[]`
list you choose a second commander from, computed by `detectPairing`/
`canPair`/`buildPartnerOptions` in its own `partners.ts`/`synergy.ts`. Both
landed on their respective branches at the same time, then had to be
reconciled in one merge. The user chose to keep **this branch's** design
(precomputed pairs, each its own ranked suggestion) over main's
(pick-a-partner-after-the-fact) — if that decision ever needs revisiting,
main's approach is still recoverable from its own git history.

main also carried real, independent work unrelated to Partner/Background,
which was carried forward on top of the kept design:
- **Art preview** — `CardImageDialog.tsx` (whole-card image popover,
  separate from the rules-text `CardDetailDialog`), wired onto commander
  art and every supporting-card name. `SupportingCard`/`SupportingCardDTO`
  and `CommanderCardDTO` gained `imageUri`/`scryfallUri`/`manaValue` fields
  for this.
- **Sort mode** — `lib/sort.ts` ("Best match" vs "Colors, name, mana
  value"), adapted from main's single-card version to compare a unit's
  joined display name and summed mana value across 1-2 cards.
- **Export** — "Copy list" / "Download .txt" in `RecommendationResults.tsx`.
- **Mobile layout** — `viewport-fit=cover` + the `env(safe-area-inset-*)`
  padding in `index.css`, so content clears notches/home-indicator/URL bar.
- **"Still has supporting cards" fix** — `lib/suggestions.ts`
  (`visibleThemeSupport`/`visibleKindredSupport`, extended here with a
  `visibleKeywordSupport` for the keyword category main didn't have): a
  theme/kindred type/keyword matched against the collection *globally* can end up
  with zero cards once narrowed to a specific commander's color identity;
  this filters those out of both the card display and the filter bar's
  available options instead of showing/offering an empty reason. This was
  a real latent bug in this branch's original synergy.ts too, not something
  specific to main's design.
- **Regression test suite** — main added `client/scripts/test-*.ts` +
  `server/scripts/test-bracket.ts`, dependency-free (node:assert + tsx,
  matching this project's existing test convention). Kept: `test-mtg.ts`,
  `test-bracket.ts` (untouched by either side's Partner work, ported as-is);
  adapted to this branch's DTO/filter shape: `fixtures.ts`,
  `test-suggestions.ts`, `test-sort.ts`, `test-filters.ts` (rewritten
  against this branch's simple array-based `SuggestionFilters`, not main's
  include/exclude `FilterSelection` model — see below). **Deleted**:
  `test-partners.ts`, `test-synergy.ts` — these tested main's discarded
  `detectPairing`/`canPair`/`buildPartnerOptions` API, which no longer
  exists. (This branch's own `partners.ts`/`synergy.ts` gained real test
  coverage in a later round — `server/scripts/test-partners.ts` and
  `test-synergy.ts` — written against this branch's actual API, not a port
  of main's.)

**Deliberately not adopted**: main also rewrote the filter bar from a
multi-select "must include" model to a three-state include/exclude-per-value
model (`FilterMode`, `cycleSelection`, `modeOf` in its `lib/filters.ts`,
click-to-cycle chips in `ResultFilters.tsx`). That's a real, independent
filter-UX upgrade, but it wasn't part of what was asked to be carried
forward (sort/export/art-preview/mobile-layout/tests were) and swapping the
whole filtering paradigm felt like a bigger call to make unilaterally mid-
merge. This branch kept its original simple filter model (colors + a
colorless/multicolor category toggle + brackets + themes, all "must
include", via Radix `ToggleGroup`) and only added the sort control to it.
If the include/exclude model is wanted later, it's sitting in main's git
history (`lib/filters.ts`, `ResultFilters.tsx`) ready to port over.
