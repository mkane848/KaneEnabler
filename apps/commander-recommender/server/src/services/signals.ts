/**
 * The signal model: what a card contributes to a deck's plan, and in what
 * capacity.
 *
 * This replaces the old flat "theme" model, in which a signal was a single
 * regex applied identically to your card and to the candidate commander, and
 * two cards "synergised" when the same words appeared in both. That measured
 * lexical co-occurrence rather than synergy: "Sacrifice a creature" and
 * "Sacrifice Arid Mesa" are the same word and completely different mechanics,
 * and a commander that pays off a plan (Craterhoof Behemoth pumping your
 * board) usually shares no vocabulary at all with the cards that set it up.
 *
 * Three ideas do the work here.
 *
 * 1. ROLES. A card doesn't just "have" a theme, it participates in one in a
 *    particular capacity — see `Role`. This is what lets one card carry
 *    several unrelated signals: Goblin Sharpshooter is Goblin kindred because
 *    of its creature *type*, and part of the creature-death cluster because of
 *    its *text*, and those two facts have nothing to do with each other.
 *
 * 2. TWO SIDES. Membership in a group is read off structured data wherever it
 *    exists (creature types, keywords, type line); qualifying as a *payoff*
 *    is read off rules text. A card's NAME is never evidence of anything —
 *    see `stripSelfReferences` for why that mattered.
 *
 * 3. QUALIFIERS. A payoff can be restricted to a subtype, and then it only
 *    pays off cards of that subtype. Sliver Gravemother cares about Slivers
 *    in the graveyard, so it feeds "Reanimator (Sliver)" — not generic
 *    Reanimator — and every non-Sliver creature in your bin is worth nothing
 *    to it.
 *
 * Extending this: adding an archetype means adding one entry to `ARCHETYPES`
 * with per-role matchers. `Role`, `QualifierKind` and the catalog are all
 * meant to grow; nothing here is closed.
 */
import type { CardRow } from '../types';

/**
 * The capacity in which a card participates in an archetype.
 *
 * KNOWN LIMITATION — this vocabulary is provisional and wants review. It
 * replaces an earlier "Outlet / Payoff" split that was reported as "not quite
 * right", and these five are an inference from worked examples rather than a
 * model anyone has signed off on. The specific problem with Outlet/Payoff was
 * that the two are almost never separable on a real card: Lathril's activated
 * ability *consumes* ten Elves and *rewards* you in the same breath, and
 * Viscera Seer is a sacrifice outlet whose whole point is the scry it gives
 * back. Splitting "consumes" from "rewards" lets one ability be both, which
 * Outlet/Payoff could not express.
 *
 * Cases known to still sit awkwardly:
 *  - Goblin Sharpshooter reads as `rewards` on creature-death here (it untaps
 *    when a creature dies), but it's often *described* as a sacrifice outlet,
 *    because with any outlet it becomes a machine gun. The card enables a
 *    loop it does not itself contain, and no role below captures "enables".
 *  - `is` on a vanilla creature is deliberately not wired into Aristocrats,
 *    even though a vanilla creature genuinely is sacrifice fodder — counting
 *    it would make every creature deck read as Aristocrats.
 */
export type Role =
  /** The card *is* the resource: a Goblin, an Equipment, a land. Structured
   * data, never text. Passive — see `ACTIVE_ROLES`. */
  | 'is'
  /** The card *makes* the resource: Goblin tokens, extra land drops, cards
   * into your own graveyard. */
  | 'produces'
  /** The card *needs* the resource, as a cost or a requirement: "Sacrifice a
   * creature:", "Tap ten untapped Elves:". */
  | 'consumes'
  /** The card *benefits* from the resource existing or the event happening:
   * Blood Artist, Craterhoof Behemoth, Teysa buffing your tokens. */
  | 'rewards'
  /** The card *doubles or repeats* the resource or event: Doubling Season,
   * Teysa making death triggers fire twice. A card that only amplifies needs
   * something else to amplify — it generates no value alone. */
  | 'amplifies';

export const ROLES: Role[] = ['is', 'produces', 'consumes', 'rewards', 'amplifies'];

