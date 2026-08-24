/**
 * Tests for the coverage pass: making sure every card in a submitted pool
 * gets *some* commander recommended for it, even one synergy.ts's two bars
 * would otherwise drop entirely.
 *
 * The fixture pool below mirrors the shape of the reproducing list in
 * docs/recommendation-coverage.md — a wide (5-colour) commander with plenty
 * of signal, plus a narrow mono-colour commander that's *in* the list but
 * whose own legal supporters never clear MIN_SIGNAL_COUNT on their own. Card
 * text here is synthetic, the same way synergy.test.ts's is — hard rule 4
 * (never write oracle text from memory) is about not fabricating a *real*
 * card's wording, not about naming a fixture.
 */
import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { CardRow } from '../types';
import { buildCommanderUnits } from './partners';
import type { CommanderUnit } from './partners';
import { buildCardFacts, buildVocabulary, detectSignals, type SignalMatch } from './signals';
import {
  buildCollectionProfile,
  scoreCommanders,
  selectSuggestions,
  type OwnedCard,
} from './synergy';
import { buildCoverage } from './coverage';

/** Same stand-in for the precomputed `card_signals` table synergy.test.ts
 * uses — see that file's own comment on why this isn't scoped to the
 * submitted list's vocabulary. */
function candidateSignalsFor(units: CommanderUnit[]): Map<string, SignalMatch[]> {
  const vocab = buildVocabulary([], []);
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

// Deliberately avoids "life"/"draw a card" wording — either would also
// register as a lifegain or cardDraw signal (see LIFEGAIN_TEXT below) and
// make a wide commander cite the lifegain-only fixture card too, which would
// undermine the "only a relaxed pick rescues it" premise this file tests.
const SACRIFICE_TEXT =
  'Sacrifice a creature: Scry 1.\nWhenever a creature you control dies, exile the top card of your library.';
const LIFEGAIN_TEXT = 'Whenever you gain life, you may draw a card.';

function colorIdentityOf(unit: CommanderUnit): Set<string> {
  const set = new Set<string>();
  for (const card of unit.cards) {
    for (const color of JSON.parse(card.color_identity) as string[]) set.add(color);
  }
  return set;
}

describe('buildCoverage', () => {
  it('mirrors the reproducing list: a wide commander leaves a narrow, owned one uncovered', () => {
    // Wide (5-colour) supporters — enough on their own to give a WUBRG
    // commander a confident aristocrats match.
    const wideSac1 = makeCard({
      name: 'Wide Sac W',
      color_identity: JSON.stringify(['W']),
      oracle_text: SACRIFICE_TEXT,
    });
    const wideSac2 = makeCard({
      name: 'Wide Sac U',
      color_identity: JSON.stringify(['U']),
      oracle_text: SACRIFICE_TEXT,
    });
    const wideSac3 = makeCard({
      name: 'Wide Sac R',
      color_identity: JSON.stringify(['R']),
      oracle_text: SACRIFICE_TEXT,
    });

    // The card the bug report names: a mono-black commander sitting *in* the
    // list, whose only legal aristocrats supporters (itself included) never
    // reach MIN_SIGNAL_COUNT, so the confident tier never suggests it.
    const narrowBlack = makeCard({
      name: 'Narrow Black Commander',
      color_identity: JSON.stringify(['B']),
      oracle_text: SACRIFICE_TEXT,
    });
    const lonelyBlackCard = makeCard({
      name: 'Lonely Black Card',
      color_identity: JSON.stringify(['B']),
      oracle_text: SACRIFICE_TEXT,
    });

    // A card with a signal no selected commander cites at all — only a
    // relaxed, narrow pick can rescue it.
    const lifegainCard = makeCard({
      name: 'Lifegain Card',
      color_identity: JSON.stringify(['W']),
      oracle_text: LIFEGAIN_TEXT,
    });

    const wideCommander = makeCard({
      name: 'Wide Commander',
      color_identity: JSON.stringify(['W', 'U', 'B', 'R', 'G']),
      oracle_text: SACRIFICE_TEXT,
    });
    const narrowLifegainCommander = makeCard({
      name: 'Narrow Lifegain Commander',
      color_identity: JSON.stringify(['W']),
      oracle_text: LIFEGAIN_TEXT,
    });

    const ownedCards = [wideSac1, wideSac2, wideSac3, narrowBlack, lonelyBlackCard, lifegainCard];
    const entries = ownedCards.map((c) => owned(c));
    const profile = buildCollectionProfile(entries);

    const units = buildCommanderUnits([wideCommander, narrowBlack, narrowLifegainCommander], []);
    const candidateSignals = candidateSignalsFor(units);

    const scored = scoreCommanders(units, profile, entries, candidateSignals);
    const { suggestions: selected } = selectSuggestions(scored);

    // Sanity check on the premise: the wide commander is confidently
    // suggested; the narrow, owned one is not — exactly the bug.
    assert.ok(selected.some((s) => s.cards[0]!.name === 'Wide Commander'));
    assert.ok(!selected.some((s) => s.cards[0]!.name === 'Narrow Black Commander'));

    const coverage = buildCoverage({
      suggestions: selected,
      units,
      owned: entries,
      profile,
      candidateSignals,
    });

    // (c) The owned narrow commander shows up, reason 'owned'.
    const ownedPick = coverage.find((c) => c.cards[0]!.name === 'Narrow Black Commander');
    assert.ok(ownedPick);
    assert.strictEqual(ownedPick.coverageReason, 'owned');

    // (b) At least one coverage entry has a mono-black identity.
    assert.ok(
      coverage.some(
        (c) =>
          colorIdentityOf({ cards: c.cards }).size === 1 &&
          colorIdentityOf({ cards: c.cards }).has('B'),
      ),
    );

    // The relaxed pick rescues the card no confident suggestion cites.
    const relaxedPick = coverage.find((c) => c.coverageReason === 'covers');
    assert.ok(relaxedPick);
    assert.ok(relaxedPick.coveredCards.includes(lifegainCard.oracle_id));

    // (a) Every owned card is accounted for, one way or the other.
    const citedByConfident = new Set(selected.flatMap((s) => s.citedOracleIds));
    const citedByCoverage = new Set(coverage.flatMap((c) => c.coveredCards));
    for (const card of ownedCards) {
      assert.ok(
        citedByConfident.has(card.oracle_id) || citedByCoverage.has(card.oracle_id),
        `${card.name} was not covered by either tier`,
      );
    }
  });

  it('never re-suggests a unit already in the confident tier', () => {
    const supporters = Array.from({ length: 3 }, (_, i) =>
      makeCard({
        name: `Sac ${i}`,
        color_identity: JSON.stringify(['B']),
        oracle_text: SACRIFICE_TEXT,
      }),
    );
    const commander = makeCard({
      name: 'Commander',
      color_identity: JSON.stringify(['B']),
      oracle_text: SACRIFICE_TEXT,
    });
    const entries = [...supporters, commander].map((c) => owned(c));
    const profile = buildCollectionProfile(entries);
    const units = buildCommanderUnits([commander], []);
    const candidateSignals = candidateSignalsFor(units);

    const { suggestions: selected } = selectSuggestions(
      scoreCommanders(units, profile, entries, candidateSignals),
    );
    assert.strictEqual(selected.length, 1);

    const coverage = buildCoverage({
      suggestions: selected,
      units,
      owned: entries,
      profile,
      candidateSignals,
    });
    assert.deepStrictEqual(coverage, []);
  });
});
