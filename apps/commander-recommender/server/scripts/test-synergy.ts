/**
 * Tests for the scorer: profiling a collection and ranking commanders
 * against it. Run with: npm test
 *
 * What counts as a synergy is tested in test-signals.ts — this file is about
 * what the scorer does with signals once they exist, so the cards here are
 * mostly minimal shapes rather than real cards.
 *
 * Dependency-free (node:assert + tsx), matching the other test scripts here.
 */
import assert from 'node:assert';
import type { CardRow } from '../src/types';
import type { CommanderUnit } from '../src/services/partners';
import {
  buildCollectionProfile,
  scoreCommanders,
  selectSuggestions,
  type CommanderSuggestion,
  type OwnedCard,
} from '../src/services/synergy';

let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${label}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
  }
}

let counter = 0;
function makeCard(overrides: Partial<CardRow> = {}): CardRow {
  const name = overrides.name ?? `Test Card ${counter++}`;
  return {
    oracle_id: overrides.oracle_id ?? name,
    name,
    name_lower: name.toLowerCase(),
    mana_cost: null,
    cmc: 0,
    type_line: 'Legendary Creature — Human',
    oracle_text: '',
    colors: '[]',
    color_identity: '[]',
    keywords: '[]',
    creature_types: '[]',
    power: '1',
    toughness: '1',
    scryfall_uri: null,
    partner_ability: null,
    partner_target: null,
    is_background: 0,
    legality_commander: 'legal',
    game_changer: 0,
    is_legendary: 1,
    is_commander_eligible: 1,
    image_uri: null,
    back_image_uri: null,
    back_name: null,
    ...overrides,
  };
}

function owned(row: CardRow, quantity = 1): OwnedCard {
  return { row, quantity };
}

function solo(card: CardRow): CommanderUnit {
  return { cards: [card] };
}

/** N distinct sacrifice outlets. The signal threshold counts distinct citable
 * cards, so "enough signal" means enough different cards, not enough copies. */
function sacrificeCards(n: number, overrides: Partial<CardRow> = {}): CardRow[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard({ name: `Sac ${i}`, oracle_text: 'Sacrifice a creature: Draw a card.', ...overrides })
  );
}

/** A commander that sacrifices creatures — an active Aristocrats role. */
function sacrificeCommander(name = 'Candidate', overrides: Partial<CardRow> = {}): CardRow {
  return makeCard({ name, oracle_text: 'Sacrifice a creature: Draw a card.', ...overrides });
}

// --- buildCollectionProfile ------------------------------------------------

check('buildCollectionProfile counts colors, weighted by quantity', () => {
  const black = makeCard({ color_identity: JSON.stringify(['B']) });
  const profile = buildCollectionProfile([owned(black, 3)]);
  assert.strictEqual(profile.colorCounts['B'], 3);
  assert.strictEqual(profile.totalCards, 3);
});

check('buildCollectionProfile collects the vocabulary present in the list', () => {
  const vampire = makeCard({ name: 'Vampire A', creature_types: JSON.stringify(['Vampire']) });
  const flyer = makeCard({ name: 'Flyer', keywords: JSON.stringify(['Flying']) });
  const profile = buildCollectionProfile([owned(vampire, 2), owned(flyer)]);
  assert.ok(profile.creatureTypes.includes('Vampire'));
  assert.ok(profile.keywords.includes('Flying'));
});

check('Partner-family keywords are not treated as thematic signals', () => {
  // They say who can be your commander, not what the deck wants to do.
  const partnerCards = Array.from({ length: 4 }, (_, i) =>
    makeCard({
      name: `Partner Card ${i}`,
      color_identity: JSON.stringify(['B']),
      keywords: JSON.stringify(['Partner']),
      oracle_text: 'Partner',
    })
  );
  const candidate = makeCard({
    name: 'Partner Candidate',
    color_identity: JSON.stringify(['B']),
    keywords: JSON.stringify(['Partner']),
    oracle_text: 'Creatures you control gain partner.',
  });
  const entries = partnerCards.map((c) => owned(c));
  const suggestions = scoreCommanders([solo(candidate)], buildCollectionProfile(entries), entries);
  assert.deepStrictEqual(
    suggestions.flatMap((s) => s.matchedKeywords),
    []
  );
});

