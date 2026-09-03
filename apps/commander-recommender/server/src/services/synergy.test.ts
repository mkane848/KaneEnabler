/**
 * Tests for the scorer: profiling a collection and ranking commanders
 * against it.
 *
 * What counts as a synergy is tested in signals.test.ts — this file is about
 * what the scorer does with signals once they exist, so the cards here are
 * mostly minimal shapes rather than real cards.
 */
import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { CardRow } from '../types';
import type { CommanderUnit } from './partners';
import { buildCardFacts, buildVocabulary, detectSignals, type SignalMatch } from './signals';
import {
  buildCollectionProfile,
  evidenceStrength,
  scoreCommanders,
  selectSuggestions,
  type CommanderSuggestion,
  type OwnedCard,
} from './synergy';

/**
 * Stands in for the precomputed `card_signals` table this file has no
 * database to query (see db.ts's findSignalsByOracleIds, and
 * rules-audit.md item 9 on why the scorer reads it instead of recomputing
 * per request). Built the same way import-scryfall.ts populates that table:
 * facts + signals against a vocabulary that is *not* scoped to the owned
 * list. `creatureTypes`/`keywords` stand in for the full game's catalog —
 * pass whichever the candidate's own text needs to discover a type or
 * keyword it doesn't already carry structurally (a card's own
 * `creature_types`/token-production are recognized regardless of
 * vocabulary; only a bare textual mention needs the word to be "known").
 */
function candidateSignalsFor(
  units: CommanderUnit[],
  creatureTypes: string[] = [],
  keywords: string[] = [],
): Map<string, SignalMatch[]> {
  const vocab = buildVocabulary(creatureTypes, keywords);
  const map = new Map<string, SignalMatch[]>();
  for (const unit of units) {
    for (const card of unit.cards) {
      map.set(card.oracle_id, detectSignals(buildCardFacts(card, vocab), vocab));
    }
  }
  return map;
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
    is_changeling: 0,
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

/** Both an outlet and a payoff, so the archetype clears `definingRequirement`
 * (Aristocrats' identity is `rewards`) as well as MIN_SIGNAL_COUNT — a pile of
 * fodder-sacrificing cards with nothing rewarding the death is not an
 * Aristocrats deck (see archetypes.md). */
const SACRIFICE_TEXT =
  'Sacrifice a creature: Scry 1.\nWhenever a creature you control dies, you gain 1 life.';

/** N distinct sacrifice outlets. The signal threshold counts distinct citable
 * cards, so "enough signal" means enough different cards, not enough copies. */
function sacrificeCards(n: number, overrides: Partial<CardRow> = {}): CardRow[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard({ name: `Sac ${i}`, oracle_text: SACRIFICE_TEXT, ...overrides }),
  );
}

/** A commander that sacrifices creatures — an active Aristocrats role. */
function sacrificeCommander(name = 'Candidate', overrides: Partial<CardRow> = {}): CardRow {
  return makeCard({ name, oracle_text: SACRIFICE_TEXT, ...overrides });
}

describe('buildCollectionProfile', () => {
  it('counts colors, weighted by quantity', () => {
    const black = makeCard({ color_identity: JSON.stringify(['B']) });
    const profile = buildCollectionProfile([owned(black, 3)]);
    assert.strictEqual(profile.colorCounts['B'], 3);
    assert.strictEqual(profile.totalCards, 3);
  });

  it('collects the vocabulary present in the list', () => {
    const vampire = makeCard({ name: 'Vampire A', creature_types: JSON.stringify(['Vampire']) });
    const flyer = makeCard({ name: 'Flyer', keywords: JSON.stringify(['Flying']) });
    const profile = buildCollectionProfile([owned(vampire, 2), owned(flyer)]);
    assert.ok(profile.creatureTypes.includes('Vampire'));
    assert.ok(profile.keywords.includes('Flying'));
  });

  it('memoizes: the same list returns the same profile instance, and any change in a row differs', () => {
    const cardA = makeCard({ name: 'Memo A', color_identity: JSON.stringify(['B']) });
    const cardB = makeCard({ name: 'Memo B', color_identity: JSON.stringify(['B']) });
    const entries = [owned(cardA), owned(cardB)];

    const first = buildCollectionProfile(entries);
    const second = buildCollectionProfile(entries);
    assert.strictEqual(first, second);

    // A different body under the same oracle_id must not collide with the
    // cached entry — the key covers the full row, not just its id.
    const changed = buildCollectionProfile([
      owned({ ...cardA, oracle_text: 'Draw a card.' }),
      owned(cardB),
    ]);
    assert.notStrictEqual(changed, first);
  });

  it('Partner-family keywords are not treated as thematic signals', () => {
    // They say who can be your commander, not what the deck wants to do.
    const partnerCards = Array.from({ length: 4 }, (_, i) =>
      makeCard({
        name: `Partner Card ${i}`,
        color_identity: JSON.stringify(['B']),
        keywords: JSON.stringify(['Partner']),
        oracle_text: 'Partner',
      }),
    );
    const candidate = makeCard({
      name: 'Partner Candidate',
      color_identity: JSON.stringify(['B']),
      keywords: JSON.stringify(['Partner']),
      oracle_text: 'Creatures you control gain partner.',
    });
    const entries = partnerCards.map((c) => owned(c));
    const units = [solo(candidate)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units, [], ['Partner']),
    );
    assert.deepStrictEqual(
      suggestions.flatMap((s) => s.matchedKeywords),
      [],
    );
  });
});

