/**
 * Tests for card packages: filling the slots the deck analysis found empty.
 * Run with: npm test
 *
 * Candidates are injected rather than read from the database, so these cases
 * are about the selection rules — colors, exclusions, ranking, cross-archetype
 * sourcing — and not about what happens to be in Scryfall this week.
 */
import assert from 'node:assert';
import type { CardRow } from '../src/types';
import { signalKey, type Role, type SignalCandidate, type SignalMatch } from '../src/services/signals';

import { analyzeDeck, type DeckAnalysis } from '../src/services/deckAnalysis';
import {
  attachSuggestions,
  collectionColors,
  requiredSignalKeys,
  MAX_SUGGESTIONS_PER_SLOT,
} from '../src/services/packages';
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

function makeCard(name: string, cmc = 1, colorIdentity: string[] = []): CardRow {
  return {
    oracle_id: name,
    name,
    name_lower: name.toLowerCase(),
    mana_cost: null,
    cmc,
    type_line: 'Creature — Human',
    oracle_text: '',
    colors: JSON.stringify(colorIdentity),
    color_identity: JSON.stringify(colorIdentity),
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

/** An owned list of `count` cards all carrying the same signal. */
function owning(
  entries: [string, string, Role[]][],
  colorIdentity: string[] = []
): { owned: OwnedCard[]; signals: Map<string, SignalMatch[]> } {
  const owned: OwnedCard[] = [];
  const signals = new Map<string, SignalMatch[]>();
  for (const [name, archetype, roles] of entries) {
    let row = owned.find((o) => o.row.name === name)?.row;
    if (!row) {
      row = makeCard(name, 1, colorIdentity);
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

function candidate(row: CardRow, roles: Role[]): SignalCandidate {
  return { row, roles };
}

function pool(entries: [string, SignalCandidate[]][]): Map<string, SignalCandidate[]> {
  return new Map(entries);
}

/** An aristocrats list with fodder and payoffs but no sacrifice outlet. */
function outletlessDeck(): DeckAnalysis {
  const { owned, signals } = owning([
    ...themed('aristocrats', 4, ['produces'], 'f'),
    ...themed('aristocrats', 3, ['rewards'], 'p'),
  ]);
  return analyzeDeck(owned, signals);
}

const NO_OWNED = new Set<string>();
const ANY_COLOR = new Set(['W', 'U', 'B', 'R', 'G']);

// --- what the pass needs loaded ---------------------------------------------

check('cross-archetype slots pull their source archetype into the query set', () => {
  // Reanimator's graveyard-filling is answered by Self-Mill cards, which the
  // list may hold none of — so selfMill has to be fetched even though it is
  // not one of the list's themes.
  const { owned, signals } = owning(themed('reanimator', 4, ['rewards'], 'r'));
  const keys = requiredSignalKeys(analyzeDeck(owned, signals)).map(signalKey);
  assert.ok(keys.includes('reanimator'));
  assert.ok(keys.includes('selfMill'));
});

check('qualified themes are queried with their qualifier, not bare', () => {
  const owned: OwnedCard[] = [];
  const signals = new Map<string, SignalMatch[]>();
  for (let i = 0; i < 4; i++) {
    const row = makeCard(`Goblin ${i}`);
    owned.push({ row, quantity: 1 });
    signals.set(row.oracle_id, [signal('kindred', ['is'], 'Goblin')]);
  }
  const keys = requiredSignalKeys(analyzeDeck(owned, signals)).map(signalKey);
  assert.deepStrictEqual(keys, ['kindred:Goblin']);
});

// --- selection --------------------------------------------------------------

check('a short slot is offered cards that play the missing role', () => {
  const analysis = outletlessDeck();
  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([
      [
        'aristocrats',
        [
          candidate(makeCard('Viscera Seer'), ['consumes']),
          candidate(makeCard('Blood Artist'), ['rewards']),
        ],
      ],
    ]),
    ownedOracleIds: NO_OWNED,
    allowedColors: ANY_COLOR,
  });
  const outlet = suggested.themes[0].slots.find((s) => s.key === 'outlet');
  assert.deepStrictEqual(
    outlet?.suggestions.map((s) => s.name),
    ['Viscera Seer']
  );
});

check('slots the list already fills get no suggestions', () => {
  const analysis = outletlessDeck();
  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([
      ['aristocrats', [candidate(makeCard('Extra Fodder'), ['produces', 'consumes'])]],
    ]),
    ownedOracleIds: NO_OWNED,
    allowedColors: ANY_COLOR,
  });
  const fodder = suggested.themes[0].slots.find((s) => s.key === 'fodder');
  assert.strictEqual(fodder?.filled, true);
  assert.deepStrictEqual(fodder?.suggestions, []);
});

check('cards already in the list are never suggested back', () => {
  const analysis = outletlessDeck();
  const owned = makeCard('Already Have It');
  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([
      [
        'aristocrats',
        [candidate(owned, ['consumes']), candidate(makeCard('New Outlet'), ['consumes'])],
      ],
    ]),
    ownedOracleIds: new Set([owned.oracle_id]),
    allowedColors: ANY_COLOR,
  });
  assert.deepStrictEqual(
    suggested.themes[0].slots.find((s) => s.key === 'outlet')?.suggestions.map((s) => s.name),
    ['New Outlet']
  );
});