// --- identity + signal gating ----------------------------------------------

check('a candidate with zero color-identity overlap is not suggested', () => {
  const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['W']) });
  const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
  const entries = ownedCards.map((c) => owned(c));
  const suggestions = scoreCommanders([solo(candidate)], buildCollectionProfile(entries), entries);
  assert.strictEqual(suggestions.length, 0);
});

check('a candidate that fits identity but shares no signal is not suggested', () => {
  const ownedCard = makeCard({ color_identity: JSON.stringify(['B']), oracle_text: 'Draw a card.' });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Vanilla text with no matching archetype.',
  });
  const entries = [owned(ownedCard, 2)];
  const suggestions = scoreCommanders([solo(candidate)], buildCollectionProfile(entries), entries);
  assert.strictEqual(suggestions.length, 0);
});

check('a signal below the minimum card-count threshold does not trigger a suggestion', () => {
  const ownedCards = sacrificeCards(2, { color_identity: JSON.stringify(['B']) });
  const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
  const entries = ownedCards.map((c) => owned(c));
  const suggestions = scoreCommanders([solo(candidate)], buildCollectionProfile(entries), entries);
  assert.strictEqual(suggestions.length, 0);
});

check('summed quantity of one card is not enough — the threshold counts distinct cards', () => {
  const sacCard = makeCard({ color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature: Draw a card.' });
  const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
  const entries = [owned(sacCard, 10)];
  const suggestions = scoreCommanders([solo(candidate)], buildCollectionProfile(entries), entries);
  assert.strictEqual(suggestions.length, 0);
});

check('a candidate is suggested once color identity fits and a signal clears the threshold', () => {
  const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
  const entries = ownedCards.map((c) => owned(c));
  const suggestions = scoreCommanders([solo(candidate)], buildCollectionProfile(entries), entries);
  assert.strictEqual(suggestions.length, 1);
  assert.ok(suggestions[0].matchedThemes.includes('Aristocrats'));
  assert.strictEqual(suggestions[0].themeSupport[0].cards.length, 3);
});

check('a signal the candidate does not actively engage with is not scored', () => {
  // The list is sacrifice-heavy; the candidate never mentions it.
  const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const candidate = makeCard({
    name: 'Candidate',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'This card does something else entirely.',
  });
  const entries = ownedCards.map((c) => owned(c));
  const suggestions = scoreCommanders([solo(candidate)], buildCollectionProfile(entries), entries);
  assert.strictEqual(suggestions.length, 0);
});

check('a signal with enough global matches but too few after identity-narrowing is dropped', () => {
  const fitsA = makeCard({ name: 'Fits A', color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature: Draw a card.' });
  const fitsB = makeCard({ name: 'Fits B', color_identity: JSON.stringify(['B']), oracle_text: 'Sacrifice a creature: Draw a card.' });
  const doesNotFit = makeCard({
    name: 'Does Not Fit',
    color_identity: JSON.stringify(['W']),
    oracle_text: 'Sacrifice a creature: Draw a card.',
  });
  const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
  const entries = [owned(fitsA), owned(fitsB), owned(doesNotFit)];
  const profile = buildCollectionProfile(entries);
  // Globally there are 3 Aristocrats cards — enough on its own.
  assert.strictEqual(profile.archetypeCards['aristocrats'].length, 3);
  // But only 2 fit this candidate's identity, so it must not count.
  assert.strictEqual(scoreCommanders([solo(candidate)], profile, entries).length, 0);
});

check("only cards that fit the candidate's color identity count toward includedCardCount", () => {
  const fits = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const doesNotFit = makeCard({
    name: 'Does Not Fit',
    color_identity: JSON.stringify(['W']),
    oracle_text: 'Sacrifice a creature: Draw a card.',
  });
  const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
  const entries = [...fits.map((c) => owned(c)), owned(doesNotFit, 5)];
  const suggestions = scoreCommanders([solo(candidate)], buildCollectionProfile(entries), entries);
  assert.strictEqual(suggestions.length, 1);
  assert.strictEqual(suggestions[0].includedCardCount, 3);
});

// --- "cares, not shares", now enforced by the active-role rule -------------

check('merely being a creature type is not a kindred signal', () => {
  // Silas Renn is a Human whose text never mentions Humans.
  const humans = Array.from({ length: 8 }, (_, i) =>
    makeCard({ name: `Human ${i}`, color_identity: JSON.stringify(['B']), creature_types: JSON.stringify(['Human']) })
  );
  const silas = makeCard({
    name: 'Silas Renn, Seeker Adept',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Human']),
    oracle_text: 'Whenever Silas Renn deals combat damage to a player, choose target artifact card in your graveyard.',
  });
  const entries = humans.map((c) => owned(c));
  const suggestions = scoreCommanders([solo(silas)], buildCollectionProfile(entries), entries);
  assert.deepStrictEqual(
    suggestions.flatMap((s) => s.matchedCreatureTypes),
    []
  );
});

check('a commander whose text calls out the type does match it', () => {
  const goblins = Array.from({ length: 8 }, (_, i) =>
    makeCard({ name: `Goblin ${i}`, color_identity: JSON.stringify(['B']), creature_types: JSON.stringify(['Goblin']) })
  );
  const krenko = makeCard({
    name: 'Krenko, Mob Boss',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Goblin']),
    oracle_text: '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',
  });
  const entries = goblins.map((c) => owned(c));
  const suggestions = scoreCommanders([solo(krenko)], buildCollectionProfile(entries), entries);
  assert.strictEqual(suggestions.length, 1);
  assert.deepStrictEqual(suggestions[0].matchedCreatureTypes, ['Goblin']);
});

check('a name containing a creature type does not make it a kindred commander', () => {
  // Goblin Sharpshooter's only mention of "Goblin" is its own name; its
  // abilities care about creatures dying. Confirmed as a scoring outcome
  // here, not just as a detection detail.
  const goblins = Array.from({ length: 8 }, (_, i) =>
    makeCard({ name: `Goblin ${i}`, color_identity: JSON.stringify(['R']), creature_types: JSON.stringify(['Goblin']) })
  );
  const sharpshooter = makeCard({
    name: 'Goblin Sharpshooter',
    color_identity: JSON.stringify(['R']),
    creature_types: JSON.stringify(['Goblin']),
    oracle_text:
      "Goblin Sharpshooter doesn't untap during your untap step.\n" +
      'Whenever a creature dies, untap Goblin Sharpshooter.',
  });
  const entries = goblins.map((c) => owned(c));
  const suggestions = scoreCommanders([solo(sharpshooter)], buildCollectionProfile(entries), entries);
  assert.deepStrictEqual(
    suggestions.flatMap((s) => s.matchedCreatureTypes),
    []
  );
});

check('token makers count toward a kindred signal', () => {
  // Krenko's Command is a Sorcery with no creature type, but two Goblins is
  // two Goblins.
  const commands = Array.from({ length: 5 }, (_, i) =>
    makeCard({
      name: `Command ${i}`,
      type_line: 'Sorcery',
      color_identity: JSON.stringify(['R']),
      oracle_text: 'Create two 1/1 red Goblin creature tokens.',
    })
  );
  // One real Goblin, so the type is in the list's vocabulary at all.
  const goblin = makeCard({
    name: 'A Goblin',
    color_identity: JSON.stringify(['R']),
    creature_types: JSON.stringify(['Goblin']),
  });
  const krenko = makeCard({
    name: 'Krenko, Mob Boss',
    color_identity: JSON.stringify(['R']),
    creature_types: JSON.stringify(['Goblin']),
    oracle_text: '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',
  });
  const entries = [...commands, goblin].map((c) => owned(c));
  const suggestions = scoreCommanders([solo(krenko)], buildCollectionProfile(entries), entries);
  const kindred = suggestions[0].kindredSupport.find((k) => k.type === 'Goblin');
  assert.ok(kindred);
  // All five Sorceries plus the actual Goblin.
  assert.strictEqual(kindred.cards.length, 6);
});

// --- qualifiers -------------------------------------------------------------

check('a subtype-restricted payoff only counts cards of that subtype', () => {
  // A Sliver-restricted graveyard payoff must not be credited with the
  // non-Sliver creatures in the same list.
  const slivers = Array.from({ length: 4 }, (_, i) =>
    makeCard({
      name: `Sliver ${i}`,
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Sliver']),
      oracle_text: 'Return target creature card from your graveyard to the battlefield.',
    })
  );
  const others = Array.from({ length: 6 }, (_, i) =>
    makeCard({
      name: `Other ${i}`,
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Zombie']),
      oracle_text: 'Return target creature card from your graveyard to the battlefield.',
    })
  );
  const gravemother = makeCard({
    name: 'Sliver Gravemother',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Sliver']),
    oracle_text: 'Sliver spells you cast have encore.',
  });
  const entries = [...slivers, ...others].map((c) => owned(c));
  const suggestions = scoreCommanders([solo(gravemother)], buildCollectionProfile(entries), entries);

  const reanimator = suggestions[0].themeSupport.find((t) => t.label.startsWith('Reanimator'));
  assert.ok(reanimator, JSON.stringify(suggestions[0].themeSupport.map((t) => t.label)));
  assert.strictEqual(reanimator.label, 'Reanimator (Sliver)');
  // The four Slivers, not the ten graveyard cards.
  assert.strictEqual(reanimator.cards.length, 4);
});

// --- scoring measures focus, not color reach -------------------------------

check('identity breadth that adds no matching cards never helps, only dilutes', () => {
  const sac = sacrificeCards(4, { color_identity: JSON.stringify(['B']) });
  const irrelevant = Array.from({ length: 4 }, (_, i) =>
    makeCard({ name: `Irrelevant ${i}`, color_identity: JSON.stringify(['W', 'U']), oracle_text: 'Vanilla text.' })
  );
  const narrowCandidate = sacrificeCommander('Narrow', { color_identity: JSON.stringify(['B']) });
  const wideCandidate = sacrificeCommander('Wide', { color_identity: JSON.stringify(['W', 'U', 'B', 'R', 'G']) });

  const entries = [...sac, ...irrelevant].map((c) => owned(c));
  const profile = buildCollectionProfile(entries);
  const narrow = scoreCommanders([solo(narrowCandidate)], profile, entries);
  const wide = scoreCommanders([solo(wideCandidate)], profile, entries);

  // Narrow: 4/4 density * 20 (Aristocrats) = 20, no depth bonus (4 < 5).
  assert.strictEqual(narrow[0].score, 20);
  // Wide: same 4 matching cards, 8-card castable pool: 4/8 * 20 = 10.
  assert.strictEqual(wide[0].score, 10);
  assert.ok(wide[0].score < narrow[0].score);
});

check('a signal at the deep-synergy floor earns a bonus; one card short does not', () => {
  const atFloor = sacrificeCards(5, { color_identity: JSON.stringify(['B']) }).map((c) => owned(c));
  const belowFloor = sacrificeCards(4, { color_identity: JSON.stringify(['B']) }).map((c) => owned(c));
  const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });

  const at = scoreCommanders([solo(candidate)], buildCollectionProfile(atFloor), atFloor);
  const below = scoreCommanders([solo(candidate)], buildCollectionProfile(belowFloor), belowFloor);
  // Both fully focused, so breadth is 20 either way; only depth differs.
  assert.strictEqual(at[0].score, 21);
  assert.strictEqual(below[0].score, 20);
});

check('one deep synergy outranks a commander with several shallow ones', () => {
  // The case the depth bonus and diminishing returns exist for.
  const landfall = Array.from({ length: 10 }, (_, i) =>
    makeCard({
      name: `Landfall ${i}`,
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Landfall — Whenever a land enters the battlefield under your control, scry 1.',
    })
  );
  const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const counters = Array.from({ length: 3 }, (_, i) =>
    makeCard({ name: `Counter ${i}`, color_identity: JSON.stringify(['B']), oracle_text: 'Put a +1/+1 counter on target creature.' })
  );
  const spells = Array.from({ length: 3 }, (_, i) =>
    makeCard({ name: `Spell ${i}`, color_identity: JSON.stringify(['B']), oracle_text: 'Whenever you cast an instant spell, scry 1.' })
  );
  const filler = Array.from({ length: 31 }, (_, i) =>
    makeCard({ name: `Filler ${i}`, color_identity: JSON.stringify(['B']), oracle_text: 'This card does something else entirely.' })
  );

  const deep = makeCard({
    name: 'Landfall Deep',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Landfall — Whenever a land enters the battlefield under your control, draw a card.',
  });
  const shallow = makeCard({
    name: 'Generic Spread',
    color_identity: JSON.stringify(['B']),
    oracle_text:
      'Sacrifice a creature: Draw a card. Put a +1/+1 counter on target creature. Whenever you cast an instant spell, scry 1.',
  });

  const entries = [...landfall, ...sac, ...counters, ...spells, ...filler].map((c) => owned(c));
  assert.strictEqual(entries.length, 50);
  const suggestions = scoreCommanders([solo(deep), solo(shallow)], buildCollectionProfile(entries), entries);

  assert.strictEqual(suggestions[0].cards[0].name, 'Landfall Deep');
  assert.ok(suggestions[0].score > suggestions[1].score);
  // Deep: breadth 10/50*20 = 4, depth (10-5+1) = 6 -> 10.
  assert.strictEqual(suggestions[0].score, 10);
});

check('suggestions are sorted by score, highest first', () => {
  const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const vampires = Array.from({ length: 3 }, (_, i) =>
    makeCard({
      name: `Vampire ${i}`,
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Vampire']),
    })
  );
  const weak = sacrificeCommander('Weak', { color_identity: JSON.stringify(['B']) });
  const strong = makeCard({
    name: 'Strong',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Vampire']),
    oracle_text: 'Sacrifice a creature: Draw a card. Other Vampires you control get +1/+1.',
  });
  const entries = [...sac, ...vampires].map((c) => owned(c));
  const suggestions = scoreCommanders([solo(weak), solo(strong)], buildCollectionProfile(entries), entries);
  assert.strictEqual(suggestions.length, 2);
  assert.strictEqual(suggestions[0].cards[0].name, 'Strong');
  assert.ok(suggestions[0].score > suggestions[1].score);
});

// --- Partner-pair union semantics (702.124e) -------------------------------

check("a pair's color identity is the union of both cards, not either alone", () => {
  const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['U']) });
  const partnerA = makeCard({ name: 'A', color_identity: JSON.stringify(['U']) });
  const partnerB = sacrificeCommander('B', { color_identity: JSON.stringify(['B']) });
  const entries = ownedCards.map((c) => owned(c));
  const suggestions = scoreCommanders([{ cards: [partnerA, partnerB] }], buildCollectionProfile(entries), entries);
  assert.strictEqual(suggestions.length, 1);
  assert.deepStrictEqual(suggestions[0].cards.map((c) => c.name).sort(), ['A', 'B']);
});

