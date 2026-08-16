/**
 * Tests for deck analysis: what the submitted list is trying to do, and
 * whether it can actually do it. Run with: npm test
 *
 * Dependency-free (node:assert + tsx), matching the other test scripts here.
 * Signals are handed in directly rather than derived, since detection is
 * tested in test-signals.ts — these cases are about what the *analysis* makes
 * of them.
 */
import assert from 'node:assert';
import type { CardRow } from '../src/types';
import type { Role, SignalMatch } from '../src/services/signals';
import { analyzeDeck } from '../src/services/deckAnalysis';
import type { OwnedCard } from '../src/services/synergy';

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
function makeCard(name?: string, cmc = 1): CardRow {
  const cardName = name ?? `Card ${counter++}`;
  return {
    oracle_id: cardName,
    name: cardName,
    name_lower: cardName.toLowerCase(),
    mana_cost: null,
    cmc,
    type_line: 'Creature — Human',
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
    is_legendary: 0,
    is_commander_eligible: 0,
    image_uri: null,
    back_image_uri: null,
    back_name: null,
  };
}

function signal(archetype: string, roles: Role[], qualifier?: string): SignalMatch {
  return {
    archetype,
    label: qualifier ? `${archetype} (${qualifier})` : archetype,
    description: '',
    weight: 10,
    qualifier,
    qualifierKind: qualifier ? 'creatureType' : undefined,
    roles,
  };
}

/** Builds a list where each entry is [name, archetype, roles]. */
function deckOf(
  entries: [string, string, Role[]][],
  cmcByName: Record<string, number> = {}
): { owned: OwnedCard[]; signals: Map<string, SignalMatch[]> } {
  const owned: OwnedCard[] = [];
  const signals = new Map<string, SignalMatch[]>();
  for (const [name, archetype, roles] of entries) {
    let row = owned.find((o) => o.row.name === name)?.row;
    if (!row) {
      row = makeCard(name, cmcByName[name] ?? 1);
      owned.push({ row, quantity: 1 });
    }
    const list = signals.get(row.oracle_id) ?? [];
    list.push(signal(archetype, roles));
    signals.set(row.oracle_id, list);
  }
  return { owned, signals };
}

function themed(archetype: string, count: number, roles: Role[], prefix = 'c'): [string, string, Role[]][] {
  return Array.from({ length: count }, (_, i) => [`${prefix}${archetype}${i}`, archetype, roles]);
}

// --- theme summary ----------------------------------------------------------

check('a theme below the minimum card count is not reported', () => {
  // Two cards is a coincidence, the same bar the scorer uses.
  const { owned, signals } = deckOf(themed('aristocrats', 2, ['rewards']));
  assert.deepStrictEqual(analyzeDeck(owned, signals).themes, []);
});

check('themes are ranked by how many cards actually back them', () => {
  const { owned, signals } = deckOf([
    ...themed('aristocrats', 4, ['rewards'], 'a'),
    ...themed('spellslinger', 7, ['rewards'], 's'),
  ]);
  const themes = analyzeDeck(owned, signals).themes;
  assert.strictEqual(themes[0].archetype, 'spellslinger');
  assert.strictEqual(themes[0].cardCount, 7);
  assert.strictEqual(themes[1].archetype, 'aristocrats');
});

check('one card counts once per theme, however many copies are owned', () => {
  // Distinct cards, not summed quantity — ten copies is still one card.
  const row = makeCard('Repeated', 2);
  const owned: OwnedCard[] = [{ row, quantity: 10 }];
  const signals = new Map([[row.oracle_id, [signal('aristocrats', ['rewards'])]]]);
  assert.deepStrictEqual(analyzeDeck(owned, signals).themes, []);
});