/**
 * Roles that mean the card actually engages with the plan, as opposed to
 * merely being a member of a group.
 *
 * This is the generalisation of the old "cares, not shares" kindred rule: a
 * commander needs at least one active role to be suggested for an archetype.
 * Silas Renn *is* a Human (`is`) and never mentions Humans, so he is not a
 * Human commander. Krenko *produces* Goblins and *rewards* having them, so he
 * is. The same test now covers keywords for free — having Trample is `is`,
 * granting it to your team is `produces`.
 */
export const ACTIVE_ROLES: Role[] = ['produces', 'consumes', 'rewards', 'amplifies'];

export function hasActiveRole(roles: Role[]): boolean {
  return roles.some((r) => ACTIVE_ROLES.includes(r));
}

/** What a qualifier narrows a signal to. Open to growth — card types and
 * permanent types are the obvious next two. */
export type QualifierKind = 'creatureType' | 'keyword';

/** One archetype a card participates in, with the capacities it does so in. */
export interface SignalMatch {
  archetype: string;
  label: string;
  description: string;
  weight: number;
  /** Present when the signal is restricted — "Reanimator (Sliver)". */
  qualifier?: string;
  qualifierKind?: QualifierKind;
  roles: Role[];
}

/**
 * Identifies one archetype, including its qualifier where it has one.
 *
 * The minimal shape a `SignalMatch` satisfies structurally, so callers that
 * only want to *name* an archetype — "fetch me everything tagged
 * kindred:Goblin" — don't have to invent a whole match to do it.
 */
export interface SignalKey {
  archetype: string;
  qualifier?: string;
}

/** A signal's stable identity, so the same archetype at different qualifiers
 * counts as different signals. */
export function signalKey({ archetype, qualifier }: SignalKey): string {
  return qualifier ? `${archetype}:${qualifier}` : archetype;
}

/** One card that participates in a requested archetype, and how. */
export interface SignalCandidate {
  row: CardRow;
  roles: Role[];
}

// ---------------------------------------------------------------------------
// Card facts
// ---------------------------------------------------------------------------

/** Everything the matchers below are allowed to look at. */
export interface CardFacts {
  name: string;
  typeLine: string;
  /** Oracle text with the card's own name(s) removed. Match against this. */
  text: string;
  /** Oracle text as printed. Only for facts that need to see a self-reference,
   * like `sacrificesItself`. */
  rawText: string;
  creatureTypes: string[];
  keywords: string[];
  /** Creature types this card creates tokens of. "Create two 1/1 red Goblin
   * creature tokens" makes Krenko's Command a Goblin card despite a Sorcery
   * having no creature types of its own. */
  producedTokenTypes: string[];
  /** The card sacrifices *itself* — a fetch land, a Blood Crypt-style cost.
   * Distinct from sacrificing an indefinite object, which is the Aristocrats
   * pattern. */
  sacrificesItself: boolean;
  isLand: boolean;
  isCreature: boolean;
  isEquipment: boolean;
  isAura: boolean;
}

/**
 * Removes the card's own name from its oracle text.
 *
 * A card's rules text refers to itself by name, so any check that regexes a
 * word against oracle text will match that word for free when it appears in
 * the name. Goblin Sharpshooter's abilities are "doesn't untap", "whenever a
 * creature dies, untap" and a ping — it does not care about Goblins in the
 * slightest — yet it matched Goblin kindred purely because "Goblin" is in its
 * name. Names are not abilities, so they are removed before anything reads
 * the text.
 *
 * Both the full name and the pre-comma short form go, since rules text uses
 * the short form ("Lathril" for "Lathril, Blade of the Elves").
 */
