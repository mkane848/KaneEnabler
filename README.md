# KaneEnabler

The root of my Magic: The Gathering tooling — a monorepo-in-progress bringing together projects that
were built independently, so the game's rules are modelled once and shared by every tool.

## Status

Phase 0 (consolidation) and Phase 1 (pnpm + Turborepo toolchain baseline) are done — see
[`docs/handoff.md`](./docs/handoff.md) for exactly what that covers and what's next.

| App                                                          | What it does                                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`apps/commander-recommender`](./apps/commander-recommender) | Paste a card list, get ranked Commander suggestions with cited synergies, ban-list legality, and Partner/Background pairing        |
| [`apps/time-counters`](./apps/time-counters)                 | In-game counter companion for a Jeskai _Doctor Who_ Commander deck — Suspend, Vanishing, Fading, Sagas, commander tax, Time Travel |

`pnpm install` at the repo root installs the whole workspace; see [`CLAUDE.md`](./CLAUDE.md) for
the full command reference (`pnpm turbo run build/typecheck/lint/test`, per-app `pnpm dev`, etc.).

## Where this is going

```
apps/
  commander-recommender/    HardlyKnowHer — client/ + server/, each its own package
  time-counters/            DrWhoCompanionEDH
packages/
  config/         shared tsconfig / eslint / prettier / vitest bases — done
  rules/          CR-cited rules primitives + a vendored Comprehensive Rules snapshot
  scryfall/       bulk-data client
  card-model/     one normalized Card, one Scryfall projector
  mana/           mana glyphs, cost parsing, pips
  ui/             shared accessible primitives
  profile/        user preferences (liked/disliked cards, commanders, combos)
```

The point of the `packages/rules` layer is that adding a new tool shouldn't mean re-implementing
colour identity, commander legality, or counter semantics for the third time — and shouldn't mean
revisiting rules support every time a feature is imagined.

## Documentation

- **[docs/handoff.md](./docs/handoff.md)** — the plan: architecture, phases, verification
- **[docs/rules-audit.md](./docs/rules-audit.md)** — Magic rules defects found in the existing code
- **[docs/api-policy.md](./docs/api-policy.md)** — external API limits, a hard project rule

## Fan content notice

Unofficial Fan Content permitted under the [Wizards of the Coast Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy).
Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the
Coast LLC. Card data courtesy of [Scryfall](https://scryfall.com); combo data courtesy of
[Commander Spellbook](https://commanderspellbook.com).
