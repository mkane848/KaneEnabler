# Deck fixtures

Twenty real Commander decks, used as the reference corpus for the signal engine. Each was traced by
hand against `signals.ts` and each deck's owner confirmed its intended game plan, so these are the
evidence behind every claim in [`docs/archetypes.md`](../../../../../../../docs/archetypes.md) — read
that first for what the corpus is _for_.

## Why these are committed

The catalog's confidence measure is coverage: "`copyEffects` is backed by six independent decks" is
only checkable if the decks exist. Without them the vocabulary is an assertion. They are also the
regression corpus — the intended end state is a test that asserts what each deck exposed (see
`docs/archetypes.md`, "Known tensions", and the per-deck assertions in the rework plan).

## Format

Whatever `parseCardList` (`../../parseList.ts`) accepts, which is deliberately generous. Lines
beginning `#` are comments and are ignored by the parser, so each file carries its commander and
confirmed axes in a header.

Three files (`kalamax`, `miles`, `first-sliver`) were normalised from the original CSV upload —
`1,Card Name` has no whitespace after the count and does **not** parse. The rest are kept verbatim in
the `1x Card Name (set)` form they were supplied in; the parser strips set codes and category
markers itself, and verbatim preserves provenance.

**Each deck includes its own commander in the list.** That is how they were supplied and how a user
would paste one in. `analyzeDeck` is commander-blind today, so nothing depends on separating them —
but a future commander-aware mode (`docs/handoff.md`) would need to, and the header comment names
which card it is.

## The corpus

| File                          | Commander                                            | Identity   | Cards |
| ----------------------------- | ---------------------------------------------------- | ---------- | ----- |
| `kalamax.txt`                 | Kalamax, the Stormsire                               | Temur      | 100   |
| `miles.txt`                   | Miles "Tails" Prower                                 | Azorius    | 100   |
| `first-sliver.txt`            | The First Sliver                                     | 5-colour   | 100   |
| `wilhelt.txt`                 | Wilhelt, the Rotcleaver                              | Dimir      | 100   |
| `trazyn.txt`                  | Trazyn the Infinite                                  | Mono-black | 100   |
| `obeka.txt`                   | Obeka, Brute Chronologist                            | Grixis     | 100   |
| `sophia.txt`                  | Sophia, Dogged Detective                             | Bant       | 100   |
| `bre.txt`                     | Bre of Clan Stoutarm                                 | Boros      | 100   |
| `yshtola.txt`                 | Y'shtola, Night's Blessed                            | Esper      | 99    |
| `krenko.txt`                  | Krenko, Mob Boss                                     | Mono-red   | 100   |
| `eirdu.txt`                   | Eirdu, Carrier of Dawn // Isilu, Carrier of Twilight | Orzhov     | 100   |
| `sauron.txt`                  | Sauron, the Dark Lord                                | Grixis     | 100   |
| `morcant.txt`                 | High Perfect Morcant                                 | Golgari    | 100   |
| `brigid.txt`                  | Brigid, Clachan's Heart // Brigid, Doun's Mind       | Selesnya   | 100   |
| `giada.txt`                   | Giada, Font of Hope                                  | Mono-white | 100   |
| `shadow.txt`                  | Shadow the Hedgehog                                  | Rakdos     | 100   |
| `radagast.txt`                | Radagast the Brown                                   | Mono-green | 100   |
| `tenth-doctor-rose-tyler.txt` | The Tenth Doctor + Rose Tyler                        | Jeskai     | 100   |
| `watcher-in-the-water.txt`    | The Watcher in the Water                             | Mono-blue  | 100   |
| `captain-howler.txt`          | Captain Howler, Sea Scourge                          | Izzet      | 100   |

`yshtola.txt` is 99 as supplied — recorded as given rather than padded.

## The ones that carry specific weight

Most decks contribute evidence for several rules. These five each pin something nothing else does:

- **`obeka.txt`** — her commander produces **zero signals** today, so no input can ever return her.
  The regression that matters most is simply that she produces at least one.
- **`trazyn.txt`** — three phantom themes (Aristocrats, Voltron, Necron Kindred) each with zero
  payoffs, and `keywordCare: Prismatic Gallery` — a Scryfall "keyword" on exactly one card in Magic
  — as the commander's strongest signal.
- **`tenth-doctor-rose-tyler.txt`** — the only two-card commander. Exercises `partners.ts`'s
  Doctor's-companion pairing and the `IGNORED_KEYWORDS` entry, both of which are **correct today**.
- **`eirdu.txt`**, **`brigid.txt`**, **`morcant.txt`** — transforming commanders, which is how
  two-face import was verified as correct (both faces reach detection; they cannot bleed together).
- **`sophia.txt`** — the +1/+1 counters theme reports "complete" while missing Hardened Scales, The
  Ozolith, Herald of Secret Streams and Inspiring Call. A right diagnosis on wrong evidence.

## Adding a deck

Include the commander in the list, add a `#` header naming it and the intended axes, and confirm it
parses. **Do not add a deck whose game plan has not been confirmed by its owner** — the corpus's
value is that the intent is known, not inferred. An unconfirmed list is a guess wearing the costume
of evidence.