describe('identity + signal gating', () => {
  it('a candidate with zero color-identity overlap is not suggested', () => {
    const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['W']) });
    const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
    const entries = ownedCards.map((c) => owned(c));
    const units = [solo(candidate)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 0);
  });

  it('a candidate that fits identity but shares no signal is not suggested', () => {
    const ownedCard = makeCard({
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Draw a card.',
    });
    const candidate = makeCard({
      name: 'Candidate',
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Vanilla text with no matching archetype.',
    });
    const entries = [owned(ownedCard, 2)];
    const units = [solo(candidate)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 0);
  });

  it('a signal below the minimum card-count threshold does not trigger a suggestion', () => {
    const ownedCards = sacrificeCards(2, { color_identity: JSON.stringify(['B']) });
    const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
    const entries = ownedCards.map((c) => owned(c));
    const units = [solo(candidate)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 0);
  });

  it('minSignalCount relaxes the threshold without touching the default', () => {
    // The exact case coverage.ts's Tier B relies on: two supporters clear a
    // relaxed bar of 1 but not the default of 3.
    const ownedCards = sacrificeCards(2, { color_identity: JSON.stringify(['B']) });
    const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
    const entries = ownedCards.map((c) => owned(c));
    const units = [solo(candidate)];
    const signals = candidateSignalsFor(units);

    assert.strictEqual(
      scoreCommanders(units, buildCollectionProfile(entries), entries, signals).length,
      0,
    );

    const relaxed = scoreCommanders(units, buildCollectionProfile(entries), entries, signals, {
      minSignalCount: 1,
    });
    assert.strictEqual(relaxed.length, 1);
    assert.ok(relaxed[0]!.matchedThemes.includes('Aristocrats'));
    assert.strictEqual(relaxed[0]!.themeSupport[0]!.cards.length, 2);
  });

  it('summed quantity of one card is not enough — the threshold counts distinct cards', () => {
    const sacCard = makeCard({
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Sacrifice a creature: Draw a card.',
    });
    const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
    const entries = [owned(sacCard, 10)];
    const units = [solo(candidate)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 0);
  });

  it('a candidate is suggested once color identity fits and a signal clears the threshold', () => {
    const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
    const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
    const entries = ownedCards.map((c) => owned(c));
    const units = [solo(candidate)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 1);
    assert.ok(suggestions[0]!.matchedThemes.includes('Aristocrats'));
    assert.strictEqual(suggestions[0]!.themeSupport[0]!.cards.length, 3);
    // Unqualified case: archetype and archetypeLabel agree, and there's no
    // qualifier — the same structured shape a qualified match uses, just
    // with qualifier absent.
    assert.strictEqual(suggestions[0]!.themeSupport[0]!.archetype, 'aristocrats');
    assert.strictEqual(suggestions[0]!.themeSupport[0]!.archetypeLabel, 'Aristocrats');
    assert.strictEqual(suggestions[0]!.themeSupport[0]!.qualifier, undefined);
  });

  it('citedOracleIds names the cards actually cited, not every identity-fitting card', () => {
    const cited = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
    // Fits the candidate's identity but supports nothing — included in
    // includedCardCount, but must not show up in citedOracleIds.
    const uncited = makeCard({
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Draw a card.',
    });
    const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
    const entries = [...cited, uncited].map((c) => owned(c));
    const units = [solo(candidate)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 1);
    assert.strictEqual(suggestions[0]!.includedCardCount, 4);
    assert.deepStrictEqual(
      [...suggestions[0]!.citedOracleIds].sort(),
      cited.map((c) => c.oracle_id).sort(),
    );
  });

  it('a signal the candidate does not actively engage with is not scored', () => {
    // The list is sacrifice-heavy; the candidate never mentions it.
    const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
    const candidate = makeCard({
      name: 'Candidate',
      color_identity: JSON.stringify(['B']),
      oracle_text: 'This card does something else entirely.',
    });
    const entries = ownedCards.map((c) => owned(c));
    const units = [solo(candidate)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 0);
  });

  it('a signal with enough global matches but too few after identity-narrowing is dropped', () => {
    const fitsA = makeCard({
      name: 'Fits A',
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Sacrifice a creature: Draw a card.',
    });
    const fitsB = makeCard({
      name: 'Fits B',
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Sacrifice a creature: Draw a card.',
    });
    const doesNotFit = makeCard({
      name: 'Does Not Fit',
      color_identity: JSON.stringify(['W']),
      oracle_text: 'Sacrifice a creature: Draw a card.',
    });
    const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
    const entries = [owned(fitsA), owned(fitsB), owned(doesNotFit)];
    const profile = buildCollectionProfile(entries);
    // Globally there are 3 Aristocrats cards — enough on its own.
    assert.strictEqual(profile.archetypeCards['aristocrats']!.length, 3);
    // But only 2 fit this candidate's identity, so it must not count.
    const narrowingUnits = [solo(candidate)];
    assert.strictEqual(
      scoreCommanders(narrowingUnits, profile, entries, candidateSignalsFor(narrowingUnits)).length,
      0,
    );
  });

  it("only cards that fit the candidate's color identity count toward includedCardCount", () => {
    const fits = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
    const doesNotFit = makeCard({
      name: 'Does Not Fit',
      color_identity: JSON.stringify(['W']),
      oracle_text: 'Sacrifice a creature: Draw a card.',
    });
    const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
    const entries = [...fits.map((c) => owned(c)), owned(doesNotFit, 5)];
    const units = [solo(candidate)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 1);
    assert.strictEqual(suggestions[0]!.includedCardCount, 3);
  });
});