check("a pair matches a signal that only one half's own text shows", () => {
  const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const silent = makeCard({ name: 'Silent Half', color_identity: JSON.stringify(['B']), oracle_text: '' });
  const vocal = sacrificeCommander('Vocal Half', { color_identity: JSON.stringify(['B']) });
  const entries = ownedCards.map((c) => owned(c));
  const suggestions = scoreCommanders([{ cards: [silent, vocal] }], buildCollectionProfile(entries), entries);
  assert.strictEqual(suggestions.length, 1);
  assert.ok(suggestions[0].matchedThemes.includes('Aristocrats'));
});

check('a pair matches a creature type only one half cares about (702.124e)', () => {
  const slivers = Array.from({ length: 8 }, (_, i) =>
    makeCard({ name: `Sliver ${i}`, color_identity: JSON.stringify(['B']), creature_types: JSON.stringify(['Sliver']) })
  );
  const silent = makeCard({ name: 'Silent Half', color_identity: JSON.stringify(['B']), oracle_text: 'Draw a card.' });
  const caring = makeCard({
    name: 'The First Sliver',
    color_identity: JSON.stringify(['B']),
    oracle_text: 'Sliver spells you cast have cascade.',
  });
  const entries = slivers.map((c) => owned(c));
  const suggestions = scoreCommanders([{ cards: [silent, caring] }], buildCollectionProfile(entries), entries);
  assert.deepStrictEqual(suggestions[0]?.matchedCreatureTypes, ['Sliver']);
});