export function stripSelfReferences(text: string, ...names: (string | null)[]): string {
  let out = text;
  const forms = new Set<string>();
  for (const name of names) {
    if (!name) continue;
    forms.add(name);
    // "Lathril, Blade of the Elves" -> also strip "Lathril".
    const short = name.split(',')[0].trim();
    if (short && short !== name) forms.add(short);
  }
  // Longest first, so the full name goes before its own short form.
  for (const form of [...forms].sort((a, b) => b.length - a.length)) {
    out = out.split(form).join(' ');
  }
  return out;
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Every word in a piece of text, lowercased. The unit of vocabulary
 * lookup — see `candidateTypes` for why looking up beats searching. */
function wordsIn(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
}

/**
 * Creature types of tokens this card creates.
 *
 * Read out of each "create ... token" clause, so a type mentioned elsewhere
 * in an unrelated sentence isn't credited as a token type.
 */
function findProducedTokenTypes(text: string, vocab: Vocabulary): string[] {
  const found = new Set<string>();
  for (const clause of text.match(/create[^.;]*token[^.;]*/gi) ?? []) {
    for (const word of wordsIn(clause)) {
      const type = vocab.typeByWord.get(word);
      if (type) found.add(type);
    }
  }
  return [...found];
}

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
export function parseCreatureTypes(typeLine: string, knownTypes?: Set<string>): string[] {
  const [typePart, subtypePart] = typeLine.split('—');
  if (!subtypePart) return [];
  // Word-boundary matched, and checked against the type part only: a Battle
  // whose subtype happened to read "Creature" would otherwise slip through.
  if (!/\b(Creature|Kindred|Tribal)\b/.test(typePart)) return [];

  const words = subtypePart.trim().split(/\s+/).filter(Boolean);
  return knownTypes ? words.filter((word) => knownTypes.has(word)) : words;
}

/**
 * Lookup tables for the vocabulary signal detection recognises.
 *
 * Built once and reused across every card. The point is direction: with a
 * map, recognising a card's types costs one lookup per word it contains;
 * without one, it cost a regex per type in Magic. Across the card pool that
 * was the difference between ~8 seconds and ~82.
 */
export interface Vocabulary {
  /** Lowercased word, singular or plural, to its canonical creature type:
   * "elves" and "elf" both map to "Elf". */
  typeByWord: Map<string, string>;
  /** Lowercased single-word keyword to its canonical form. */
  keywordByWord: Map<string, string>;
  /** Keywords containing a space, which single-word lookup cannot find. */
  multiWordKeywords: string[];
}

export function buildVocabulary(creatureTypes: string[], keywords: string[]): Vocabulary {
  const typeByWord = new Map<string, string>();
  for (const type of creatureTypes) {
    typeByWord.set(type.toLowerCase(), type);
    typeByWord.set(pluralOfType(type).toLowerCase(), type);
  }

  const keywordByWord = new Map<string, string>();
  const multiWordKeywords: string[] = [];
  for (const keyword of keywords) {
    if (keyword.includes(' ')) multiWordKeywords.push(keyword);
    else keywordByWord.set(keyword.toLowerCase(), keyword);
  }

  return { typeByWord, keywordByWord, multiWordKeywords };
}

const wordPatternCache = new Map<string, RegExp>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The English plural of a creature type, because cards refer to a type in the
 * aggregate — "Elves you control", not "Elf you control". Only the irregular
 * endings Magic's type list actually contains are handled.
 */
export function pluralOfType(type: string): string {
  // Elf -> Elves, Dwarf -> Dwarves. Lathril says "ten untapped Elves you
  // control", so missing this drops one of the format's best-known kindred
  // commanders.
  if (/f$/i.test(type)) return type.replace(/f$/i, 'ves');
  // Sphinx -> Sphinxes, Fungus -> Funguses, Leech -> Leeches.
  if (/(s|x|z|ch|sh)$/i.test(type)) return `${type}es`;
  return `${type}s`;
}

const tokenDescriptorCache = new Map<string, RegExp>();

/**
 * A token's printed type line inside a "create" clause — "Goblin creature
 * tokens", "Elf Warrior creature tokens". One optional intervening word so a
 * token with two creature types still matches.
 */
function tokenDescriptorPattern(type: string): RegExp {
  let pattern = tokenDescriptorCache.get(type);
  if (!pattern) {
    const forms = `(?:${escapeRegExp(type)}|${escapeRegExp(pluralOfType(type))})`;
    pattern = new RegExp(`\\b${forms}(?:\\s+\\w+)?\\s+(?:creature\\s+)?tokens?\\b`, 'gi');
    tokenDescriptorCache.set(type, pattern);
  }
  // Shared cached regex with /g — reset before each use.
  pattern.lastIndex = 0;
  return pattern;
}

/** Matches a word or its plural, on a word boundary. Cached: this runs against
 * every candidate in a pool of thousands. */
function wordPattern(word: string): RegExp {
  let pattern = wordPatternCache.get(word);
  if (!pattern) {
    pattern = new RegExp(`\\b(?:${escapeRegExp(word)}|${escapeRegExp(pluralOfType(word))})\\b`, 'i');
    wordPatternCache.set(word, pattern);
  }
  return pattern;
}

/**
 * Whether the card sacrifices *itself*, as opposed to an indefinite object.
 *
 * Two spellings, because Scryfall changed theirs. Older text named the card
 * ("Sacrifice Arid Mesa:"); current text says "Sacrifice this land:" /
 * "Sacrifice this creature:". Both are read off the RAW text — the
 * name-stripped copy renders the first form as a bare "Sacrifice :".
 */
function detectsSelfSacrifice(rawText: string, name: string): boolean {
  if (/\bsacrifice this\b/i.test(rawText)) return true;
  const short = name.split(',')[0].trim();
  if (!short) return false;
  return new RegExp(`sacrifice ${escapeRegExp(short)}\\b`, 'i').test(rawText);
}

/**
 * Removes reminder text — the parenthetical restatement of a keyword.
 *
 * Reminder text explains a keyword the card already has; it is never an
 * ability of its own. Leaving it in produced real false positives: Sliver
 * Gravemother's Encore reminder text ends "They gain haste", which read as
 * the card *granting* haste to your team, i.e. an active Haste payoff.
 */
function stripReminderText(text: string): string {
  return text.replace(/\([^)]*\)/g, ' ');
}