check('qualified signals are separate themes, not one lumpy group', () => {
  // "Goblin Kindred" and "Elf Kindred" are different decks.
  const owned: OwnedCard[] = [];
  const signals = new Map<string, SignalMatch[]>();
  for (const [type, n] of [['Goblin', 5], ['Elf', 3]] as [string, number][]) {
    for (let i = 0; i < n; i++) {
      const row = makeCard(`${type} ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is'], type)]);
    }
  }
  const themes = analyzeDeck(owned, signals).themes;
  assert.strictEqual(themes.length, 2);
  assert.deepStrictEqual(
    themes.map((t) => t.cardCount),
    [5, 3]
  );
});

check('cards within a theme are listed in curve order', () => {
  const { owned, signals } = deckOf(
    [
      ['Expensive', 'aristocrats', ['rewards']],
      ['Cheap', 'aristocrats', ['rewards']],
      ['Middling', 'aristocrats', ['rewards']],
    ],
    { Expensive: 6, Cheap: 1, Middling: 3 }
  );
  const theme = analyzeDeck(owned, signals).themes[0];
  assert.deepStrictEqual(
    theme.cards.map((c) => c.name),
    ['Cheap', 'Middling', 'Expensive']
  );
});

// --- lifecycle: whether the deck actually works -----------------------------

check('an archetype with every slot filled reads as complete', () => {
  const { owned, signals } = deckOf([
    ...themed('aristocrats', 3, ['produces'], 'fodder'),
    ...themed('aristocrats', 2, ['consumes'], 'outlet'),
    ...themed('aristocrats', 3, ['rewards'], 'payoff'),
  ]);
  const theme = analyzeDeck(owned, signals).themes[0];
  assert.strictEqual(theme.complete, true);
  assert.deepStrictEqual(
    theme.slots.map((s) => s.filled),
    [true, true, true]
  );
});

check('a missing slot is named rather than just lowering a score', () => {
  // Fodder and payoffs but nothing to sacrifice with: the deck cannot
  // actually execute, and saying which slot is empty is the whole point.
  const { owned, signals } = deckOf([
    ...themed('aristocrats', 4, ['produces'], 'fodder'),
    ...themed('aristocrats', 5, ['rewards'], 'payoff'),
  ]);
  const theme = analyzeDeck(owned, signals).themes[0];
  assert.strictEqual(theme.complete, false);
  const outlet = theme.slots.find((s) => s.key === 'outlet');
  assert.ok(outlet);
  assert.strictEqual(outlet.filled, false);
  assert.strictEqual(outlet.cards.length, 0);
  assert.strictEqual(outlet.label, 'Sacrifice outlet');
});

check('the commonly-missing hint is carried through, flagged as a hint', () => {
  const { owned, signals } = deckOf(themed('aristocrats', 4, ['produces']));
  const theme = analyzeDeck(owned, signals).themes[0];
  const outlet = theme.slots.find((s) => s.key === 'outlet');
  assert.strictEqual(outlet?.commonlyMissing, true);
  // Fodder is not flagged — only the slot people actually forget.
  assert.strictEqual(theme.slots.find((s) => s.key === 'fodder')?.commonlyMissing, false);
});

check('one card can fill two slots without being double-counted as two cards', () => {
  // A card that both makes fodder and sacrifices it genuinely answers both
  // "can this deck make bodies?" and "can it convert them?".
  const { owned, signals } = deckOf([['Dual Role', 'aristocrats', ['produces', 'consumes']]]);
  const extra = deckOf(themed('aristocrats', 3, ['rewards'], 'p'));
  for (const entry of extra.owned) owned.push(entry);
  for (const [k, v] of extra.signals) signals.set(k, v);

  const theme = analyzeDeck(owned, signals).themes[0];
  assert.strictEqual(theme.cardCount, 4);
  assert.ok(theme.slots.find((s) => s.key === 'fodder')?.cards.some((c) => c.name === 'Dual Role'));
  assert.ok(theme.slots.find((s) => s.key === 'outlet')?.cards.some((c) => c.name === 'Dual Role'));
});

check('a slot filled by a DIFFERENT archetype is found', () => {
  // The case that would otherwise silently pass: nothing in Reanimator fills
  // a graveyard — Entomb and Buried Alive are Self-Mill cards. A list holding
  // every reanimation spell and no way to fill a graveyard must not read as
  // complete.
  const withoutFill = deckOf(themed('reanimator', 4, ['rewards'], 'r'));
  const noFill = analyzeDeck(withoutFill.owned, withoutFill.signals).themes.find(
    (t) => t.archetype === 'reanimator'
  );
  assert.strictEqual(noFill?.complete, false);
  assert.strictEqual(noFill?.slots.find((s) => s.key === 'fill')?.filled, false);

  // Add self-mill cards, and the Reanimator chain completes even though none
  // of them is a Reanimator card.
  const withFill = deckOf([
    ...themed('reanimator', 4, ['rewards'], 'r'),
    ...themed('selfMill', 3, ['produces'], 'm'),
  ]);
  const filled = analyzeDeck(withFill.owned, withFill.signals).themes.find(
    (t) => t.archetype === 'reanimator'
  );
  assert.strictEqual(filled?.slots.find((s) => s.key === 'fill')?.filled, true);
  assert.strictEqual(filled?.complete, true);
});

check('an archetype with no lifecycle is never reported as incomplete', () => {
  // Kindred is a membership group, not an engine. "More Goblins" is not a
  // missing slot, and inventing one would be a fabricated problem.
  const owned: OwnedCard[] = [];
  const signals = new Map<string, SignalMatch[]>();
  for (let i = 0; i < 5; i++) {
    const row = makeCard(`Goblin ${i}`);
    owned.push({ row, quantity: 1 });
    signals.set(row.oracle_id, [signal('kindred', ['is'], 'Goblin')]);
  }
  const theme = analyzeDeck(owned, signals).themes[0];
  assert.deepStrictEqual(theme.slots, []);
  assert.strictEqual(theme.complete, true);
});

check('cards that merely have a keyword do not make it a theme', () => {
  // "Cares, not shares", applied to the list rather than the commander: a
  // graveyard deck with four fliers in it is not a Flying deck.
  const owned: OwnedCard[] = [];
  const signals = new Map<string, SignalMatch[]>();
  for (let i = 0; i < 5; i++) {
    const row = makeCard(`Flier ${i}`);
    owned.push({ row, quantity: 1 });
    signals.set(row.oracle_id, [signal('keywordCare', ['is'], 'Flying')]);
  }
  assert.deepStrictEqual(analyzeDeck(owned, signals).themes, []);
});

check('cards that actively care about a keyword do make it a theme', () => {
  const owned: OwnedCard[] = [];
  const signals = new Map<string, SignalMatch[]>();
  for (let i = 0; i < 4; i++) {
    const row = makeCard(`Trample Payoff ${i}`);
    owned.push({ row, quantity: 1 });
    signals.set(row.oracle_id, [signal('keywordCare', ['produces'], 'Trample')]);
  }
  const themes = analyzeDeck(owned, signals).themes;
  assert.strictEqual(themes.length, 1);
  assert.strictEqual(themes[0].cardCount, 4);
});

check('kindred membership is still a theme without an active role', () => {
  // Being a Goblin is a plan in a way that having flying is not.
  const owned: OwnedCard[] = [];
  const signals = new Map<string, SignalMatch[]>();
  for (let i = 0; i < 4; i++) {
    const row = makeCard(`Goblin ${i}`);
    owned.push({ row, quantity: 1 });
    signals.set(row.oracle_id, [signal('kindred', ['is'], 'Goblin')]);
  }
  assert.strictEqual(analyzeDeck(owned, signals).themes[0].cardCount, 4);
});

check('an empty list produces no themes rather than throwing', () => {
  assert.deepStrictEqual(analyzeDeck([], new Map()).themes, []);
});

if (failures > 0) {
  console.error(`\n${failures} deck-analysis case(s) failed.`);
  process.exit(1);
}
console.log('\nAll deck-analysis cases passed.');
