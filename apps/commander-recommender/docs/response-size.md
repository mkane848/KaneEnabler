# The recommendation response is 12 MB

Scoped as its own piece of work rather than folded into a feature stage,
because it is a delivery problem rather than a product one and the two would
compete for attention.

## What was measured

Three real lists, against the v1.7.0 engine, `POST /api/recommend`:

| List | Raw | Gzipped | Suggestions |
|---|---|---|---|
| Aristocrats (30 cards) | 12.22 MB | 0.41 MB | 1,385 |
| Reanimator (30 cards) | 5.09 MB | 0.27 MB | 1,133 |
| Voltron (20 cards) | 1.60 MB | 0.06 MB | 180 |

Where the bytes go, on the largest:

| Field | Size | Share |
|---|---|---|
| `themeSupport` | 10.33 MB | 84.5% |
| `cards` (the commanders themselves) | 1.68 MB | 13.8% |
| `kindredSupport` | 0.21 MB | 1.7% |
| `bracket` | 0.17 MB | 1.4% |
| `deck` (the whole Stage 2 summary) | 0.06 MB | 0.5% |

## The two findings that decide the work

**1. Nothing is compressed.** The client sends
`Accept-Encoding: gzip, br`; the server answers `Content-Length: 12224814`
with no `Content-Encoding`. There is no compression middleware in
`server/src/index.ts` — there never has been. The payload is unusually
compressible (see finding 2), so this is a 30× reduction from three lines.

Cost, measured on the 12.22 MB body: gzip level 6 → 0.41 MB in 69 ms; level
1 → 0.90 MB in 42 ms. Level 6 is the right default here — the extra 27 ms
buys 0.49 MB, which is a good trade on a slow connection and a bad one only
if the server is CPU-bound, which it is not.

**2. The supporting cards are duplicated 951×.** Across the aristocrats
response, **26,618 supporting-card entries are serialized, backed by 28
distinct cards.** That ratio is not an accident and will not improve with
tuning: a supporting card is by definition one of *your* cards, so the
distinct set can never exceed the size of the uploaded list, while the number
of references grows with the number of commanders. A larger collection makes
this worse, not better.

At ~369 bytes per serialized card, those references cost 9.8 MB. Sent once
with an index per reference: ~0.17 MB.

## What this rules out

**Server-side pagination is not the answer**, which is worth stating because
it is the obvious first instinct at 12 MB. The client deliberately holds the
whole result set: the filter bar derives its available brackets, themes, and
colors from it, and reports "showing N of M". Paginating on the server means
either shipping a second aggregate endpoint or degrading the filter UI, and
it would be doing that to solve a problem that two smaller and strictly
better changes already solve. Revisit only if result counts grow by an order
of magnitude.

## Outcome

Both shipped. Measured the same way, on the same three lists:

| List | Raw before | Raw after | On the wire | Total |
|---|---|---|---|---|
| Aristocrats | 12.22 MB | 2.88 MB | **0.25 MB** | 49× smaller |
| Reanimator | 5.09 MB | 2.26 MB | **0.20 MB** | 25× smaller |
| Voltron | 1.60 MB | 0.36 MB | **0.04 MB** | 40× smaller |

The aristocrats card index holds 28 cards, down from 26,618 serialized
citations. After the change, the largest remaining field is `cards` — the
commanders' own names, type lines and oracle text, at 1.68 MB / 58%. That is
1,385 genuinely different cards, not duplication, and it is where the floor
now sits.

**Item 3 was dropped after measuring.** `bracket` is 0.17 MB, 5.8% of an
already-4×-smaller payload, and being perfectly repetitive it costs almost
nothing once compressed. The two clean ways to remove it are to move the
bracket descriptions into the client (duplicating domain knowledge across
both halves) or to add a second index (more machinery than the saving is
worth). Left alone deliberately.

## The work

In priority order. The first is nearly free and does most of the work; the
second is what makes the response reasonable rather than merely small on the
wire.

### 1. Compress responses

`compression` middleware in `server/src/index.ts`. 12.22 MB → 0.41 MB over
the wire, no API change, no client change.

This alone resolves the user-visible problem. Everything below is about the
*raw* size, which still matters for `JSON.parse` cost and client memory —
a phone parsing a 12 MB string into an object graph is doing real work
regardless of how few bytes crossed the network.

### 2. Send each supporting card once

Add a `cardIndex` to the response: the distinct supporting cards, once.
Replace the inline card objects in `themeSupport` / `kindredSupport` /
`keywordSupport` with indices into it.

Expected: 12.22 MB → ~2.4 MB raw, and a correspondingly cheaper parse. The
client resolves indices once on receipt, so component code keeps working
with whole card objects.

This is a breaking API shape change, and both halves ship together.

### 3. Deduplicate `bracket` (optional — not done, see Outcome)

0.17 MB of identical `{label, range, note}` objects. Send the label and let
the client hold the three descriptions it already knows. Small, and only
worth doing while the serializer is already open.

## Deliberately not in scope

- **Play-rate or price data from external sources.** Not a size question,
  and deferred on its own merits: the engine's own judgement is the thing
  being developed, and reaching for someone else's metadata now would mask
  how well it is or isn't working.
- **Trimming what a suggestion explains.** The supporting-card citations are
  the feature — they are why a recommendation is legible rather than a number.
  Duplication is the problem, not the data.