export function buildCardFacts(row: CardRow, vocab: Vocabulary): CardFacts {
  const rawText = row.oracle_text ?? '';
  const text = stripReminderText(stripSelfReferences(rawText, row.name, row.back_name ?? null));
  const typeLine = row.type_line ?? '';
  return {
    name: row.name,
    typeLine,
    text,
    rawText,
    creatureTypes: parseJsonArray(row.creature_types),
    keywords: parseJsonArray(row.keywords),
    producedTokenTypes: findProducedTokenTypes(text, vocab),
    sacrificesItself: detectsSelfSacrifice(rawText, row.name),
    isLand: /\bLand\b/.test(typeLine),
    isCreature: /\bCreature\b/.test(typeLine),
    isEquipment: /\bEquipment\b/.test(typeLine),
    isAura: /\bAura\b/.test(typeLine),
  };
}

// ---------------------------------------------------------------------------
// The archetype catalog
// ---------------------------------------------------------------------------

type Matcher = RegExp | ((f: CardFacts) => boolean);

export interface ArchetypeDef {
  key: string;
  label: string;
  description: string;
  weight: number;
  /** Per-role matchers. A card matching any matcher for a role gains it. */
  roles: Partial<Record<Role, Matcher[]>>;
  /**
   * When set, a match may be narrowed to a creature type the card's text
   * restricts it to — the Sliver Gravemother case. A qualified signal only
   * counts supporters of that type, and separately implies kindred for it.
   */
  qualifiable?: QualifierKind;
}

function matches(matcher: Matcher, facts: CardFacts): boolean {
  return typeof matcher === 'function' ? matcher(facts) : matcher.test(facts.text);
}

/**
 * Archetypes keyed by their real names, because that's what a player would
 * call them. Kindred and keyword-care are generated per qualifier rather than
 * listed here — see `detectKindred` / `detectKeywordCare`.
 *
 * Weights are a first pass and want tuning against real lists; they were set
 * before any measurement was possible.
 */