describe('"cares, not shares", now enforced by the active-role rule', () => {
  it('merely being a creature type is not a kindred signal', () => {
    // Silas Renn is a Human whose text never mentions Humans.
    const humans = Array.from({ length: 8 }, (_, i) =>
      makeCard({
        name: `Human ${i}`,
        color_identity: JSON.stringify(['B']),
        creature_types: JSON.stringify(['Human']),
      }),
    );
    const silas = makeCard({
      name: 'Silas Renn, Seeker Adept',
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Human']),
      oracle_text:
        'Whenever Silas Renn deals combat damage to a player, choose target artifact card in your graveyard.',
    });
    const entries = humans.map((c) => owned(c));
    const units = [solo(silas)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.deepStrictEqual(
      suggestions.flatMap((s) => s.matchedCreatureTypes),
      [],
    );
  });

  it('a commander whose text calls out the type does match it', () => {
    const goblins = Array.from({ length: 8 }, (_, i) =>
      makeCard({
        name: `Goblin ${i}`,
        color_identity: JSON.stringify(['B']),
        creature_types: JSON.stringify(['Goblin']),
        // Two lords among the plain bodies clear kindred's own two-card
        // minimum on cares-not-shares — membership alone (the other six) is
        // not enough to call this a tribal deck.
        oracle_text: i < 2 ? 'Other Goblins you control get +1/+1.' : '',
      }),
    );
    const krenko = makeCard({
      name: 'Krenko, Mob Boss',
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Goblin']),
      oracle_text:
        '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',
    });
    const entries = goblins.map((c) => owned(c));
    const units = [solo(krenko)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 1);
    assert.deepStrictEqual(suggestions[0]!.matchedCreatureTypes, ['Goblin']);
  });

  it('a name containing a creature type does not make it a kindred commander', () => {
    // Goblin Sharpshooter's only mention of "Goblin" is its own name; its
    // abilities care about creatures dying. Confirmed as a scoring outcome
    // here, not just as a detection detail.
    const goblins = Array.from({ length: 8 }, (_, i) =>
      makeCard({
        name: `Goblin ${i}`,
        color_identity: JSON.stringify(['R']),
        creature_types: JSON.stringify(['Goblin']),
      }),
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
    const units = [solo(sharpshooter)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.deepStrictEqual(
      suggestions.flatMap((s) => s.matchedCreatureTypes),
      [],
    );
  });

  it('token makers count toward a kindred signal', () => {
    // Krenko's Command is a Sorcery with no creature type, but two Goblins is
    // two Goblins.
    const commands = Array.from({ length: 5 }, (_, i) =>
      makeCard({
        name: `Command ${i}`,
        type_line: 'Sorcery',
        color_identity: JSON.stringify(['R']),
        // Two of the five also reward, clearing kindred's own two-card
        // minimum on cares-not-shares — production alone is membership, not
        // caring.
        oracle_text:
          i < 2
            ? 'Create two 1/1 red Goblin creature tokens. Goblins you control get +1/+0.'
            : 'Create two 1/1 red Goblin creature tokens.',
      }),
    );
    // A real Goblin too, so it's not just the five Sorceries citable as
    // support for the signal.
    const goblin = makeCard({
      name: 'A Goblin',
      color_identity: JSON.stringify(['R']),
      creature_types: JSON.stringify(['Goblin']),
    });
    const krenko = makeCard({
      name: 'Krenko, Mob Boss',
      color_identity: JSON.stringify(['R']),
      creature_types: JSON.stringify(['Goblin']),
      oracle_text:
        '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',
    });
    const entries = [...commands, goblin].map((c) => owned(c));
    const units = [solo(krenko)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    const kindred = suggestions[0]!.kindredSupport.find((k) => k.type === 'Goblin');
    assert.ok(kindred);
    // All five Sorceries plus the actual Goblin.
    assert.strictEqual(kindred.cards.length, 6);
  });
});

describe("kindred's own wildcard is gated by real depth", () => {
  // Regression coverage for a severe corpus-verified bug: `ownSignalContains`
  // lets a "choose a creature type" card support any kindred qualifier, which
  // is correct in principle — but left ungated at the scoring layer, a
  // handful of wildcard cards backed *every* kindred-caring commander in the
  // whole pool at once. Against the real First Sliver decklist (8 wildcard
  // cards, real Sliver depth only), commanders for types the deck owned zero
  // real cards of — Kithkin, Ooze, Mercenary, Archer — scored "8 supporting
  // cards" apiece before the gate below (gateWildcardKindredSupporters,
  // synergy.ts) was added. See also deckAnalysis.ts's groupByTheme, which
  // gates the same relation for the deck-summary reading of this bug.
  const wildcardCard = (name: string) =>
    makeCard({
      name,
      type_line: 'Artifact',
      color_identity: JSON.stringify(['G']),
      oracle_text:
        'As this artifact enters, choose a creature type.\n' +
        'Creatures you control of the chosen type get +1/+1.',
    });

  it('a wildcard card alone does not back a commander for a type the list has no real members of', () => {
    const oozeLord = makeCard({
      name: 'Ooze Lord',
      color_identity: JSON.stringify(['G']),
      creature_types: JSON.stringify(['Ooze']),
      oracle_text: 'Other Oozes you control get +1/+1.',
    });
    const wildcards = Array.from({ length: 3 }, (_, i) => wildcardCard(`Wildcard ${i}`));
    const entries = wildcards.map((c) => owned(c));
    const units = [solo(oozeLord)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    // No real Ooze in the list, so the wildcard cards alone must not clear
    // even MIN_SIGNAL_COUNT for an Ooze signal — the commander gets no
    // suggestion at all, not a weak one.
    assert.deepStrictEqual(suggestions, []);
  });

  it('a wildcard card joins once the list already has real depth in that type', () => {
    const oozeLord = makeCard({
      name: 'Ooze Lord',
      color_identity: JSON.stringify(['G']),
      creature_types: JSON.stringify(['Ooze']),
      oracle_text: 'Other Oozes you control get +1/+1.',
    });
    const oozes = Array.from({ length: 3 }, (_, i) =>
      makeCard({
        name: `Ooze ${i}`,
        color_identity: JSON.stringify(['G']),
        creature_types: JSON.stringify(['Ooze']),
      }),
    );
    const wildcards = Array.from({ length: 2 }, (_, i) => wildcardCard(`Wildcard ${i}`));
    const entries = [...oozes, ...wildcards].map((c) => owned(c));
    const units = [solo(oozeLord)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    const kindred = suggestions[0]!.kindredSupport.find((k) => k.type === 'Ooze');
    assert.ok(kindred);
    // The three real Oozes plus both wildcard cards.
    assert.strictEqual(kindred.cards.length, 5);
  });
});

describe('Changeling backs any kindred qualifier at the normal minimum, with no depth gate', () => {
  // Contrast with the wildcard gate above: `detectKindred` emits a
  // Changeling card's signal unqualified (`is` only), not `qualifier: '*'`,
  // so `gateWildcardKindredSupporters` never touches it at all — it rides
  // `ownSignalContains`'s pre-existing, already-shipped undefined-qualifier
  // branch instead, the same one Wilhelt's unqualified reanimation spell
  // uses. That is deliberate, not an oversight: "this card is every
  // creature type" (CR 702.73a) is unconditionally true of the printed
  // card, not a guess about a choice the player hasn't made yet, so there
  // is nothing here that needs gating the way a wildcard card's *eventual*
  // chosen type does.
  const changelingCard = (name: string) =>
    makeCard({
      name,
      type_line: 'Creature — Shapeshifter',
      color_identity: JSON.stringify(['G']),
      creature_types: JSON.stringify(['Shapeshifter']),
      keywords: JSON.stringify(['Changeling']),
      is_changeling: 1,
      oracle_text:
        'Changeling (This card is every creature type.)\n' +
        'When this creature enters, draw a card.',
    });

  it('a Changeling card joins a qualifier at the normal minimum, no extra depth required', () => {
    const oozeLord = makeCard({
      name: 'Ooze Lord',
      color_identity: JSON.stringify(['G']),
      creature_types: JSON.stringify(['Ooze']),
      oracle_text: 'Other Oozes you control get +1/+1.',
    });
    // Kindred's own defining requirement needs cards that CARE (`rewards`),
    // not just members — two real Ooze payoffs clear it on their own, same
    // as `oozeLord`'s own text.
    const oozes = Array.from({ length: 2 }, (_, i) =>
      makeCard({
        name: `Ooze Payoff ${i}`,
        color_identity: JSON.stringify(['G']),
        creature_types: JSON.stringify(['Ooze']),
        oracle_text: 'Whenever an Ooze you control dies, draw a card.',
      }),
    );
    const changeling = changelingCard('A Changeling');
    const entries = [...oozes, changeling].map((c) => owned(c));
    const units = [solo(oozeLord)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    const kindred = suggestions[0]!.kindredSupport.find((k) => k.type === 'Ooze');
    assert.ok(kindred);
    // The two real Oozes plus the one changeling — exactly MIN_SIGNAL_COUNT,
    // no extra bodies needed first.
    assert.strictEqual(kindred.cards.length, 3);
    assert.ok(kindred.cards.some((c) => c.name === 'A Changeling'));
  });

  it('a Changeling card alone still cannot clear MIN_SIGNAL_COUNT by itself', () => {
    const oozeLord = makeCard({
      name: 'Ooze Lord',
      color_identity: JSON.stringify(['G']),
      creature_types: JSON.stringify(['Ooze']),
      oracle_text: 'Other Oozes you control get +1/+1.',
    });
    const entries = [changelingCard('A Changeling')].map((c) => owned(c));
    const units = [solo(oozeLord)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.deepStrictEqual(suggestions, []);
  });
});

describe('qualifiers', () => {
  it('a subtype-restricted payoff still counts generic support, but not a bystander', () => {
    // A Sliver-restricted graveyard payoff is backed by every unrestricted
    // reanimation spell in the list, whatever creature type they happen to
    // be printed as — none of them names Sliver, so none of them is choosy
    // about what they bring back (docs/signals-rework.md's "unqualified
    // supports qualified" — the same relation that lets Wilhelt's generic
    // reanimation spells back "Reanimator (Zombie)"). A card with no
    // reanimator participation at all is not pulled in just for sharing a
    // creature type.
    const slivers = Array.from({ length: 4 }, (_, i) =>
      makeCard({
        name: `Sliver ${i}`,
        color_identity: JSON.stringify(['B']),
        creature_types: JSON.stringify(['Sliver']),
        oracle_text: 'Return target creature card from your graveyard to the battlefield.',
      }),
    );
    const others = Array.from({ length: 6 }, (_, i) =>
      makeCard({
        name: `Other ${i}`,
        color_identity: JSON.stringify(['B']),
        creature_types: JSON.stringify(['Zombie']),
        oracle_text: 'Return target creature card from your graveyard to the battlefield.',
      }),
    );
    const bystander = makeCard({
      name: 'Bystander',
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Zombie']),
      oracle_text: 'Vigilance',
    });
    const gravemother = makeCard({
      name: 'Sliver Gravemother',
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Sliver']),
      oracle_text: 'Sliver spells you cast have encore.',
    });
    const entries = [...slivers, ...others, bystander].map((c) => owned(c));
    const units = [solo(gravemother)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      // The qualifier ("(Sliver)") is found by scanning the payoff clause's
      // own words against the vocabulary directly — unlike plain kindred
      // membership, it doesn't fall back to the card's structural
      // creature_types, so Sliver has to be a known word here too.
      candidateSignalsFor(units, ['Sliver']),
    );

    const reanimator = suggestions[0]!.themeSupport.find((t) => t.label.startsWith('Reanimator'));
    assert.ok(reanimator, JSON.stringify(suggestions[0]!.themeSupport.map((t) => t.label)));
    assert.strictEqual(reanimator.label, 'Reanimator (Sliver)');
    // All ten unrestricted reanimation spells, but not the vanilla bystander.
    assert.strictEqual(reanimator.cards.length, 10);
    assert.ok(!reanimator.cards.some((c) => c.name === 'Bystander'));
    // archetype/qualifier are structured fields the client groups qualified
    // labels by, rather than parsing "Reanimator (Sliver)" back apart —
    // archetypeLabel stays the stable unqualified name even though this
    // particular match is qualified.
    assert.strictEqual(reanimator.archetype, 'reanimator');
    assert.strictEqual(reanimator.qualifier, 'Sliver');
    assert.strictEqual(reanimator.archetypeLabel, 'Reanimator');
  });

  // cardType and permanentSubtype narrowing (supporterMatches, synergy.ts)
  // have no consuming archetype yet — that's Phase C1's copyEffects and
  // artifacts. Exercised directly here, against a real archetype's real
  // detection (aristocrats), with a qualifier hand-attached to the
  // candidate's signal the way a future archetype would set one.
  it('a cardType qualifier still counts an unrestricted supporter, but not a bystander', () => {
    const copyMakers = (n: number, typeLine: string) =>
      Array.from({ length: n }, (_, i) =>
        makeCard({
          name: `${typeLine} Copier ${i}`,
          type_line: typeLine,
          color_identity: JSON.stringify(['U']),
          oracle_text:
            "Create a token that's a copy of target artifact.\nWhenever a creature you control dies, you gain 1 life.",
        }),
      );
    const instants = copyMakers(3, 'Instant');
    const sorceries = copyMakers(3, 'Sorcery');
    const bystander = makeCard({
      name: 'Bystander',
      type_line: 'Instant',
      color_identity: JSON.stringify(['U']),
      oracle_text: 'Draw a card.',
    });
    const candidate = makeCard({ name: 'Candidate', color_identity: JSON.stringify(['U']) });
    const entries = [...instants, ...sorceries, bystander].map((c) => owned(c));
    const units = [solo(candidate)];
    const signal: SignalMatch = {
      archetype: 'aristocrats',
      label: 'Aristocrats (Instant)',
      description: '',
      weight: 20,
      qualifier: 'Instant',
      qualifierKind: 'cardType',
      roles: ['rewards'],
    };
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      new Map([[candidate.oracle_id, [signal]]]),
    );
    const support = suggestions[0]!.themeSupport.find((t) => t.label === 'Aristocrats (Instant)');
    assert.ok(support);
    // Neither the Instants nor the Sorceries name a card type of their own —
    // both are unqualified Aristocrats participants, so both back the
    // hand-attached "(Instant)" qualifier. The Bystander plays no Aristocrats
    // role at all and is not pulled in just for being an Instant.
    assert.strictEqual(support.cards.length, 6);
    assert.ok(!support.cards.some((c) => c.name === 'Bystander'));
  });

  it('a permanentSubtype qualifier still counts an unrestricted supporter, but not a bystander', () => {
    const copyMakers = (n: number, typeLine: string) =>
      Array.from({ length: n }, (_, i) =>
        makeCard({
          name: `${typeLine} Copier ${i}`,
          type_line: typeLine,
          color_identity: JSON.stringify(['U']),
          oracle_text:
            "Create a token that's a copy of target artifact.\nWhenever a creature you control dies, you gain 1 life.",
        }),
      );
    const vehicles = copyMakers(3, 'Artifact — Vehicle');
    const others = copyMakers(3, 'Artifact');
    const bystander = makeCard({
      name: 'Bystander',
      type_line: 'Artifact — Vehicle',
      color_identity: JSON.stringify(['U']),
      oracle_text: 'Crew 2',
    });
    const candidate = makeCard({ name: 'Candidate', color_identity: JSON.stringify(['U']) });
    const entries = [...vehicles, ...others, bystander].map((c) => owned(c));
    const units = [solo(candidate)];
    const signal: SignalMatch = {
      archetype: 'aristocrats',
      label: 'Aristocrats (Vehicle)',
      description: '',
      weight: 20,
      qualifier: 'Vehicle',
      qualifierKind: 'permanentSubtype',
      roles: ['rewards'],
    };
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      new Map([[candidate.oracle_id, [signal]]]),
    );
    const support = suggestions[0]!.themeSupport.find((t) => t.label === 'Aristocrats (Vehicle)');
    assert.ok(support);
    // Neither group names a permanent subtype of its own — both are
    // unqualified Aristocrats participants, so both back the hand-attached
    // "(Vehicle)" qualifier. The Bystander plays no Aristocrats role at all
    // and is not pulled in just for being a Vehicle.
    assert.strictEqual(support.cards.length, 6);
    assert.ok(!support.cards.some((c) => c.name === 'Bystander'));
  });

  it('a kindred-borrowed qualifier does NOT count an unrestricted supporter — only the type itself, or a card that shares the exact qualifier', () => {
    // Unlike the cardType/permanentSubtype cases above (and every qualifier
    // read off the archetype's own text, like Reanimator (Sliver)), a
    // qualifier borrowed from this same card's kindred signal — Ajani, Nacatl
    // Pariah's Go-Wide Combat (Cat), for instance — is weaker, inferred
    // evidence: the commander's own goWide text never said "Cat" at all. An
    // unrelated token-maker sharing the bare, unqualified archetype must not
    // count just because it "shares" go-wide the way Wilhelt's unrestricted
    // reanimation spells share Reanimator.
    // A card with NO role in the archetype at all never enters its supporter
    // bucket in the first place (`buildCollectionProfile` only buckets a card
    // under an archetype it has some signal for), so the structural
    // "is/produces this type" fallback only ever rescues a card that already
    // has *some* goWide role of its own — just not one naming Cat. These Cats
    // make an unrelated token (produces, no reward), same shape a real Ajani
    // pool would actually contain.
    const cats = Array.from({ length: 3 }, (_, i) =>
      makeCard({
        name: `Cat ${i}`,
        color_identity: JSON.stringify(['W']),
        creature_types: JSON.stringify(['Cat']),
        oracle_text: 'Create a 1/1 white Soldier creature token.',
      }),
    );
    const genericTokenMakers = Array.from({ length: 3 }, (_, i) =>
      makeCard({
        name: `Generic Token Maker ${i}`,
        color_identity: JSON.stringify(['W']),
        oracle_text: 'Create a 1/1 white Soldier creature token.\nCreatures you control get +1/+1.',
      }),
    );
    const ownQualified = makeCard({
      name: 'Own Cat Payoff',
      color_identity: JSON.stringify(['W']),
      oracle_text: 'Create a 1/1 white Soldier creature token.\nOther Cats you control get +1/+1.',
    });
    const bystander = makeCard({
      name: 'Bystander',
      color_identity: JSON.stringify(['W']),
      oracle_text: 'Draw a card.',
    });
    const candidate = makeCard({ name: 'Candidate', color_identity: JSON.stringify(['W']) });
    const entries = [...cats, ...genericTokenMakers, ownQualified, bystander].map((c) => owned(c));
    const units = [solo(candidate)];
    const signal: SignalMatch = {
      archetype: 'goWide',
      label: 'Go-Wide Combat (Cat)',
      description: '',
      weight: 18,
      qualifier: 'Cat',
      qualifierKind: 'creatureType',
      qualifierSource: 'kindred',
      roles: ['produces'],
    };
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      new Map([[candidate.oracle_id, [signal]]]),
    );
    const support = suggestions[0]!.themeSupport.find((t) => t.label === 'Go-Wide Combat (Cat)');
    assert.ok(support, JSON.stringify(suggestions[0]?.themeSupport));
    // The three Cats (structural fallback) and the one card with its own
    // matching goWide:Cat signal — never the merely-unqualified generic
    // token-makers, and never the bystander.
    const names = support.cards.map((c) => c.name).sort();
    assert.deepStrictEqual(names, ['Cat 0', 'Cat 1', 'Cat 2', 'Own Cat Payoff']);
  });

  it('a produces-only own signal does not back a TEXT-qualified signal either, only a flexible one does', () => {
    // Kratos, Stoic Father's real shape: "whenever a God dies" names God
    // directly, so this qualifier is text-derived (qualifierSource
    // undefined), not borrowed — the Wilhelt-style permissive path. Even
    // there, a produces-only pool card (Kavaron Harrier/Goro-Goro/Young
    // Pyromancer's shape: makes a *fixed*, non-God token) must not count
    // just because it shares the unqualified archetype; a flexible rewards
    // card (Stalking Vengeance's shape: "another creature you control
    // dies") still does, since its target is chosen at the table and could
    // be a God.
    const rigidProducers = Array.from({ length: 3 }, (_, i) =>
      makeCard({
        name: `Rigid Producer ${i}`,
        color_identity: JSON.stringify(['R']),
        oracle_text: 'Create a 2/2 red Robot artifact creature token.',
      }),
    );
    const flexibleRewarder = makeCard({
      name: 'Flexible Rewarder',
      color_identity: JSON.stringify(['R']),
      oracle_text:
        'Whenever another creature you control dies, it deals damage equal to its power to target player or planeswalker.',
    });
    const bystander = makeCard({
      name: 'Bystander',
      color_identity: JSON.stringify(['R']),
      oracle_text: 'Haste',
    });
    const candidate = makeCard({ name: 'Candidate', color_identity: JSON.stringify(['R']) });
    const entries = [...rigidProducers, flexibleRewarder, bystander].map((c) => owned(c));
    const units = [solo(candidate)];
    const signal: SignalMatch = {
      archetype: 'aristocrats',
      label: 'Aristocrats (God)',
      description: '',
      weight: 20,
      qualifier: 'God',
      qualifierKind: 'creatureType',
      roles: ['rewards'],
    };
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      new Map([[candidate.oracle_id, [signal]]]),
      { minSignalCount: 1 },
    );
    const support = suggestions[0]!.themeSupport.find((t) => t.label === 'Aristocrats (God)');
    assert.ok(support, JSON.stringify(suggestions[0]?.themeSupport));
    // Only the flexible rewarder — none of the three rigid producers (their
    // own signal is produces-only and they aren't Gods), and never the
    // bystander (no aristocrats signal at all).
    assert.deepStrictEqual(
      support.cards.map((c) => c.name),
      ['Flexible Rewarder'],
    );
  });
});

describe('scoring measures focus, not color reach', () => {
  it('identity breadth that adds no matching cards never helps, only dilutes', () => {
    const sac = sacrificeCards(4, { color_identity: JSON.stringify(['B']) });
    const irrelevant = Array.from({ length: 4 }, (_, i) =>
      makeCard({
        name: `Irrelevant ${i}`,
        color_identity: JSON.stringify(['W', 'U']),
        oracle_text: 'Vanilla text.',
      }),
    );
    const narrowCandidate = sacrificeCommander('Narrow', { color_identity: JSON.stringify(['B']) });
    const wideCandidate = sacrificeCommander('Wide', {
      color_identity: JSON.stringify(['W', 'U', 'B', 'R', 'G']),
    });

    const entries = [...sac, ...irrelevant].map((c) => owned(c));
    const profile = buildCollectionProfile(entries);
    const narrowUnits = [solo(narrowCandidate)];
    const wideUnits = [solo(wideCandidate)];
    const narrow = scoreCommanders(narrowUnits, profile, entries, candidateSignalsFor(narrowUnits));
    const wide = scoreCommanders(wideUnits, profile, entries, candidateSignalsFor(wideUnits));

    // Narrow: 4/4 density * 20 (Aristocrats) = 20, no depth bonus (4 < 5).
    assert.strictEqual(narrow[0]!.score, 20);
    // Wide: same 4 matching cards, 8-card castable pool: 4/8 * 20 = 10.
    assert.strictEqual(wide[0]!.score, 10);
    assert.ok(wide[0]!.score < narrow[0]!.score);
  });

  it('a signal at the deep-synergy floor earns a bonus; one card short does not', () => {
    const atFloor = sacrificeCards(5, { color_identity: JSON.stringify(['B']) }).map((c) =>
      owned(c),
    );
    const belowFloor = sacrificeCards(4, { color_identity: JSON.stringify(['B']) }).map((c) =>
      owned(c),
    );
    const candidate = sacrificeCommander('Candidate', { color_identity: JSON.stringify(['B']) });
    const units = [solo(candidate)];

    const at = scoreCommanders(
      units,
      buildCollectionProfile(atFloor),
      atFloor,
      candidateSignalsFor(units),
    );
    const below = scoreCommanders(
      units,
      buildCollectionProfile(belowFloor),
      belowFloor,
      candidateSignalsFor(units),
    );
    // Both fully focused, so breadth is 20 either way; only depth differs.
    assert.strictEqual(at[0]!.score, 21);
    assert.strictEqual(below[0]!.score, 20);
  });

  it('one deep synergy outranks a commander with several shallow ones', () => {
    // The case the depth bonus and diminishing returns exist for.
    const landfall = Array.from({ length: 10 }, (_, i) =>
      makeCard({
        name: `Landfall ${i}`,
        color_identity: JSON.stringify(['B']),
        oracle_text:
          'Landfall — Whenever a land enters the battlefield under your control, scry 1.',
      }),
    );
    const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
    const counters = Array.from({ length: 3 }, (_, i) =>
      makeCard({
        name: `Counter ${i}`,
        color_identity: JSON.stringify(['B']),
        oracle_text: 'Put a +1/+1 counter on target creature.',
      }),
    );
    const spells = Array.from({ length: 3 }, (_, i) =>
      makeCard({
        name: `Spell ${i}`,
        color_identity: JSON.stringify(['B']),
        oracle_text: 'Whenever you cast an instant spell, scry 1.',
      }),
    );
    const filler = Array.from({ length: 31 }, (_, i) =>
      makeCard({
        name: `Filler ${i}`,
        color_identity: JSON.stringify(['B']),
        oracle_text: 'This card does something else entirely.',
      }),
    );

    const deep = makeCard({
      name: 'Landfall Deep',
      color_identity: JSON.stringify(['B']),
      oracle_text:
        'Landfall — Whenever a land enters the battlefield under your control, draw a card.',
    });
    const shallow = makeCard({
      name: 'Generic Spread',
      color_identity: JSON.stringify(['B']),
      oracle_text:
        'Sacrifice a creature: Draw a card. Put a +1/+1 counter on target creature. Whenever you cast an instant spell, scry 1.',
    });

    const entries = [...landfall, ...sac, ...counters, ...spells, ...filler].map((c) => owned(c));
    assert.strictEqual(entries.length, 50);
    const units = [solo(deep), solo(shallow)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );

    assert.strictEqual(suggestions[0]!.cards[0]!.name, 'Landfall Deep');
    assert.ok(suggestions[0]!.score > suggestions[1]!.score);
    // Deep: breadth 10/50*20 = 4, depth (10-5+1) = 6 -> 10.
    assert.strictEqual(suggestions[0]!.score, 10);
  });

  it('suggestions are sorted by score, highest first', () => {
    const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
    const vampires = Array.from({ length: 3 }, (_, i) =>
      makeCard({
        name: `Vampire ${i}`,
        color_identity: JSON.stringify(['B']),
        creature_types: JSON.stringify(['Vampire']),
        // Two of the three also reward, clearing kindred's own two-card
        // minimum — otherwise three plain bodies can never back a kindred
        // theme regardless of what the commander says.
        oracle_text: i < 2 ? 'Other Vampires you control get +1/+1.' : '',
      }),
    );
    const weak = sacrificeCommander('Weak', { color_identity: JSON.stringify(['B']) });
    const strong = makeCard({
      name: 'Strong',
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Vampire']),
      oracle_text: 'Sacrifice a creature: Draw a card. Other Vampires you control get +1/+1.',
    });
    const entries = [...sac, ...vampires].map((c) => owned(c));
    const units = [solo(weak), solo(strong)];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 2);
    assert.strictEqual(suggestions[0]!.cards[0]!.name, 'Strong');
    assert.ok(suggestions[0]!.score > suggestions[1]!.score);
  });
});

/**
 * The score badge shows this breakdown instead of restating the formula, so
 * what it must never do is fail to account for the number above it — a
 * justification that doesn't add up is worse than none.
 */
describe('every point is attributed to the signal that earned it', () => {
  /** Every signal's points, across all three families. */
  function allPoints(suggestion: CommanderSuggestion): number[] {
    return [
      ...suggestion.themeSupport.map((t) => t.points),
      ...suggestion.kindredSupport.map((k) => k.points),
      ...suggestion.keywordSupport.map((k) => k.points),
    ];
  }

  it('the per-signal points add up to the score', () => {
    const sac = sacrificeCards(6, { color_identity: JSON.stringify(['B']) });
    const vampires = Array.from({ length: 4 }, (_, i) =>
      makeCard({
        name: `Vampire ${i}`,
        color_identity: JSON.stringify(['B']),
        creature_types: JSON.stringify(['Vampire']),
        oracle_text: i < 2 ? 'Other Vampires you control get +1/+1.' : '',
      }),
    );
    const candidate = makeCard({
      name: 'Both',
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Vampire']),
      oracle_text: 'Sacrifice a creature: Draw a card. Other Vampires you control get +1/+1.',
    });
    const entries = [...sac, ...vampires].map((c) => owned(c));
    const units = [solo(candidate)];
    const suggestion = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    )[0]!;

    const points = allPoints(suggestion);
    assert.ok(points.length >= 2);
    const total = points.reduce((sum, p) => sum + p, 0);
    // Floating point, not exactness: the score is summed breadth-then-depth
    // and this is summed signal-by-signal, so they agree to well within the
    // one decimal the wire rounds to.
    assert.ok(Math.abs(total - suggestion.score) < 1e-9);
  });

  it('the strongest signal carries the largest share', () => {
    const sac = sacrificeCards(8, { color_identity: JSON.stringify(['B']) });
    const spells = Array.from({ length: 3 }, (_, i) =>
      makeCard({
        name: `Spell ${i}`,
        color_identity: JSON.stringify(['B']),
        oracle_text: 'Whenever you cast an instant spell, scry 1.',
      }),
    );
    const candidate = makeCard({
      name: 'Both',
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Sacrifice a creature: Draw a card. Whenever you cast an instant spell, scry 1.',
    });
    const entries = [...sac, ...spells].map((c) => owned(c));
    const units = [solo(candidate)];
    const suggestion = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    )[0]!;

    const byPoints = [...suggestion.themeSupport].sort((a, b) => b.points - a.points);
    assert.strictEqual(byPoints.length, 2);
    // The eight-card signal, not the three-card one — ordering the breakdown
    // by supporting-card count alone would get this right by luck here and
    // wrong whenever the weights differ.
    assert.ok(byPoints[0]!.cards.length > byPoints[1]!.cards.length);
  });

  it("a deep signal's depth bonus lands on that signal, not spread across them", () => {
    const landfall = Array.from({ length: 10 }, (_, i) =>
      makeCard({
        name: `Landfall ${i}`,
        color_identity: JSON.stringify(['B']),
        oracle_text:
          'Landfall — Whenever a land enters the battlefield under your control, scry 1.',
      }),
    );
    const filler = Array.from({ length: 40 }, (_, i) =>
      makeCard({
        name: `Filler ${i}`,
        color_identity: JSON.stringify(['B']),
        oracle_text: 'This card does something else entirely.',
      }),
    );
    const candidate = makeCard({
      name: 'Landfall Deep',
      color_identity: JSON.stringify(['B']),
      oracle_text:
        'Landfall — Whenever a land enters the battlefield under your control, draw a card.',
    });
    const entries = [...landfall, ...filler].map((c) => owned(c));
    const units = [solo(candidate)];
    const suggestion = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    )[0]!;

    // The whole score is one signal's: breadth 10/50*20 = 4, depth 10-5+1 = 6.
    assert.strictEqual(suggestion.score, 10);
    assert.deepStrictEqual(allPoints(suggestion), [10]);
  });
});

