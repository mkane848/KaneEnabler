# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project follows [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-09-03

### Added

- **The profile page now covers all seven of the lists it promised** — favourite jank cards,
  favourite commanders and disliked commanders were missing (finding F2 in `docs/KimiAudit.md`).
  They arrive as a filter over the two card sections ("Everything / Commanders / Jank") rather than
  as seven stacked lists, because the sets overlap: a liked, jank-tagged commander belongs to three
  of them at once and would otherwise have been rendered three times on one page. Each chip carries
  a count, so "how many commanders have I liked?" is answerable at a glance.

### Changed

- **This page now looks like the tools it links to.** It had a violet palette of its own, which made
  the landing page read as a different product from the two apps it introduces; it now wears the
  shared platform theme (`@mtg/ui`'s new `theme.css`) along with the shared page frame and footer.

## [0.2.1] - 2026-08-21

### Fixed

- **A favourited combo's stored permalink could render with any URL scheme,**
  including `javascript:`. `combo_preferences.snapshot` is jsonb with no
  server-side content validation (RLS only enforces row ownership), so a
  user could write anything there directly via the Supabase client. The
  `/profile` page now only ever renders the link when its scheme is
  `https:`. RLS still limits the practical impact to a user's own signed-in
  browser.
- **The sign-in menu could get stuck loading forever after a network hiccup**
  — `@mtg/profile`'s `useAuth` had no `.catch` on its initial session check,
  so a rejected `getSession()` call left the account menu (and the whole
  `/profile` route, which gates its render on the same `loading` flag)
  hidden instead of degrading to signed-out.

## [0.2.0] - 2026-08-18

### Added

- **A profile page (`/profile`)** listing everything you've liked, disliked, and tagged in the
  Commander recommender: liked/disliked cards (with a commander badge and an editable note — the
  note field always existed, but nothing let you write one before this), the jank tag, and
  favourited/hated combos rendered from their stored snapshot. Sign in from anywhere on the
  platform to see it; the "Profile" link only shows up once signed in.
- **A consistent NavBar shared with the recommender and time-counters** (`@mtg/ui`'s new `NavBar`)
  — real links between all three tools for the first time (previously this page's tool cards were
  the only way in; there was no way back or across from inside either tool). Replaces the old
  brand-plus-sign-in header.

### Changed

- The sign-in menu (`AccountMenu`/`AuthDialog`) now comes from `@mtg/profile` instead of this
  app's own copy — one implementation shared with the other two tools instead of three
  hand-maintained ones. No behavior change.

## [0.1.0] - 2026-08-18

### Added

- Initial platform landing page: a shared front door listing both tools
  (commander recommender, time-counters) as cards, plus a shared sign-in
  menu backed by the same Supabase project as the recommender's own account
  menu — one account works across both.