check('a pair does not match a creature type it merely has', () => {
  const vampiresOwned = Array.from({ length: 3 }, (_, i) =>
    makeCard({
      name: `Owned Vampire ${i}`,
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Vampire']),
    })
  );
  const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
  const nonVampireHalf = sacrificeCommander('Non-Vampire Half', { color_identity: JSON.stringify(['B']) });
  const vampireHalf = makeCard({
    name: 'Vampire Half',
    color_identity: JSON.stringify(['B']),
    creature_types: JSON.stringify(['Vampire']),
  });
  const entries = [...vampiresOwned, ...sac].map((c) => owned(c));
  const suggestions = scoreCommanders(
    [{ cards: [nonVampireHalf, vampireHalf] }],
    buildCollectionProfile(entries),
    entries
  );
  assert.strictEqual(suggestions.length, 1);
  assert.ok(suggestions[0].matchedThemes.includes('Aristocrats'));
  assert.ok(!suggestions[0].matchedCreatureTypes.includes('Vampire'));
});

// --- selecting which suggestions are worth showing ------------------------

/** A scored suggestion with the given signal sizes, for selection tests. */
function suggestionWithSignals(sizes: number[], score = 5): CommanderSuggestion {
  const cards = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      name: `Card ${i}`,
      quantity: 1,
      typeLine: null,
      isGameChanger: false,
      manaValue: null,
      manaCost: null,
      imageUri: null,
      backImageUri: null,
      backName: null,
      scryfallUri: null,
    }));
  return {
    cards: [makeCard({ name: `Unit ${counter++}` })],
    score,
    matchedThemes: [],
    matchedCreatureTypes: [],
    matchedKeywords: [],
    includedCardCount: 50,
    themeSupport: sizes.map((n, i) => ({
      key: `t${i}`,
      label: `Theme ${i}`,
      description: '',
      cards: cards(n),
    })),
    kindredSupport: [],
    keywordSupport: [],
    gameChangerCards: [],
  };
}

