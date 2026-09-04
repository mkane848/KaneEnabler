# Recommender controls onto the shared `.mtg-btn` / `.mtg-input` primitives

**Status:** approved, not started. This is an execution brief — a fresh session should be able to
work from it without re-deriving the analysis.
**Scope:** `packages/ui/src/theme.css` (two additions), `apps/commander-recommender/client` (eight
controls + comments), plus a screenshot-verified appearance change to `apps/time-counters`.

Read [`../CLAUDE.md`](../CLAUDE.md) and
[`../apps/commander-recommender/CLAUDE.md`](../apps/commander-recommender/CLAUDE.md) first. The
platform-theme section of the root file is the constraint this whole document sits under.

---

## 1. Why this exists

Before the platform theme landed (PR #79), each app defined its own palette and mapped it _outward_
onto the `--mtg-*` tokens the shared `NavBar` reads, so the three apps agreed on the chrome and
nothing else. That PR reversed the direction: `packages/ui/src/theme.css` owns the palette, type
scale, shape scale, reset, page shell, controls and footer, and each app aliases its own local token
names inward to it.

It also introduced shared control primitives — `.mtg-btn` (`-primary` / `-ghost` / `-danger` / `-sm`)
and `.mtg-input`. **time-counters was migrated onto them; the recommender was not.**

The recommender's buttons read from the shared tokens, so they _match_ in colour and radius today.
But they are still its own rules, and that has a cost: any future change to a shared primitive — a
padding tweak, a new focus treatment, a disabled state — lands in two apps and skips the third. The
look drifts apart again silently, which is the exact failure mode the platform theme exists to
prevent.

## 2. What the survey found, and how it changes the premise

This was recorded as open question 6 in [`KimiAudit.md`](./KimiAudit.md), which framed it as "move
~2,300 lines of bespoke control CSS onto the shared primitives." **That framing was wrong**, and the
correction is the most useful thing in this document.

### 2a. The recommender is a two-palette app

Four major surfaces set `background: var(--parchment)` — light cards and dialogs on a dark page:

| Surface            | Defined at                               |
| ------------------ | ---------------------------------------- |
| `.commander-card`  | `client/src/styles/commander-card.css:2` |
| `.deck-theme`      | `client/src/styles/deck-summary.css:33`  |
| `.dialog-card`     | `client/src/styles/dialogs.css:27`       |
| `.upload-textarea` | `client/src/styles/upload.css:53`        |

`.mtg-btn-ghost`, `.mtg-btn-danger` and `.mtg-input` are all authored for the **dark page only**.
Every control living on a parchment surface therefore has nothing to share with, and must stay
local until the platform grows a light-surface variant.

**A light-surface variant was considered and declined for now**: it would be shared API designed
around a single consumer, with no second app to validate it against. Revisit if apps/home or
time-counters ever grows a light surface.

### 2b. Most of the rest are genuinely not the platform button

Icon-only round toggles (`.like-dislike-btn`, `.dismiss-button`, `.dialog-close`), inline text links
rendered inside prose (`.link-button`, `.filter-clear`), a colour-pip cycler (`.toggle-pip`),
tri-state include/exclude filter pills (`.toggle-chip`), a mono numeral cell whose `min-width: 2rem`
exists to stop the pager jittering between 1- and 2-digit pages (`.page-number`), and
text-as-button rows (`.support-name`, `.commander-oracle-button`).

**Net: eight controls are cleanly migratable, not thirty.** The durable value of this work is as
much in recording _why the rest stay bespoke_ as in the deletion.

### 2c. Token aliasing gotchas

From `client/src/styles/tokens.css:14-23` — these govern several verdicts below:

- `--ink-text` = `--mtg-color-text-inverse` (`#241f16`), **not** `--mtg-color-accent-ink`
  (`#1c1408`). Every local filled-brass button uses `--ink-text`.
- `--ink` = `--mtg-color-bg` (page background), **not** `--mtg-color-surface`. Local inputs fill with
  `--ink`; `.mtg-input` fills with `--mtg-color-surface` — a visible one-step darkness difference.

## 3. Two platform defects to fix first

Both were found during the survey; both are in `packages/ui/src/theme.css`. Comment both — they are
the kind of thing that gets silently reverted.

### 3a. `.mtg-btn-primary` has the wrong hover direction

It rests on `--mtg-color-accent` and brightens on hover. That is **time-counters'** behaviour, which
was carried over when `theme.css` was written. The recommender's `.primary-button`
(`upload.css:98-116`) does the opposite: rests on the brighter `--brass-bright` and _darkens_ on
hover.

The repo owner chose the recommender's look as the platform look, so its button behaviour should
have come with it. **Decision: change the platform to match the recommender** — rest on
`--mtg-color-accent-hover`, darken to `--mtg-color-accent`.

**Blast radius, verified:** 8 call sites, all in time-counters — `Header.tsx:105`,
`AddCardPanel.tsx:319`/`577`, `TimeTravelPanel.tsx:164`/`256`, `CommanderTaxModal.tsx:92`/`129`,
`ErrorFallback.tsx:28`. `apps/home` has none. These get slightly brighter at rest; that is the
intended, user-visible effect.

### 3b. The platform has no solid danger button

`.danger-button` (`dialogs.css:327`) is a solid red fill; `.mtg-btn-danger` is transparent with a
soft border. A solid fill is the stronger signal for a confirmed destructive action and is what
ships today. **Decision: add `.mtg-btn-danger-solid`** — `background: var(--mtg-color-danger)`,
`color: var(--mtg-color-danger-text)`, `border-color: transparent`, hover
`filter: brightness(1.12)`, matching `dialogs.css:327-345` so the confirm dialog is unchanged. Keep
the existing outlined variant; both are legitimate.

## 4. The migration

Each control becomes `.mtg-btn` + variant in the markup. The local class survives **only** as a
modifier holding its genuine deltas, with a comment naming them. Ordered lowest-risk first; verify
after each. Paths are relative to `apps/commander-recommender/client/src/`.

| #   | Class (defined at)                            | Becomes                                      | Deltas to keep                                                                                                                                                                                                                              |
| --- | --------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `.export-button` — `styles/results.css:46`    | `.mtg-btn .mtg-btn-ghost .mtg-btn-sm`        | `border-radius: 7px`, `font-weight: 500`, `color: var(--text-primary)`; the `@media ≤520px` `flex: 1` + padding at `results.css:142`                                                                                                        |
| 2   | `.app-nav-link` — `styles/layout.css:8`       | `.mtg-btn .mtg-btn-ghost`                    | `font-weight: 500`, `font-size: .85rem`, `padding: .4rem .9rem`, `color: var(--text-primary)`. Already on `--mtg-radius-sm`; sits in `NavBar`'s `extraSlot`, so it neighbours platform chrome — good first read                             |
| 3   | `.card-image-flip` — `styles/dialogs.css:103` | `.mtg-btn .mtg-btn-ghost .mtg-btn-sm`        | `border-radius: 6px`, tighter `padding: .25rem .55rem`, `color: var(--text-primary)`                                                                                                                                                        |
| 4   | `.page-button` — `styles/filters.css:312`     | `.mtg-btn .mtg-btn-ghost`                    | `font-weight: 500`, `font-size: .85rem`, `padding: .5rem .95rem`, `color: var(--text-primary)`. **`:disabled` goes .4 → .5 opacity** — accept and note, or keep the override                                                                |
| 5   | `.file-button` — `styles/upload.css:76`       | `.mtg-btn .mtg-btn-ghost`                    | `font-weight: 500`, `font-size: .9rem`, `padding: .6rem 1rem`, `color: var(--text-primary)`. **On a `<label>`, not a `<button>`** (`CardListUpload.tsx:110`) — `.mtg-btn`'s `display: inline-flex` newly applies; check the file-picker row |
| 6   | `.primary-button` — `styles/upload.css:98`    | `.mtg-btn .mtg-btn-primary` (after §3a)      | `margin-left: auto`, `font-size: .95rem`, `padding: .7rem 1.4rem`, `:active translateY(1px)`, `:disabled` .6. Adopt `--mtg-color-accent-ink` over local `--ink-text` — imperceptible on brass, but the screenshot diff will prove it        |
| 7   | `.combo-button` — `styles/combos.css:8`       | `.mtg-btn .mtg-btn-primary .mtg-btn-sm`      | `align-self: flex-start`, `border-radius: 7px`, `padding: .45rem .9rem`. **`.combo-button-placeholder` does not migrate** — dashed `--parchment-dim` border on a parchment card, `cursor: not-allowed`, no platform analogue                |
| 8   | `.danger-button` — `styles/dialogs.css:327`   | `.mtg-btn .mtg-btn-danger-solid` (after §3b) | `font-weight: 500`, `font-size: .85rem`, `padding: .5rem .95rem`. **Drop its own `:focus-visible`** (`dialogs.css:344`) — it duplicates `theme.css`'s except for using `--brass`, which resolves to the same colour                         |

**Call sites:** `CardListUpload.tsx:110`,`135`,`140`; `ErrorFallback.tsx:25`; `Pagination.tsx:78`,`110`;
`ConfirmDialog.tsx:39`,`44`; `RecommendationResults.tsx:63`,`68`; `ComboFinder.tsx:146`,`173`;
`CardImageDialog.tsx:76`; `App.tsx:33`.

### 4a. Traps

- **`styles/error-fallback.css:56` — `.error-fallback-actions .primary-button { margin-left: 0 }`.**
  Exists solely to cancel `margin-left: auto`. If the class survives as a modifier this keeps
  working; if it is renamed or dropped, the button silently jumps right. Same shape at
  `deck-summary.css:175` (`.slot-suggestions .link-button`) — that one is not migrating, but don't
  disturb it.
- **`.page-button` is the de-facto secondary button**, used in pagination _and_ as "Cancel" in
  `ConfirmDialog.tsx:39` _and_ "Clear" in `CardListUpload.tsx:135`. One change, three screens.
- **Tests assert class names** in `CommanderCard.test.tsx`, `ResultFilters.test.tsx`,
  `LikeDislikeButtons.test.tsx`, `ComboFavoriteButton.test.tsx`. None of the eight appear in them,
  but re-run rather than assuming.
- `styles/filters.css` also contains `.facet-search:focus` and `.page-jump-input:focus`, which set
  `outline: none` and rely on a `border-color` swap as the entire focus indicator. Neither is
  migrating — but don't "tidy" them, or the platform focus ring reappears with a 2px offset they
  never had.

## 5. Document what stays, and why

A one-line comment above each surviving bespoke control, in the existing explain-_why_ tone. Group by
the actual reason so the pattern is legible rather than restated twenty times:

- **On a parchment surface** — `.explain-toggle`, `.commander-oracle-button`, `.jank-toggle`,
  `.combo-button-placeholder`, `.upload-textarea`. The platform models the dark page only (§2a).
- **Icon-only, fixed-size** — `.like-dislike-btn`, `.dismiss-button`, `.dialog-close`,
  `.sort-direction`. `.mtg-btn`'s padding would break the circle/square.
- **Text, not a button** — `.link-button`, `.filter-clear`, `.support-name`, `.badge-match`,
  `.upload-collapse-toggle`, `.facet-group-toggle`. `padding: 0` and inheriting type is the point.
- **Bespoke state model** — `.toggle-pip`, `.toggle-chip`, `.page-number`, `.page-jump-input`,
  `.facet-search`. Tri-state include/exclude, or a numeral cell with anti-jitter sizing.

Two dead things found while sweeping — remove, or justify in a comment:

- `badge-match-strength`, applied at `CommanderCard.tsx:152`, has **no rule in any stylesheet**.
- `toggle-chip-off` / `toggle-pip-off`, applied from `ResultFilters.tsx:66`,`235`, have no rule.
  Probably intentional ("off" = base styling), but it should say so.

## 6. Verification

Success means **the app looks the same afterwards**, except the deliberate primary-button change.
`tsc` and Vitest cannot see a deleted CSS rule, so they are necessary and nowhere near sufficient.
The repo has no visual-regression tooling; build a throwaway before/after screenshot diff.

1. **Capture the baseline before touching anything.**
2. Seed the card database if it isn't present (`cd apps/commander-recommender/server && pnpm run
prepare-data`) so `/api/recommend` returns real results.
3. Run the API (`pnpm --filter mtg-recommender-server dev`, `:4000`) and the **client dev server** —
   the static build has no `/api` proxy, only Vite's dev server does.
4. Drive it with Playwright, passing the proxy explicitly:
   `proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }` and
   `args: ['--ignore-certificate-errors']`. Without that the page renders as a proxy error — see
   [`../TODO.md`](../TODO.md)'s gotcha note, and don't misread it as an egress block.
5. Screenshot every state containing a migrated control, at desktop **and** the 640/520px
   breakpoints (several of the eight carry `@media ≤520px` overrides):
   - upload panel — `.primary-button`, `.file-button`, `.page-button` ("Clear"), `.upload-textarea`
   - results grid with filters open — `.export-button`, pagination `.page-button`
   - a two-faced card's image dialog — `.card-image-flip`
   - the confirm dialog — `.danger-button` (its only call site)
   - the combo finder — `.combo-button` beside its placeholder
   - the nav bar — `.app-nav-link` next to the platform chrome it now matches
   - **hover, `:focus-visible` and `:disabled`** on one instance of each migrated class; four of the
     eight have state variants, and this is where a naive migration silently drifts
6. Pixel-diff after each control. A non-zero diff is a bug to fix or a change to justify — not
   something to wave through.
7. **time-counters separately**: screenshot the 8 primary-button sites before/after, in _both_ the
   platform theme and the Doctor Who skin, since the skin overrides the same accent tokens.
8. Then `pnpm turbo run typecheck lint test` and `node scripts/build-platform.mjs`.

## 7. On completion

- Mark **open question 6 answered** in [`KimiAudit.md`](./KimiAudit.md) and correct its premise —
  record §2a as the reason most controls stay local. Update section 5a's closing paragraph, which
  currently names this work as the obvious next increment.
- Set this document's Status line to shipped, as `color-filter-semantics.md` does.
- Bump `apps/commander-recommender/package.json` and `apps/time-counters/package.json` with
  `CHANGELOG.md` entries. time-counters' change is user-visible (primary buttons brighter at rest),
  so minor there; the recommender's is a patch if the diff is visually neutral.
