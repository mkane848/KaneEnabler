/**
 * Tests for deck analysis: what the submitted list is trying to do, and
 * whether it can actually do it.
 *
 * Signals are handed in directly rather than derived, since detection is
 * tested in signals.test.ts — these cases are about what the *analysis* makes
 * of them.
 */
import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { CardRow } from '../types';
import type { Role, SignalMatch } from './signals';
import { analyzeDeck } from './deckAnalysis';
import type { OwnedCard } from './synergy';

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
    is_changeling: 0,
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
  cmcByName: Record<string, number> = {},
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

function themed(
  archetype: string,
  count: number,
  roles: Role[],
  prefix = 'c',
): [string, string, Role[]][] {
  return Array.from({ length: count }, (_, i) => [`${prefix}${archetype}${i}`, archetype, roles]);
}

describe('analyzeDeck', () => {
  // --- theme summary ----------------------------------------------------------

  it('a theme below the minimum card count is not reported', () => {
    // Two cards is a coincidence, the same bar the scorer uses.
    const { owned, signals } = deckOf(themed('aristocrats', 2, ['rewards']));
    assert.deepStrictEqual(analyzeDeck(owned, signals).themes, []);
  });

  it('themes are ranked by how many cards actually back them', () => {
    const { owned, signals } = deckOf([
      ...themed('aristocrats', 4, ['rewards'], 'a'),
      ...themed('spellslinger', 7, ['rewards'], 's'),
    ]);
    const themes = analyzeDeck(owned, signals).themes;
    assert.strictEqual(themes[0]!.archetype, 'spellslinger');
    assert.strictEqual(themes[0]!.cardCount, 7);
    assert.strictEqual(themes[1]!.archetype, 'aristocrats');
  });

  it('one card counts once per theme, however many copies are owned', () => {
    // Distinct cards, not summed quantity — ten copies is still one card.
    const row = makeCard('Repeated', 2);
    const owned: OwnedCard[] = [{ row, quantity: 10 }];
    const signals = new Map([[row.oracle_id, [signal('aristocrats', ['rewards'])]]]);
    assert.deepStrictEqual(analyzeDeck(owned, signals).themes, []);
  });

  it('qualified signals are separate themes, not one lumpy group', () => {
    // "Goblin Kindred" and "Elf Kindred" are different decks.
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    for (const [type, n] of [
      ['Goblin', 5],
      ['Elf', 3],
    ] as [string, number][]) {
      for (let i = 0; i < n; i++) {
        const row = makeCard(`${type} ${i}`);
        owned.push({ row, quantity: 1 });
        // 'rewards' clears kindred's own two-card minimum for both groups —
        // this test is about grouping by qualifier, not that minimum.
        signals.set(row.oracle_id, [signal('kindred', ['is', 'rewards'], type)]);
      }
    }
    const themes = analyzeDeck(owned, signals).themes;
    assert.strictEqual(themes.length, 2);
    assert.deepStrictEqual(
      themes.map((t) => t.cardCount),
      [5, 3],
    );
  });

  // --- signal containment: unqualified supports qualified --------------------

  it('an unqualified signal folds into a qualified group of the same archetype', () => {
    // Wilhelt's deck, in miniature: one unqualified reanimation effect and
    // two Zombie-restricted ones. Grouped separately, both fall under
    // MIN_THEME_CARDS and the deck's entire reanimation axis vanishes —
    // despite three reanimation spells that all plainly work together
    // (docs/archetypes.md's "Two relations between qualified signals").
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    const add = (name: string, qualifier: string | undefined) => {
      const row = makeCard(name);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('reanimator', ['rewards'], qualifier)]);
    };
    add('Generic Reanimation', undefined);
    add('Zombie Reanimation 1', 'Zombie');
    add('Zombie Reanimation 2', 'Zombie');

    const themes = analyzeDeck(owned, signals).themes;
    assert.strictEqual(themes.length, 1);
    assert.strictEqual(themes[0]!.label, 'reanimator (Zombie)');
    assert.strictEqual(themes[0]!.cardCount, 3);
    assert.deepStrictEqual(
      themes[0]!.cards.map((c) => c.name).sort(),
      ['Generic Reanimation', 'Zombie Reanimation 1', 'Zombie Reanimation 2'],
    );
  });

  it('folds into every qualified group of the same archetype, not just one', () => {
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    const add = (name: string, qualifier: string | undefined) => {
      const row = makeCard(name);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('reanimator', ['rewards'], qualifier)]);
    };
    add('Generic Reanimation', undefined);
    add('Zombie 1', 'Zombie');
    add('Zombie 2', 'Zombie');
    add('Elf 1', 'Elf');
    add('Elf 2', 'Elf');

    const themes = analyzeDeck(owned, signals).themes;
    const byLabel = new Map(themes.map((t) => [t.label, t]));
    assert.strictEqual(byLabel.get('reanimator (Zombie)')?.cardCount, 3);
    assert.strictEqual(byLabel.get('reanimator (Elf)')?.cardCount, 3);
  });

  it('a qualified signal never folds back into the unqualified group', () => {
    // The relation runs one way only: two Zombie-restricted effects must not
    // rescue a bare "Reanimator" theme that has nothing of its own.
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    const add = (name: string, qualifier: string | undefined) => {
      const row = makeCard(name);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('reanimator', ['rewards'], qualifier)]);
    };
    add('Generic Reanimation', undefined);
    add('Zombie 1', 'Zombie');
    add('Zombie 2', 'Zombie');

    const themes = analyzeDeck(owned, signals).themes;
    assert.strictEqual(themes.length, 1);
    assert.strictEqual(themes[0]!.label, 'reanimator (Zombie)');
  });

  it('does not fold across different archetypes', () => {
    const { owned, signals } = deckOf([
      ...themed('reanimator', 1, ['rewards'], 'r'),
      ...themed('spellslinger', 2, ['rewards'], 's'),
    ]);
    assert.deepStrictEqual(analyzeDeck(owned, signals).themes, []);
  });

  // --- kindred's own wildcard: same fold, gated by real depth -----------------

  it('a wildcard kindred card joins an already-substantial group and forms none of its own', () => {
    // Herald's Horn, in miniature: "choose a creature type" supports every
    // kindred qualifier, the same relation as the unqualified fold above —
    // but only once the target group already has real bodies of its own.
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    for (let i = 0; i < 4; i++) {
      const row = makeCard(`Goblin ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is'], 'Goblin')]);
    }
    for (let i = 0; i < 2; i++) {
      const row = makeCard(`Goblin Lord ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is', 'rewards'], 'Goblin')]);
    }
    const wildcard = makeCard("Herald's Horn");
    owned.push({ row: wildcard, quantity: 1 });
    signals.set(wildcard.oracle_id, [signal('kindred', ['rewards'], '*')]);

    const themes = analyzeDeck(owned, signals).themes;
    assert.strictEqual(themes.length, 1);
    assert.strictEqual(themes[0]!.label, 'kindred (Goblin)');
    assert.strictEqual(themes[0]!.cardCount, 7);
    assert.ok(themes[0]!.cards.some((c) => c.name === "Herald's Horn"));
  });

  it('a wildcard kindred card does not manufacture a theme from one incidental sighting', () => {
    // The regression this gate exists for: against the real First Sliver
    // corpus deck, an ungated fold let a handful of wildcard cards' 'rewards'
    // role clear kindred's own definingRequirement (minimum 2) on a type the
    // deck touched only once and never actually cared about — Realmwalker is
    // a printed Shapeshifter, Sliver Overlord a printed Mutant. Reproduced
    // here with the minimum that trips it: one real member, two wildcard
    // cards, no 'is' depth to justify a theme.
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    const solo = makeCard('Realmwalker');
    owned.push({ row: solo, quantity: 1 });
    signals.set(solo.oracle_id, [signal('kindred', ['is'], 'Shapeshifter')]);

    for (let i = 0; i < 2; i++) {
      const wildcard = makeCard(`Wildcard ${i}`);
      owned.push({ row: wildcard, quantity: 1 });
      signals.set(wildcard.oracle_id, [signal('kindred', ['rewards'], '*')]);
    }

    assert.deepStrictEqual(analyzeDeck(owned, signals).themes, []);
  });

  // --- Changeling: the same fold, deliberately ungated ------------------------

  it('a Changeling card joins a qualified group at the normal minimum, with no depth gate', () => {
    // Unlike the wildcard fold above, this needs no `MIN_THEME_CARDS` worth
    // of real bodies first — "this card is every creature type" (CR
    // 702.73a) is unconditionally true, not a guess about a future player
    // choice, so detectKindred emits it as a plain unqualified signal
    // (qualifier undefined) and it rides Phase B's pre-existing unqualified
    // fold instead of a dedicated gated one. Two real lords already clear
    // kindred's own two-card minimum on their own; the changeling just adds
    // membership on top.
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    for (let i = 0; i < 2; i++) {
      const row = makeCard(`Sliver Lord ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is', 'rewards'], 'Sliver')]);
    }
    const changeling = makeCard('Chomping Changeling');
    owned.push({ row: changeling, quantity: 1 });
    signals.set(changeling.oracle_id, [signal('kindred', ['is'])]);

    const themes = analyzeDeck(owned, signals).themes;
    assert.strictEqual(themes.length, 1);
    assert.strictEqual(themes[0]!.label, 'kindred (Sliver)');
    assert.strictEqual(themes[0]!.cardCount, 3);
    assert.ok(themes[0]!.cards.some((c) => c.name === 'Chomping Changeling'));
  });

  it('a Changeling card alone, with no real members anywhere, forms no theme of its own', () => {
    // Membership still counts cards, caring still makes a theme — a solo
    // changeling with nothing else in kindred is exactly one card, under
    // MIN_THEME_CARDS, the same as any other lone member.
    const changeling = makeCard('Chomping Changeling');
    const owned: OwnedCard[] = [{ row: changeling, quantity: 1 }];
    const signals = new Map([[changeling.oracle_id, [signal('kindred', ['is'])]]]);
    assert.deepStrictEqual(analyzeDeck(owned, signals).themes, []);
  });

  it('cards within a theme are listed in curve order', () => {
    const { owned, signals } = deckOf(
      [
        ['Expensive', 'aristocrats', ['rewards']],
        ['Cheap', 'aristocrats', ['rewards']],
        ['Middling', 'aristocrats', ['rewards']],
      ],
      { Expensive: 6, Cheap: 1, Middling: 3 },
    );
    const theme = analyzeDeck(owned, signals).themes[0]!;
    assert.deepStrictEqual(
      theme.cards.map((c) => c.name),
      ['Cheap', 'Middling', 'Expensive'],
    );
  });

  // --- lifecycle: whether the deck actually works -----------------------------

  it('an archetype with every slot filled reads as complete', () => {
    const { owned, signals } = deckOf([
      ...themed('aristocrats', 3, ['produces'], 'fodder'),
      ...themed('aristocrats', 2, ['consumes'], 'outlet'),
      ...themed('aristocrats', 3, ['rewards'], 'payoff'),
    ]);
    const theme = analyzeDeck(owned, signals).themes[0]!;
    assert.strictEqual(theme.complete, true);
    assert.deepStrictEqual(
      theme.slots.map((s) => s.filled),
      [true, true, true],
    );
  });

  it('a missing slot is named rather than just lowering a score', () => {
    // Fodder and payoffs but nothing to sacrifice with: the deck cannot
    // actually execute, and saying which slot is empty is the whole point.
    const { owned, signals } = deckOf([
      ...themed('aristocrats', 4, ['produces'], 'fodder'),
      ...themed('aristocrats', 5, ['rewards'], 'payoff'),
    ]);
    const theme = analyzeDeck(owned, signals).themes[0]!;
    assert.strictEqual(theme.complete, false);
    const outlet = theme.slots.find((s) => s.key === 'outlet');
    assert.ok(outlet);
    assert.strictEqual(outlet.filled, false);
    assert.strictEqual(outlet.cards.length, 0);
    assert.strictEqual(outlet.label, 'Sacrifice outlet');
  });

  it('the commonly-missing hint is carried through, flagged as a hint', () => {
    const { owned, signals } = deckOf([
      ...themed('aristocrats', 4, ['produces']),
      // At least one payoff, so the theme clears definingRequirement — this
      // test is about the missing outlet slot, not about payoff detection.
      ...themed('aristocrats', 1, ['rewards'], 'payoff'),
    ]);
    const theme = analyzeDeck(owned, signals).themes[0]!;
    const outlet = theme.slots.find((s) => s.key === 'outlet');
    assert.strictEqual(outlet?.commonlyMissing, true);
    // Fodder is not flagged — only the slot people actually forget.
    assert.strictEqual(theme.slots.find((s) => s.key === 'fodder')?.commonlyMissing, false);
  });

  it('one card can fill two slots without being double-counted as two cards', () => {
    // A card that both makes fodder and sacrifices it genuinely answers both
    // "can this deck make bodies?" and "can it convert them?".
    const { owned, signals } = deckOf([['Dual Role', 'aristocrats', ['produces', 'consumes']]]);
    const extra = deckOf(themed('aristocrats', 3, ['rewards'], 'p'));
    for (const entry of extra.owned) owned.push(entry);
    for (const [k, v] of extra.signals) signals.set(k, v);

    const theme = analyzeDeck(owned, signals).themes[0]!;
    assert.strictEqual(theme.cardCount, 4);
    assert.ok(
      theme.slots.find((s) => s.key === 'fodder')?.cards.some((c) => c.name === 'Dual Role'),
    );
    assert.ok(
      theme.slots.find((s) => s.key === 'outlet')?.cards.some((c) => c.name === 'Dual Role'),
    );
  });

  it('a slot filled by a DIFFERENT archetype is found', () => {
    // The case that would otherwise silently pass: nothing in Reanimator fills
    // a graveyard — Entomb and Buried Alive are Self-Mill cards. A list holding
    // every reanimation spell and no way to fill a graveyard must not read as
    // complete.
    const withoutFill = deckOf(themed('reanimator', 4, ['rewards'], 'r'));
    const noFill = analyzeDeck(withoutFill.owned, withoutFill.signals).themes.find(
      (t) => t.archetype === 'reanimator',
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
      (t) => t.archetype === 'reanimator',
    );
    assert.strictEqual(filled?.slots.find((s) => s.key === 'fill')?.filled, true);
    assert.strictEqual(filled?.complete, true);
  });

  it('an archetype with no lifecycle is never reported as incomplete', () => {
    // Keyword-care is a membership group, not an engine — "more Flying" is
    // not a missing slot, and inventing one would be a fabricated problem.
    // Kindred used to be the example here too, until the Sliver deck
    // disproved that for kindred specifically — see the block below.
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    for (let i = 0; i < 4; i++) {
      const row = makeCard(`Trample Payoff ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('keywordCare', ['rewards'], 'Trample')]);
    }
    const theme = analyzeDeck(owned, signals).themes[0]!;
    assert.deepStrictEqual(theme.slots, []);
    assert.strictEqual(theme.complete, true);
  });

  // --- kindred's own lifecycle --------------------------------------------

  it("kindred's lifecycle slots are scoped to the qualified theme, not every kindred card in the list", () => {
    // Goblin Kindred's slots must never show an Elf tutor, even though both
    // groups are the same bare 'kindred' archetype.
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    for (let i = 0; i < 8; i++) {
      const row = makeCard(`Goblin ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is'], 'Goblin')]);
    }
    for (let i = 0; i < 2; i++) {
      const row = makeCard(`Goblin Lord ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is', 'rewards'], 'Goblin')]);
    }
    const elfTutor = makeCard('Elf Tutor');
    owned.push({ row: elfTutor, quantity: 1 });
    signals.set(elfTutor.oracle_id, [signal('kindred', ['produces'], 'Elf')]);
    // Two lords clear Elf's own two-card minimum too, so it reports as a
    // theme in its own right and isn't just silently dropped.
    for (let i = 0; i < 2; i++) {
      const row = makeCard(`Elf Lord ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is', 'rewards'], 'Elf')]);
    }

    const goblinTheme = analyzeDeck(owned, signals).themes.find((t) => t.qualifier === 'Goblin')!;
    const tutorSlot = goblinTheme.slots.find((s) => s.key === 'toolbox')!;
    assert.deepStrictEqual(tutorSlot.cards, []);
  });

  it('a tribal deck with bodies and lords but no engine, tutors, or resilience reads as incomplete', () => {
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    for (let i = 0; i < 8; i++) {
      const row = makeCard(`Goblin ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is'], 'Goblin')]);
    }
    for (let i = 0; i < 2; i++) {
      const row = makeCard(`Goblin Lord ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is', 'rewards'], 'Goblin')]);
    }
    const theme = analyzeDeck(owned, signals).themes[0]!;
    assert.strictEqual(theme.complete, false);
    assert.strictEqual(theme.slots.find((s) => s.key === 'bodies')?.filled, true);
    assert.strictEqual(theme.slots.find((s) => s.key === 'payoff')?.filled, true);
    assert.strictEqual(theme.slots.find((s) => s.key === 'engine')?.filled, false);
    assert.strictEqual(theme.slots.find((s) => s.key === 'toolbox')?.filled, false);
    assert.strictEqual(theme.slots.find((s) => s.key === 'resilience')?.filled, false);
    // Engine and resilience are the ones flagged as commonly forgotten —
    // tutors is a nice-to-have, not the slot people typically skip.
    assert.strictEqual(theme.slots.find((s) => s.key === 'engine')?.commonlyMissing, true);
    assert.strictEqual(theme.slots.find((s) => s.key === 'resilience')?.commonlyMissing, true);
    assert.strictEqual(theme.slots.find((s) => s.key === 'toolbox')?.commonlyMissing, false);
  });

  it('every kindred slot filled reads as complete', () => {
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    for (let i = 0; i < 8; i++) {
      const row = makeCard(`Sliver ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is'], 'Sliver')]);
    }
    for (let i = 0; i < 2; i++) {
      const row = makeCard(`Sliver Lord ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is', 'rewards'], 'Sliver')]);
    }
    const engine = makeCard('Gemhide Sliver');
    owned.push({ row: engine, quantity: 1 });
    signals.set(engine.oracle_id, [signal('kindred', ['is', 'enables'], 'Sliver')]);
    const tutor = makeCard('Sliver Overlord');
    owned.push({ row: tutor, quantity: 1 });
    signals.set(tutor.oracle_id, [signal('kindred', ['is', 'produces'], 'Sliver')]);
    const resilience = makeCard('Sliver Hivelord');
    owned.push({ row: resilience, quantity: 1 });
    signals.set(resilience.oracle_id, [signal('kindred', ['is', 'protects'], 'Sliver')]);

    const theme = analyzeDeck(owned, signals).themes[0]!;
    assert.strictEqual(theme.complete, true);
    assert.ok(theme.slots.every((s) => s.filled));
  });

  it('cards that merely have a keyword do not make it a theme', () => {
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

  it('cards that actively care about a keyword do make it a theme', () => {
    // 'rewards' specifically, not merely an active role: granting a keyword
    // to the team (produces) is not caring about it — see
    // definingRequirement and the Flying/Haste/Lifelink keyword-shadow rule
    // in archetypes.md.
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    for (let i = 0; i < 4; i++) {
      const row = makeCard(`Trample Payoff ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('keywordCare', ['rewards'], 'Trample')]);
    }
    const themes = analyzeDeck(owned, signals).themes;
    assert.strictEqual(themes.length, 1);
    assert.strictEqual(themes[0]!.cardCount, 4);
  });

  it('granting a keyword to the team is not the same as caring about it', () => {
    // The Miles/Flying false positive: a commander (or the list) that merely
    // hands out a keyword is not a theme for it, even though "grants it" is
    // an active role in every other sense.
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    for (let i = 0; i < 5; i++) {
      const row = makeCard(`Flier Granter ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('keywordCare', ['produces'], 'Flying')]);
    }
    assert.deepStrictEqual(analyzeDeck(owned, signals).themes, []);
  });

  it('kindred needs at least two cards that care, not just members', () => {
    // Ten Wizards plus one incidental pump is not a Wizard deck — membership
    // alone cannot clear kindred's own two-card minimum on its defining
    // role. Once two lords clear it, every Goblin counts, including the
    // passive ones: membership counts cards, caring makes a theme.
    const owned: OwnedCard[] = [];
    const signals = new Map<string, SignalMatch[]>();
    for (let i = 0; i < 4; i++) {
      const row = makeCard(`Goblin ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['is'], 'Goblin')]);
    }
    assert.deepStrictEqual(analyzeDeck(owned, signals).themes, []);

    for (let i = 0; i < 2; i++) {
      const row = makeCard(`Goblin Lord ${i}`);
      owned.push({ row, quantity: 1 });
      signals.set(row.oracle_id, [signal('kindred', ['rewards'], 'Goblin')]);
    }
    assert.strictEqual(analyzeDeck(owned, signals).themes[0]!.cardCount, 6);
  });

  it('an empty list produces no themes rather than throwing', () => {
    assert.deepStrictEqual(analyzeDeck([], new Map()).themes, []);
  });
});