check('a single bare-minimum signal is not worth showing', () => {
  // The case this exists for: a real graveyard list returned 877 commanders
  // that all matched one archetype on the same three cards, scoring 3.3 to
  // 5.0. They are indistinguishable because they are all just "a commander
  // that sacrifices creatures".
  const noise = Array.from({ length: 20 }, () => suggestionWithSignals([3]));
  const result = selectSuggestions(noise);
  assert.strictEqual(result.weakMatchesOnly, true);
});

check('one deep signal is enough on its own', () => {
  const deep = suggestionWithSignals([5]);
  const result = selectSuggestions([deep, suggestionWithSignals([3])]);
  assert.strictEqual(result.weakMatchesOnly, false);
  assert.strictEqual(result.suggestions.length, 1);
});

check('two shallow signals are enough on their own', () => {
  const broad = suggestionWithSignals([3, 3]);
  const result = selectSuggestions([broad, suggestionWithSignals([3])]);
  assert.strictEqual(result.weakMatchesOnly, false);
  assert.strictEqual(result.suggestions.length, 1);
});

check('nothing worth showing falls back to a short flagged list, not an empty page', () => {
  // An empty result would be technically defensible and useless. The caller
  // gets the closest few, flagged, so it can say the pattern was weak.
  const noise = Array.from({ length: 400 }, (_, i) => suggestionWithSignals([3], 5 - i * 0.001));
  const result = selectSuggestions(noise);
  assert.strictEqual(result.weakMatchesOnly, true);
  assert.strictEqual(result.suggestions.length, 12);
  // Still the best of a bad lot, in order.
  assert.ok(result.suggestions[0].score > result.suggestions[11].score);
});

check('selection is not a cap — a list with real depth keeps everything', () => {
  const many = Array.from({ length: 500 }, () => suggestionWithSignals([8]));
  const result = selectSuggestions(many);
  assert.strictEqual(result.weakMatchesOnly, false);
  assert.strictEqual(result.suggestions.length, 500);
});

check('an empty input stays empty rather than reporting weak matches', () => {
  const result = selectSuggestions([]);
  assert.strictEqual(result.suggestions.length, 0);
  assert.strictEqual(result.weakMatchesOnly, true);
});

if (failures > 0) {
  console.error(`\n${failures} synergy cases failed.`);
  process.exit(1);
}
console.log('\nAll synergy cases passed.');
