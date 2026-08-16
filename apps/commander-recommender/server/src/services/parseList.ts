export interface ParsedListEntry {
  name: string;
  quantity: number;
  raw: string;
}

// Whole-line structure that isn't a card: zone names from Arena/Moxfield/
// Archidekt exports, with an optional count ("Sideboard (15)").
const SECTION_HEADER =
  /^(deck|decklist|commanders?|sideboard|side ?board|maybe ?board|main ?board|companion|tokens?|about)\s*:?\s*(\(\d+\))?$/i;

// Moxfield and Archidekt group cards under type/category headings that look
// like "Creature (12)" or "Artifacts (5)". Without this they'd parse as a
// card named "Creature" and land in notFound as noise.
const TYPE_COUNT_HEADER = /^[A-Za-z][A-Za-z '/-]*\((\d+)\)$/;

// MTGO marks sideboard rows inline: "SB: 1 Sol Ring".
const SB_PREFIX = /^SB:\s*/i;

// Leading quantity: "1", "1x", "1 x", "4X".
const LEADING_QTY = /^(\d+)\s*x?\s+(.+)$/i;

// Trailing metadata the export sites append after the card name. These are
// applied repeatedly rather than once, because the sites combine them in
// different orders — Archidekt can emit set code, collector number, foil
// marker, category and color label all on one line.
const TRAILING_NOISE: RegExp[] = [
  // Archidekt color label: "^Have,#7289DA^"
  /\s*\^[^^]*\^$/,
  // Moxfield/MTGO markers: "*F*" (foil), "*CMDR*" (commander)
  /\s*\*[^*]*\*$/,
  // Set code plus optional collector number, in either bracket style:
  // "(C21) 263" from Moxfield/Arena, "[SLD] 84" from TCGplayer Mass Entry.
  // The collector number allows a letter or star suffix ("263a", "84★").
  /\s*[([][A-Za-z0-9]{2,6}[)\]]\s*[\w★]*$/,
  // Archidekt category: "[Ramp]", "[Commander{top}]"
  /\s*\[[^\]]*\]$/,
  // Spelled-out set name some exports use instead of a code:
  // "(Commander 2021)". Also catches stray "(F)" foil flags.
  /\s*\([^)]*\)$/,
];

/**
 * Strips export metadata from the end of a line, leaving just the card name.
 *
 * Loops until nothing more matches so the patterns can appear in any order
 * and any combination. Every pattern is anchored to the end and strictly
 * shortens the string, so this always terminates.
 */
function stripTrailingNoise(value: string): string {
  let result = value.trim();

  for (let changed = true; changed; ) {
    changed = false;
    for (const pattern of TRAILING_NOISE) {
      const next = result.replace(pattern, '').trim();
      if (next !== result) {
        result = next;
        changed = true;
      }
    }
  }

  return result;
}

/**
 * Parses freeform, pasted deck-list text into {name, quantity} entries.
 *
 * Handles the export shapes from the sites people actually paste from:
 *   "Sol Ring"                                     bare name
 *   "1 Sol Ring"  /  "1x Sol Ring"  /  "1 x Sol Ring"
 *   "1 Sol Ring (C21) 263"                         Moxfield, Arena, MTGO
 *   "1 Sol Ring (C21) 263 *F*"                     Moxfield, with markers
 *   "1x Sol Ring (c21) 263 [Ramp] ^Have,#7289DA^"  Archidekt
 *   "1 Lightning Bolt [SLD] 84"                    TCGplayer Mass Entry
 *   "1 Sol Ring [Commander 2021]"                  spelled-out set name
 *   "SB: 1 Sol Ring"                               MTGO sideboard row
 *
 * Blank lines, "//" and "#" comments, zone headers ("Commander", "Deck") and
 * grouping headers ("Creature (12)") are ignored.
 *
 * Note that "//" only starts a comment at the beginning of a line — mid-line
 * it separates the faces of a double-faced card ("Fable of the
 * Mirror-Breaker // Reflection of Kiki-Jiki"), which is how Scryfall spells
 * those names, so it has to survive into the name.
 */
export function parseCardList(raw: string): ParsedListEntry[] {
  const entries: ParsedListEntry[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
    if (SECTION_HEADER.test(trimmed)) continue;
    if (TYPE_COUNT_HEADER.test(trimmed)) continue;

    const withoutSideboard = trimmed.replace(SB_PREFIX, '');

    const qtyMatch = withoutSideboard.match(LEADING_QTY);
    let quantity = 1;
    let rest = withoutSideboard;
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10) || 1;
      rest = qtyMatch[2];
    }

    rest = stripTrailingNoise(rest);
    if (!rest) continue;

    entries.push({ name: rest, quantity, raw: trimmed });
  }

  return entries;
}