check('a suggestion that would add a color to the deck is dropped', () => {
  // Mono-black list: a Golgari outlet is not a fix, it's a mana base problem.
  const analysis = outletlessDeck();
  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([
      [
        'aristocrats',
        [
          candidate(makeCard('Black Outlet', 1, ['B']), ['consumes']),
          candidate(makeCard('Golgari Outlet', 1, ['B', 'G']), ['consumes']),
          candidate(makeCard('Colorless Outlet', 1, []), ['consumes']),
        ],
      ],
    ]),
    ownedOracleIds: NO_OWNED,
    allowedColors: new Set(['B']),
  });
  assert.deepStrictEqual(
    suggested.themes[0].slots
      .find((s) => s.key === 'outlet')
      ?.suggestions.map((s) => s.name)
      .sort(),
    ['Black Outlet', 'Colorless Outlet']
  );
});

check('a graveyard-filling slot is offered self-mill cards, not reanimation spells', () => {
  const { owned, signals } = owning(themed('reanimator', 4, ['rewards'], 'r'));
  const analysis = analyzeDeck(owned, signals);
  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([
      ['reanimator', [candidate(makeCard('Another Reanimate'), ['rewards'])]],
      ['selfMill', [candidate(makeCard('Entomb'), ['produces'])]],
    ]),
    ownedOracleIds: NO_OWNED,
    allowedColors: ANY_COLOR,
  });
  const fill = suggested.themes[0].slots.find((s) => s.key === 'fill');
  assert.deepStrictEqual(
    fill?.suggestions.map((s) => s.name),
    ['Entomb']
  );
});

// --- ranking ----------------------------------------------------------------

check('a card that also feeds another theme in the list outranks one that does not', () => {
  // The only ranking input that comes from the user's actual list, so it
  // leads — ahead of the mana-value tiebreaker, which is just a proxy.
  const dualPurpose = makeCard('Dual Purpose', 6);
  const singleUse = makeCard('Single Use', 1);

  const { owned, signals } = owning([
    ...themed('aristocrats', 4, ['produces'], 'f'),
    ...themed('aristocrats', 3, ['rewards'], 'p'),
    ...themed('spellslinger', 4, ['rewards'], 's'),
    ...themed('spellslinger', 2, ['amplifies'], 'x'),
  ]);
  const analysis = analyzeDeck(owned, signals);

  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([
      ['aristocrats', [candidate(dualPurpose, ['consumes']), candidate(singleUse, ['consumes'])]],
      ['spellslinger', [candidate(dualPurpose, ['rewards'])]],
    ]),
    ownedOracleIds: NO_OWNED,
    allowedColors: ANY_COLOR,
  });

  const outlet = suggested.themes
    .find((t) => t.archetype === 'aristocrats')
    ?.slots.find((s) => s.key === 'outlet');
  assert.deepStrictEqual(
    outlet?.suggestions.map((s) => s.name),
    ['Dual Purpose', 'Single Use']
  );
  // And it says *which* other theme, rather than just ordering silently.
  assert.deepStrictEqual(outlet?.suggestions[0].alsoFits, ['spellslinger']);
});

check('the theme being filled is not listed as a theme the card "also fits"', () => {
  const analysis = outletlessDeck();
  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([['aristocrats', [candidate(makeCard('Outlet'), ['consumes'])]]]),
    ownedOracleIds: NO_OWNED,
    allowedColors: ANY_COLOR,
  });
  assert.deepStrictEqual(
    suggested.themes[0].slots.find((s) => s.key === 'outlet')?.suggestions[0].alsoFits,
    []
  );
});

