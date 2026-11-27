/**
 * Reads a pasted card list — a Pokémon TCG Live export ("4 Iono PAL 185"
 * under "Pokémon: 12" / "Trainer: 36" / "Energy: 12" headers) or plain
 * "count name" / bare-name lines — into catalog cards.
 *
 * A line with a set code and number resolves to that exact print. A set code
 * isn't unique (`30th` and `30th-c` both print `30C`), so every set with the
 * code is tried. Anything that doesn't resolve that way falls back to the
 * name. Nothing is guessed: what doesn't resolve is reported, with why.
 */
import type { PtcgCard } from '@ptcg/rules';
import type { Catalog } from '../data/catalog';

export interface ParsedEntry {
  card: PtcgCard;
  count: number;
}

export interface UnmatchedLine {
  line: string;
  reason: string;
}

export interface ParsedList {
  entries: ParsedEntry[];
  unmatched: UnmatchedLine[];
  /** Cards across every resolved line. */
  total: number;
}

const HEADER = /^(?:pok[eé]mon|trainers?|energy|total cards)\s*:?\s*\d*\s*$/i;
const WITH_PRINT = /^(\d+)\s*x?\s+(.+?)\s+([A-Za-z0-9-]{2,6})\s+([A-Za-z]{0,4}\d+[a-z]?)$/;
const WITH_COUNT = /^(\d+)\s*x?\s+(.+)$/;

/** Straight and curly apostrophes, case and spacing — the differences a paste introduces. */
export function normalizeName(name: string): string {
  return name.replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

/** "005" and "5" are the same collector number; "SV85" stays "SV85". */
function normalizeNumber(n: string): string {
  return n.toUpperCase().replace(/^([A-Z]*)0+(\d)/, '$1$2');
}

export function createResolver(catalog: Catalog) {
  const byPrint = new Map<string, PtcgCard>();
  const byName = new Map<string, PtcgCard[]>();
  for (const card of catalog.cards) {
    byPrint.set(`${card.setId}|${normalizeNumber(card.localId)}`, card);
    const key = normalizeName(card.name);
    byName.set(key, [...(byName.get(key) ?? []), card]);
  }

  const byCode = (code: string, number: string): PtcgCard | undefined => {
    for (const set of catalog.setsByCode.get(code.toUpperCase()) ?? []) {
      const card = byPrint.get(`${set.id}|${normalizeNumber(number)}`);
      if (card) return card;
    }
    return undefined;
  };

  const byNameOnly = (name: string): PtcgCard | undefined => {
    const prints = byName.get(normalizeName(name));
    // The newest print stands in for the name; ownership counts by name anyway.
    return prints?.[prints.length - 1];
  };

  return { byCode, byNameOnly };
}

export function parseList(text: string, catalog: Catalog): ParsedList {
  const resolve = createResolver(catalog);
  const counts = new Map<string, ParsedEntry>();
  const unmatched: UnmatchedLine[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s*•-]+/, '').trim();
    if (!line || HEADER.test(line)) continue;

    let count = 1;
    let card: PtcgCard | undefined;
    let name = line;
    const printed = WITH_PRINT.exec(line);
    if (printed) {
      count = Number(printed[1]);
      name = printed[2]!; // the regex's second group always matches
      // A print only counts if its name agrees with the line: a mistyped set
      // code otherwise lands silently on an unrelated card.
      const print = resolve.byCode(printed[3]!, printed[4]!); // groups 3–4 always match
      card =
        print && normalizeName(print.name) === normalizeName(name)
          ? print
          : resolve.byNameOnly(name);
    } else {
      const counted = WITH_COUNT.exec(line);
      if (counted) {
        count = Number(counted[1]);
        name = counted[2]!; // always matches
      }
      card = resolve.byNameOnly(name);
    }

    if (!card) {
      unmatched.push({
        line: raw.trim(),
        reason: `No card named “${name}” in this format's card pool.`,
      });
      continue;
    }
    if (count <= 0) continue;
    const prev = counts.get(card.id);
    counts.set(card.id, { card, count: (prev?.count ?? 0) + count });
  }

  const entries = [...counts.values()];
  return { entries, unmatched, total: entries.reduce((n, e) => n + e.count, 0) };
}
