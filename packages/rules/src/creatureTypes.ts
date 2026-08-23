/**
 * The creature types on a card, from its type line.
 *
 * Two filters, because either one alone lets junk through:
 *
 *   1. **Only Creature and Kindred cards have creature types** (CR 205.3m).
 *      Every other card type has its own subtype list. "Battle — Control
 *      Point" made *Control* a creature type, so every card reading "creatures
 *      you control" was detected as caring about Control Kindred, and a real
 *      30-card list came back with a 14-card "Control Kindred" theme.
 *
 *   2. **The subtypes of a Creature card are still not all creature types.**
 *      They are mixed together and not positionally separable: "Artifact
 *      Creature — Equipment Boar" and "Kindred Enchantment — Lhurgoyf Aura"
 *      each carry one of each. That made Equipment, Aura, and Saga creature
 *      types, and produced a three-card "Aura Kindred" theme on a graveyard
 *      list.
 *
 * `knownTypes` is Scryfall's creature-type catalog, fetched alongside the bulk
 * data. Omitting it falls back to filter 1 only, which is what a database
 * seeded before the catalog existed gets — narrower than nothing, and it
 * degrades rather than failing.
 */
// "Time Lord" is the only multi-word entry in Scryfall's creature-type
// catalog (verified against the live catalog/creature-types endpoint) —
// bump this if that ever stops being true.
const MAX_CREATURE_TYPE_SPAN = 2;

export function parseCreatureTypes(typeLine: string, knownTypes?: Set<string>): string[] {
  const [typePart, subtypePart] = typeLine.split('—');
  if (!subtypePart) return [];
  // typePart is always populated: .split() on any string returns at least
  // one element, which destructures into this position.
  // Word-boundary matched, and checked against the type part only: a Battle
  // whose subtype happened to read "Creature" would otherwise slip through.
  if (!/\b(Creature|Kindred|Tribal)\b/.test(typePart!)) return [];

  const words = subtypePart.trim().split(/\s+/).filter(Boolean);
  if (!knownTypes) return words;

  // A plain word-by-word filter can never recognize a multi-word type like
  // "Time Lord" — neither "Time" nor "Lord" is a type by itself. Try the
  // longest word-run starting at each position first, falling back to a
  // single word, so a run that almost matches ("Time" followed by anything
  // but "Lord") doesn't get kept on the strength of its first word alone.
  const found: string[] = [];
  for (let i = 0; i < words.length;) {
    let consumed = 1;
    for (let span = MAX_CREATURE_TYPE_SPAN; span >= 1; span--) {
      const candidate = words.slice(i, i + span).join(' ');
      if (knownTypes.has(candidate)) {
        found.push(candidate);
        consumed = span;
        break;
      }
    }
    i += consumed;
  }
  return found;
}

/**
 * Whether a card is every creature type (CR 702.73a, Changeling).
 *
 * Read off Scryfall's own `keywords` array, not derived from `parseCreatureTypes` or matched
 * against oracle text — Changeling's reminder text ("This card is every creature type.") names no
 * type words for either of those to find, and the keyword itself is the whole fact. Deliberately a
 * boolean rather than an expansion of `parseCreatureTypes`'s result into Magic's ~300-type catalog:
 * that catalog is looped once per *deck's* creature-type vocabulary already (`candidateTypes` in
 * commander-recommender's `signals.ts`, kept proportional to a card's own text for performance
 * reasons), and pre-expanding it per changeling card here would undo that.
 */
export function hasChangeling(keywords: string[]): boolean {
  return keywords.some((k) => k.toLowerCase() === 'changeling');
}