check('a card doing two jobs in the archetype outranks one doing a single job', () => {
  const analysis = outletlessDeck();
  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([
      [
        'aristocrats',
        [
          candidate(makeCard('Only Sacrifices', 1), ['consumes']),
          candidate(makeCard('Sacrifices And Pays Off', 3), ['consumes', 'rewards']),
        ],
      ],
    ]),
    ownedOracleIds: NO_OWNED,
    allowedColors: ANY_COLOR,
  });
  assert.deepStrictEqual(
    suggested.themes[0].slots.find((s) => s.key === 'outlet')?.suggestions.map((s) => s.name),
    ['Sacrifices And Pays Off', 'Only Sacrifices']
  );
});

check('otherwise, cheaper comes first and ties break by name', () => {
  const analysis = outletlessDeck();
  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([
      [
        'aristocrats',
        [
          candidate(makeCard('Zephyr Outlet', 2), ['consumes']),
          candidate(makeCard('Expensive Outlet', 5), ['consumes']),
          candidate(makeCard('Anodyne Outlet', 2), ['consumes']),
        ],
      ],
    ]),
    ownedOracleIds: NO_OWNED,
    allowedColors: ANY_COLOR,
  });
  assert.deepStrictEqual(
    suggested.themes[0].slots.find((s) => s.key === 'outlet')?.suggestions.map((s) => s.name),
    ['Anodyne Outlet', 'Zephyr Outlet', 'Expensive Outlet']
  );
});

check('suggestions are capped so the response stays a shortlist', () => {
  const analysis = outletlessDeck();
  const many = Array.from({ length: MAX_SUGGESTIONS_PER_SLOT + 10 }, (_, i) =>
    candidate(makeCard(`Outlet ${i}`), ['consumes'])
  );
  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([['aristocrats', many]]),
    ownedOracleIds: NO_OWNED,
    allowedColors: ANY_COLOR,
  });
  assert.strictEqual(
    suggested.themes[0].slots.find((s) => s.key === 'outlet')?.suggestions.length,
    MAX_SUGGESTIONS_PER_SLOT
  );
});

// --- restraint --------------------------------------------------------------

check('a complete archetype is left alone', () => {
  const { owned, signals } = owning([
    ...themed('aristocrats', 3, ['produces'], 'f'),
    ...themed('aristocrats', 2, ['consumes'], 'o'),
    ...themed('aristocrats', 3, ['rewards'], 'p'),
  ]);
  const analysis = analyzeDeck(owned, signals);
  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([['aristocrats', [candidate(makeCard('More Outlets'), ['consumes'])]]]),
    ownedOracleIds: NO_OWNED,
    allowedColors: ANY_COLOR,
  });
  assert.ok(suggested.themes[0].slots.every((s) => s.suggestions.length === 0));
});

check('an archetype with no lifecycle is never given suggestions', () => {
  // "More Goblins" is not a missing slot, so there is nothing to fill.
  const owned: OwnedCard[] = [];
  const signals = new Map<string, SignalMatch[]>();
  for (let i = 0; i < 4; i++) {
    const row = makeCard(`Goblin ${i}`);
    owned.push({ row, quantity: 1 });
    signals.set(row.oracle_id, [signal('kindred', ['is'], 'Goblin')]);
  }
  const analysis = analyzeDeck(owned, signals);
  const suggested = attachSuggestions(analysis, {
    candidatesByKey: pool([['kindred:Goblin', [candidate(makeCard('Krenko'), ['produces'])]]]),
    ownedOracleIds: NO_OWNED,
    allowedColors: ANY_COLOR,
  });
  assert.deepStrictEqual(suggested.themes[0].slots, []);
});

check('a missing candidate pool yields no suggestions rather than throwing', () => {
  const suggested = attachSuggestions(outletlessDeck(), {
    candidatesByKey: new Map(),
    ownedOracleIds: NO_OWNED,
    allowedColors: ANY_COLOR,
  });
  assert.deepStrictEqual(
    suggested.themes[0].slots.find((s) => s.key === 'outlet')?.suggestions,
    []
  );
});

// --- color collection -------------------------------------------------------

check('the allowed colors are the union of what the list already plays', () => {
  const colors = collectionColors([
    makeCard('Swamp Thing', 1, ['B']),
    makeCard('Bird', 1, ['W', 'U']),
    makeCard('Rock', 1, []),
  ]);
  assert.deepStrictEqual([...colors].sort(), ['B', 'U', 'W']);
});

if (failures > 0) {
  console.error(`\n${failures} package case(s) failed.`);
  process.exit(1);
}
console.log('\nAll package cases passed.');