/**
 * The tiers the score badge names. They restate the selection bar rather
 * than adding a second one, so `isMeaningfulMatch` is exactly
 * "not thin" — see `evidenceStrength`.
 */
describe('evidence strength', () => {
  const suggestion = (sizes: number[]): CommanderSuggestion =>
    ({
      themeSupport: sizes.map((n) => ({ cards: new Array(n).fill(null) })),
      kindredSupport: [],
      keywordSupport: [],
    }) as unknown as CommanderSuggestion;

  it('deep and broad is strong', () => {
    assert.strictEqual(evidenceStrength(suggestion([6, 3])), 'strong');
  });

  it('broad without depth is moderate', () => {
    assert.strictEqual(evidenceStrength(suggestion([3, 3, 4])), 'moderate');
  });

  it('deep without breadth is moderate', () => {
    assert.strictEqual(evidenceStrength(suggestion([5])), 'moderate');
  });

  it('one bare-minimum signal is thin', () => {
    assert.strictEqual(evidenceStrength(suggestion([3])), 'thin');
  });

  it('no signal at all is thin', () => {
    assert.strictEqual(evidenceStrength(suggestion([])), 'thin');
  });
});

describe('Partner-pair union semantics (702.124e)', () => {
  it("a pair's color identity is the union of both cards, not either alone", () => {
    const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['U']) });
    const partnerA = makeCard({ name: 'A', color_identity: JSON.stringify(['U']) });
    const partnerB = sacrificeCommander('B', { color_identity: JSON.stringify(['B']) });
    const entries = ownedCards.map((c) => owned(c));
    const units = [{ cards: [partnerA, partnerB] }];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 1);
    assert.deepStrictEqual(suggestions[0]!.cards.map((c) => c.name).sort(), ['A', 'B']);
  });

  it("a pair matches a signal that only one half's own text shows", () => {
    const ownedCards = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
    const silent = makeCard({
      name: 'Silent Half',
      color_identity: JSON.stringify(['B']),
      oracle_text: '',
    });
    const vocal = sacrificeCommander('Vocal Half', { color_identity: JSON.stringify(['B']) });
    const entries = ownedCards.map((c) => owned(c));
    const units = [{ cards: [silent, vocal] }];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 1);
    assert.ok(suggestions[0]!.matchedThemes.includes('Aristocrats'));
  });

  it('a pair matches a creature type only one half cares about (702.124e)', () => {
    const slivers = Array.from({ length: 8 }, (_, i) =>
      makeCard({
        name: `Sliver ${i}`,
        color_identity: JSON.stringify(['B']),
        creature_types: JSON.stringify(['Sliver']),
        // Two lords clear kindred's own two-card minimum on cares-not-shares.
        oracle_text: i < 2 ? 'Other Slivers you control get +1/+1.' : '',
      }),
    );
    const silent = makeCard({
      name: 'Silent Half',
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Draw a card.',
    });
    const caring = makeCard({
      name: 'The First Sliver',
      color_identity: JSON.stringify(['B']),
      oracle_text: 'Sliver spells you cast have cascade.',
    });
    const entries = slivers.map((c) => owned(c));
    const units = [{ cards: [silent, caring] }];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      // Neither half's own creature_types says Sliver — "caring" reaches it
      // only through its text, so unlike the other tests here, discovering
      // it at all depends on Sliver being a known vocabulary word.
      candidateSignalsFor(units, ['Sliver']),
    );
    assert.deepStrictEqual(suggestions[0]?.matchedCreatureTypes, ['Sliver']);
  });

  it('a pair does not match a creature type it merely has', () => {
    const vampiresOwned = Array.from({ length: 3 }, (_, i) =>
      makeCard({
        name: `Owned Vampire ${i}`,
        color_identity: JSON.stringify(['B']),
        creature_types: JSON.stringify(['Vampire']),
      }),
    );
    const sac = sacrificeCards(3, { color_identity: JSON.stringify(['B']) });
    const nonVampireHalf = sacrificeCommander('Non-Vampire Half', {
      color_identity: JSON.stringify(['B']),
    });
    const vampireHalf = makeCard({
      name: 'Vampire Half',
      color_identity: JSON.stringify(['B']),
      creature_types: JSON.stringify(['Vampire']),
    });
    const entries = [...vampiresOwned, ...sac].map((c) => owned(c));
    const units = [{ cards: [nonVampireHalf, vampireHalf] }];
    const suggestions = scoreCommanders(
      units,
      buildCollectionProfile(entries),
      entries,
      candidateSignalsFor(units),
    );
    assert.strictEqual(suggestions.length, 1);
    assert.ok(suggestions[0]!.matchedThemes.includes('Aristocrats'));
    assert.ok(!suggestions[0]!.matchedCreatureTypes.includes('Vampire'));
  });
});