export const ARCHETYPES: ArchetypeDef[] = [
  {
    key: 'aristocrats',
    label: 'Aristocrats',
    description:
      'Sacrificing your own creatures for value — fodder, an outlet to sacrifice it to, and payoffs that ' +
      'trigger when a creature dies. Deliberately creature-specific: sacrificing an artifact or a land is a ' +
      'different deck.',
    weight: 20,
    roles: {
      // "Sacrifice a creature:" — an indefinite creature, not itself. A fetch
      // land sacrificing itself for mana is not this synergy even though the
      // word appears.
      consumes: [/\bsacrifice (?:a|an|another|two|three|four|\d+|x)\b[^.;]*\bcreature/i],
      // "dying" as well as "dies": Teysa Karlov reads "If a creature dying
      // causes a triggered ability ... to trigger".
      rewards: [/(?:whenever|if)[^.;]*\b(?:dies|dying)\b/i],
      produces: [/create[^.;]*\bcreature token/i],
      amplifies: [/\b(?:dies|dying)\b[^.]*triggers? an additional time/i],
    },
  },
  {
    key: 'goWide',
    label: 'Go-Wide Combat',
    description:
      'Winning through a board full of creatures rather than a combo — mass pumps, evasion granted to the ' +
      'team, and payoffs that scale with how many creatures you control.',
    weight: 18,
    roles: {
      produces: [/create[^.;]*\bcreature token/i],
      rewards: [
        /where x is the number of creatures you control/i,
        /creatures you control (?:get|gain|have)/i,
        // Teysa Karlov buffs the tokens specifically, which is a go-wide
        // payoff even though it never says "creatures you control".
        /creature tokens you control (?:get|gain|have)/i,
        /whenever you attack/i,
        /whenever[^.;]*creatures? you control attacks?/i,
      ],
      amplifies: [/would create[^.]*tokens?[^.]*instead/i, /create twice (?:that many|as many) tokens/i],
    },
  },
  {
    key: 'voltron',
    label: 'Voltron',
    description:
      'Stacking Equipment and Auras onto one creature — often the commander — and winning through a single ' +
      'hard-to-answer threat.',
    weight: 20,
    roles: {
      is: [(f) => f.isEquipment || f.isAura],
      produces: [/\battach\b/i, /\benchant creature\b/i],
      consumes: [/\bequip \{/i],
      // Deliberately NOT "equipped creature gets/has/gains": that is every
      // Equipment describing its own effect, so it made each suit its own
      // payoff. A 20-card Equipment pile came back with "14 payoffs" and a
      // complete Voltron chain, when what it actually lacked was any reason
      // to be stacking Equipment at all. A payoff is a card that rewards you
      // for suiting up and is not itself the suit.
      rewards: [
        /whenever you (?:cast|play) an? (?:equipment|aura)/i,
        /whenever an? (?:equipment|aura)[^.;]*enters/i,
        /whenever[^.;]*becomes (?:attached|equipped|enchanted)/i,
        /for each (?:equipment|aura)/i,
        /equip abilities you activate cost/i,
        /equipped creatures you control/i,
        /enchanted creatures you control/i,
      ],
    },
  },
  {
    key: 'landsMatter',
    label: 'Lands Matter',
    description:
      'Treating lands as a resource to be played, sacrificed, and recurred — extra land drops, landfall ' +
      'payoffs, and lands that put themselves into the graveyard.',
    weight: 20,
    roles: {
      // A fetch land sacrificing itself belongs here rather than in
      // Aristocrats: nothing about it triggers a creature-death ability, but
      // it genuinely feeds a deck that cares about lands hitting the bin.
      produces: [
        (f) => f.sacrificesItself && f.isLand,
        /\bsacrifice (?:a|an|another)\b[^.;]*\bland/i,
        /search your library for[^.;]*land[^.;]*(?:onto|into) the battlefield/i,
        /play an additional land/i,
        /put[^.;]*land[^.;]*from your (?:hand|graveyard)[^.;]*onto the battlefield/i,
      ],
      rewards: [/\blandfall\b/i, /whenever a land (?:you control )?enters/i, /for each land you control/i],
      consumes: [/\bsacrifice (?:a|an|another)\b[^.;]*\bland/i],
    },
  },
  {
    key: 'spellslinger',
    label: 'Spellslinger',
    description: 'Payoffs for chaining instants and sorceries rather than deploying creatures.',
    weight: 20,
    roles: {
      rewards: [
        /instant or sorcery spell/i,
        /whenever you cast an? (?:instant|sorcery)/i,
        /whenever you cast a noncreature spell/i,
        /instant and sorcery spells? (?:you cast )?costs? \{?\d/i,
      ],
      amplifies: [/copy (?:it\.|that spell|the (?:target|next) instant or sorcery)/i],
    },
  },
  {
    key: 'counters',
    label: '+1/+1 Counters',
    description: 'Growing creatures with +1/+1 counters, and the payoffs that read how many are out there.',
    weight: 20,
    roles: {
      produces: [/put (?:a|an|one|two|three|x|\d+)[^.;]*\+1\/\+1 counters?/i, /\b(?:adapt|evolve|bolster|outlast)\b/i],
      rewards: [/whenever[^.;]*\+1\/\+1 counter/i, /for each \+1\/\+1 counter/i],
      amplifies: [/would (?:put|distribute) one or more[^.]*counters[^.]*instead/i, /twice that many[^.]*counters/i],
    },
  },
  {
    key: 'reanimator',
    label: 'Reanimator',
    description:
      'Cheating creatures out of the graveyard onto the battlefield for less than they would cost to cast.',
    weight: 22,
    // Sliver Gravemother cares specifically about Slivers being in the
    // graveyard, so it feeds Reanimator (Sliver) rather than generic
    // Reanimator, and non-Sliver creatures in your bin do not support it.
    qualifiable: 'creatureType',
    roles: {
      rewards: [
        /return[^.;]*creature[^.;]*from (?:your|a) graveyard to the battlefield/i,
        /put[^.;]*creature card[^.;]*from (?:your|a) graveyard onto the battlefield/i,
        /\bencore\b/i,
        /\bunearth\b/i,
        /\beternalize\b/i,
        /\bembalm\b/i,
      ],
      consumes: [/\bexile[^.;]*from your graveyard\b/i],
    },
  },
  {
    key: 'selfMill',
    label: 'Self-Mill',
    description:
      'Filling your own graveyard on purpose, as setup for reanimation or for payoffs that read your ' +
      'graveyard. Distinct from milling an opponent, which is an attack rather than a resource.',
    weight: 18,
    roles: {
      produces: [
        /you mill \w+/i,
        /mill \w+ cards?\./i,
        /put the top \w+ cards? of your library into your graveyard/i,
        /\bsurveil\b/i,
        /\bdredge\b/i,
      ],
      rewards: [/for each creature card in your graveyard/i, /cards? in your graveyard/i],
    },
  },
  {
    key: 'opponentMill',
    label: 'Mill (Opponents)',
    description:
      "Emptying opponents' libraries as a route to winning. Separate from self-mill: the cards go to a " +
      'graveyard you cannot use.',
    weight: 16,
    roles: {
      produces: [
        /each opponent mills/i,
        /target (?:player|opponent) mills/i,
        /defending player mills/i,
        /each other player mills/i,
      ],
      rewards: [/cards? in (?:their|an opponent's) graveyard/i],
    },
  },
];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Splits text into clauses, so a qualifier is only picked up from the same
 * sentence as the payoff it restricts. */
function clauses(text: string): string[] {
  return text.split(/[.;\n]/).filter((c) => c.trim().length > 0);
}

/**
 * The creature type a qualifiable archetype's payoff is restricted to, if any.
 *
 * Only a type mentioned in the same clause as the payoff counts — a commander
 * that reanimates anything and separately happens to mention Goblins is not a
 * Goblin-restricted reanimator.
 */
function findQualifier(facts: CardFacts, def: ArchetypeDef, vocab: Vocabulary): string | undefined {
  const payoffMatchers = [...(def.roles.rewards ?? []), ...(def.roles.consumes ?? [])];
  for (const clause of clauses(facts.text)) {
    const hit = payoffMatchers.some((m) => (typeof m === 'function' ? false : m.test(clause)));
    if (!hit) continue;
    for (const word of wordsIn(clause)) {
      const type = vocab.typeByWord.get(word);
      if (type) return type;
    }
  }
  return undefined;
}

function rolesFor(def: ArchetypeDef, facts: CardFacts): Role[] {
  const found: Role[] = [];
  for (const role of ROLES) {
    const matchers = def.roles[role];
    if (matchers?.some((m) => matches(m, facts))) found.push(role);
  }
  return found;
}

/**
 * The creature types a card could possibly relate to.
 *
 * Derived from the card outward rather than by testing every type in the
 * game against it. That is not just an optimisation: looping the full
 * vocabulary meant 647 types x 884 keywords of regex per card, which took
 * 82 seconds across the card pool and made precomputing signals impractical.
 * Scanning the card's own words and intersecting with the known-type set is
 * proportional to the card, not to Magic's type list.
 */
function candidateTypes(facts: CardFacts, vocab: Vocabulary): string[] {
  const found = new Set<string>();
  // Structured, and free.
  for (const type of facts.creatureTypes) found.add(type);
  for (const type of facts.producedTokenTypes) found.add(type);
  // Textual: every word the card uses, looked up rather than searched for.
  for (const word of wordsIn(facts.text)) {
    const type = vocab.typeByWord.get(word);
    if (type) found.add(type);
  }
  return [...found];
}

/** Kindred, one signal per creature type. Membership is structural (the card's
 * own type, or a token type it makes); caring about the type is textual. */
function detectKindred(facts: CardFacts, vocab: Vocabulary): SignalMatch[] {
  const out: SignalMatch[] = [];
  for (const type of candidateTypes(facts, vocab)) {
    const roles: Role[] = [];
    // Structured data only — never the name. Goblin Sharpshooter is a Goblin
    // because its type line says so.
    if (facts.creatureTypes.includes(type)) roles.push('is');
    // "Create two 1/1 red Goblin creature tokens" makes Krenko's Command a
    // Goblin card even though a Sorcery has no creature type.
    if (facts.producedTokenTypes.includes(type)) roles.push('produces');

    // Naming the token's type is not caring about the type — "create two 1/1
    // red Goblin creature tokens" already counted as `produces` above, and
    // must not also read as a payoff. Krenko's Command says "Goblin" exactly
    // once, in the token's name, and is a producer only; Krenko, Mob Boss
    // says it twice — once naming the token, once counting "the number of
    // Goblins you control" — and that second mention is the payoff.
    const caringText = facts.text.replace(tokenDescriptorPattern(type), ' ');

    for (const clause of clauses(caringText)) {
      if (!wordPattern(type).test(clause)) continue;
      const consumesType = /\bsacrifice\b|\btap\b|\bdiscard\b|\bexile\b/i.test(clause);
      if (consumesType) {
        roles.push('consumes');
        // An activated ability is "cost: effect", so a clause that spends the
        // type also hands something back. Lathril's "Tap ten untapped Elves
        // you control: Each opponent loses 10 life" consumes Elves *and*
        // rewards you for having had them.
        if (clause.includes(':')) roles.push('rewards');
      }
      if (/\bget\b|\bgains?\b|\bhas\b|\bhave\b|whenever|for each|number of|search|\blose\b|\bloses\b/i.test(clause)) {
        roles.push('rewards');
      }
      // Mentioned outside a token's name, in a way none of the above caught —
      // still active interest in the type, which is what separates Krenko
      // from Silas Renn.
      if (!consumesType && !roles.includes('rewards')) roles.push('rewards');
    }

    if (roles.length === 0) continue;
    out.push({
      archetype: 'kindred',
      label: `${type} Kindred`,
      description: `${pluralOfType(type)}, and cards that care about having them.`,
      weight: 15,
      qualifier: type,
      qualifierKind: 'creatureType',
      roles: [...new Set(roles)],
    });
  }
  return out;
}

/**
 * Keyword care, one signal per keyword.
 *
 * A keyword on its own is not a synergy — Trample is a good thing to have,
 * not a deck. What matters is a commander that *cares* about the keyword
 * (grants it, or triggers off it), which is the same active-role test kindred
 * uses. Having the keyword is `is` and never qualifies a commander on its own.
 */
function detectKeywordCare(facts: CardFacts, vocab: Vocabulary): SignalMatch[] {
  const out: SignalMatch[] = [];
  for (const keyword of candidateKeywords(facts, vocab)) {
    if (EXCLUDED_KEYWORDS.has(keyword.toLowerCase())) continue;
    const roles: Role[] = [];
    if (facts.keywords.includes(keyword)) roles.push('is');
    const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i');
    for (const clause of clauses(facts.text)) {
      if (!pattern.test(clause)) continue;
      // "Creatures you control gain trample" / "have flying" — granting it to
      // others, which is the Craterhoof shape.
      if (/\b(?:gains?|have|has|gets?)\b/i.test(clause)) roles.push('produces');
      if (/whenever|for each|number of/i.test(clause)) roles.push('rewards');
    }
    if (roles.length === 0) continue;
    out.push({
      archetype: 'keywordCare',
      label: keyword,
      description: `Cards with ${keyword}, where the commander actually cares about it.`,
      weight: 8,
      qualifier: keyword,
      qualifierKind: 'keyword',
      roles: [...new Set(roles)],
    });
  }
  return out;
}

/**
 * Keywords that are structural rather than thematic.
 *
 * The Partner family says who can be your commander, not what your deck
 * wants to do. Surfacing "Partner" as a shared keyword would be a confusing
 * echo of the dedicated partner/background handling rather than a second,
 * unrelated signal.
 */
const EXCLUDED_KEYWORDS = new Set([
  'partner',
  'partner with',
  'friends forever',
  'choose a background',
  "doctor's companion",
]);

/** The keywords a card could possibly relate to. Same inversion as
 * `candidateTypes` — look up the card's own words instead of testing all 884
 * keywords against it. Multi-word keywords ("first strike") can't be found by
 * single-word lookup, so those few are still tested directly. */
function candidateKeywords(facts: CardFacts, vocab: Vocabulary): string[] {
  const found = new Set<string>();
  for (const keyword of facts.keywords) found.add(keyword);
  for (const word of wordsIn(facts.text)) {
    const keyword = vocab.keywordByWord.get(word);
    if (keyword) found.add(keyword);
  }
  const lowerText = facts.text.toLowerCase();
  for (const keyword of vocab.multiWordKeywords) {
    if (lowerText.includes(keyword.toLowerCase())) found.add(keyword);
  }
  return [...found];
}

/** Every archetype this card participates in, and how. */
export function detectSignals(facts: CardFacts, vocab: Vocabulary): SignalMatch[] {
  const out: SignalMatch[] = [];

  for (const def of ARCHETYPES) {
    const roles = rolesFor(def, facts);
    if (roles.length === 0) continue;
    const qualifier = def.qualifiable ? findQualifier(facts, def, vocab) : undefined;
    out.push({
      archetype: def.key,
      label: qualifier ? `${def.label} (${qualifier})` : def.label,
      description: def.description,
      weight: def.weight,
      qualifier,
      qualifierKind: qualifier ? def.qualifiable : undefined,
      roles,
    });
  }

  out.push(...detectKindred(facts, vocab));
  out.push(...detectKeywordCare(facts, vocab));
  return out;
}

/**
 * Whether a card in the list can support a signal the commander showed.
 *
 * Unqualified signals accept any card that participates in the archetype at
 * all. A *qualified* signal additionally requires the supporter to be of that
 * subtype — this is the Sliver Gravemother rule, and it is the whole reason
 * qualifiers exist.
 */
export function supports(signal: SignalMatch, supporter: SignalMatch[], facts: CardFacts): boolean {
  const sameArchetype = supporter.filter((s) => s.archetype === signal.archetype);
  if (sameArchetype.length === 0) return false;
  if (!signal.qualifier) return true;

  if (signal.qualifierKind === 'creatureType') {
    return facts.creatureTypes.includes(signal.qualifier) || facts.producedTokenTypes.includes(signal.qualifier);
  }
  if (signal.qualifierKind === 'keyword') {
    return facts.keywords.includes(signal.qualifier);
  }
  return sameArchetype.some((s) => s.qualifier === signal.qualifier);
}

/**
 * Presentation details for a signal read back out of storage.
 *
 * The `card_signals` table records what a card *is* — archetype, qualifier,
 * roles — and deliberately not how to label it. Labels and weights are
 * presentation, and storing them would mean a reworded description needed a
 * full re-import to take effect. This rebuilds them from the catalog instead.
 */
export function archetypeDisplay(
  archetype: string,
  qualifier: string | null
): { label: string; description: string; weight: number } {
  if (archetype === 'kindred' && qualifier) {
    return {
      label: `${qualifier} Kindred`,
      description: `${pluralOfType(qualifier)}, and cards that care about having them.`,
      weight: 15,
    };
  }
  if (archetype === 'keywordCare' && qualifier) {
    return {
      label: qualifier,
      description: `Cards with ${qualifier}, where the commander actually cares about it.`,
      weight: 8,
    };
  }

  const def = ARCHETYPES.find((a) => a.key === archetype);
  if (!def) {
    // An archetype in the database that the catalog no longer defines — the
    // shape of things after a rename without a re-import. Degrade to the raw
    // key rather than crashing; the next import drops the row.
    return { label: archetype, description: '', weight: 10 };
  }
  return {
    label: qualifier ? `${def.label} (${qualifier})` : def.label,
    description: def.description,
    weight: def.weight,
  };
}
