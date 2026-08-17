/**
 * Commander is a singleton format (rule 903.5b): apart from basic lands, a
 * deck may not contain more than one card with a given English name.
 */

/** The slice of a card these rules need. */
export interface SingletonCardLike {
  name: string;
  type_line?: string | null;
  oracle_text?: string | null;
}

// The two ways a card grants its own exemption. Both are printed rules text,
// so they are read off the card rather than kept as a hardcoded name list
// that would go stale every set.
const ANY_NUMBER = /a deck can have any number of cards named/i;
const UP_TO_N = /a deck can have up to (\w+) cards named/i;

// Only ever needed for the handful of "up to N" cards that exist (Seven
// Dwarves "seven", Nazgûl "nine"), both spelled out — but a future card
// is free to print a digit instead, or spell out a number past twelve, so
// singletonLimit tries a plain integer first and only falls back to this
// map for a word it doesn't recognize. Spelled out a bit past what's ever
// been printed, generously, so a new one does not silently read as 1.
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

/**
 * How many copies of this card a Commander deck may legally contain (CR
 * 903.5b). `Infinity` for basic lands and the "any number" cards.
 */
export function singletonLimit(card: SingletonCardLike): number {
  // Exempt by supertype rather than by name, which covers snow basics
  // ("Basic Snow Land — Forest") and Wastes without enumerating anything.
  // Both halves are required: "Land — Forest" is a nonbasic Forest.
  const typeLine = card.type_line ?? '';
  if (/\bBasic\b/i.test(typeLine) && /\bLand\b/i.test(typeLine)) return Infinity;

  const text = card.oracle_text ?? '';
  if (ANY_NUMBER.test(text)) return Infinity;

  const capped = UP_TO_N.exec(text);
  if (capped) {
    // Group 1 is mandatory in UP_TO_N, so a match always populates it. Try
    // a plain integer first — unbounded, and handles a digit the word map
    // was never going to cover — before falling back to NUMBER_WORDS for a
    // spelled-out word.
    const raw = capped[1]!.toLowerCase();
    const limit = Number.isInteger(Number(raw)) ? Number(raw) : NUMBER_WORDS[raw];
    if (limit) return limit;
    // Neither parsed: conservative (1) is still the safe direction, but
    // silent was the actual complaint — this is the one card in the pool
    // this genuinely couldn't resolve, worth a look.
    console.warn(
      `singletonLimit: "${card.name}" says "up to ${capped[1]}" but that number wasn't ` +
        `recognized as a digit or a known word — falling back to a limit of 1.`,
    );
  }

  return 1;
}