describe('selecting which suggestions are worth showing', () => {
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
      poolSize: 50,
      themeSupport: sizes.map((n, i) => ({
        key: `t${i}`,
        label: `Theme ${i}`,
        description: '',
        cards: cards(n),
        archetype: `t${i}`,
        archetypeLabel: `Theme ${i}`,
        points: 0,
      })),
      kindredSupport: [],
      keywordSupport: [],
      gameChangerCards: [],
      citedOracleIds: [],
    };
  }

  it('a single bare-minimum signal is not worth showing', () => {
    // The case this exists for: a real graveyard list returned 877 commanders
    // that all matched one archetype on the same three cards, scoring 3.3 to
    // 5.0. They are indistinguishable because they are all just "a commander
    // that sacrifices creatures".
    const noise = Array.from({ length: 20 }, () => suggestionWithSignals([3]));
    const result = selectSuggestions(noise);
    assert.strictEqual(result.weakMatchesOnly, true);
  });

  it('one deep signal is enough on its own', () => {
    const deep = suggestionWithSignals([5]);
    const result = selectSuggestions([deep, suggestionWithSignals([3])]);
    assert.strictEqual(result.weakMatchesOnly, false);
    assert.strictEqual(result.suggestions.length, 1);
  });

  it('two shallow signals are enough on their own', () => {
    const broad = suggestionWithSignals([3, 3]);
    const result = selectSuggestions([broad, suggestionWithSignals([3])]);
    assert.strictEqual(result.weakMatchesOnly, false);
    assert.strictEqual(result.suggestions.length, 1);
  });

  it('nothing worth showing falls back to a short flagged list, not an empty page', () => {
    // An empty result would be technically defensible and useless. The caller
    // gets the closest few, flagged, so it can say the pattern was weak.
    const noise = Array.from({ length: 400 }, (_, i) => suggestionWithSignals([3], 5 - i * 0.001));
    const result = selectSuggestions(noise);
    assert.strictEqual(result.weakMatchesOnly, true);
    assert.strictEqual(result.suggestions.length, 12);
    // Still the best of a bad lot, in order.
    assert.ok(result.suggestions[0]!.score > result.suggestions[11]!.score);
  });

  it('selection is not a cap — a list with real depth keeps everything', () => {
    const many = Array.from({ length: 500 }, () => suggestionWithSignals([8]));
    const result = selectSuggestions(many);
    assert.strictEqual(result.weakMatchesOnly, false);
    assert.strictEqual(result.suggestions.length, 500);
  });

  it('an empty input stays empty rather than reporting weak matches', () => {
    const result = selectSuggestions([]);
    assert.strictEqual(result.suggestions.length, 0);
    assert.strictEqual(result.weakMatchesOnly, true);
  });
});
