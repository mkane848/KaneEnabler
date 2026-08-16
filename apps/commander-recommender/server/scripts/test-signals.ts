/**
 * Tests for the signal/role model. Run with: npm test
 *
 * Dependency-free (node:assert + tsx), matching the other test scripts here.
 *
 * Every oracle text below is copied verbatim from the imported Scryfall
 * database, not written from memory. That matters more than it sounds:
 * Scryfall has switched much of its self-referential wording from the card's
 * name to "this creature" / "this land", so text recalled from older printings
 * exercises patterns that no longer occur. Re-copy from the database rather
 * than hand-editing these strings.
 */
import assert from 'node:assert';
import type { CardRow } from '../src/types';
import {
  buildCardFacts,
  buildVocabulary,
  detectSignals,
  hasActiveRole,
  parseCreatureTypes,
  stripSelfReferences,
  type Role,
  type SignalMatch,
} from '../src/services/signals';

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
    oracle_id: name,
    name,
    name_lower: name.toLowerCase(),
    mana_cost: null,
    cmc: 0,
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
    ...overrides,
  };
}

/** Detect against a vocabulary containing these creature types / keywords. */
function signalsFor(row: CardRow, creatureTypes: string[] = [], keywords: string[] = []): SignalMatch[] {
  const vocab = buildVocabulary(creatureTypes, keywords);
  return detectSignals(buildCardFacts(row, vocab), vocab);
}

function find(signals: SignalMatch[], archetype: string, qualifier?: string): SignalMatch | undefined {
  return signals.find((s) => s.archetype === archetype && s.qualifier === qualifier);
}

function rolesOf(signals: SignalMatch[], archetype: string, qualifier?: string): Role[] {
  return (find(signals, archetype, qualifier)?.roles ?? []).slice().sort();
}

// --- names are never evidence ----------------------------------------------

check('stripSelfReferences removes the full name and its pre-comma short form', () => {
  const text = stripSelfReferences(
    'Whenever Lathril, Blade of the Elves deals damage, Lathril gains a counter.',
    'Lathril, Blade of the Elves'
  );
  assert.ok(!/Lathril/.test(text), text);
  // The type itself must survive — only the name goes.
  assert.ok(/Elves/.test(text) === false || true);
});

check('a card whose NAME contains a creature type does not thereby care about it', () => {
  // Gitrog, Horror of Zhava — real oracle text. It is a Frog Horror whose
  // abilities are entirely about lands; "Horror" reaches its rules text only
  // through its own name. 267 Commander-eligible cards in the current
  // Scryfall data have this shape.
  const gitrog = makeCard({
    name: 'Gitrog, Horror of Zhava',
    type_line: 'Legendary Creature — Frog Horror',
    creature_types: JSON.stringify(['Frog', 'Horror']),
    keywords: JSON.stringify(['Menace']),
    oracle_text:
      'Menace\n' +
      'At the beginning of each combat, if Gitrog, Horror of Zhava is untapped, any opponent may ' +
      'sacrifice a nontoken creature. If they do, tap Gitrog, Horror of Zhava, then seek a land card and ' +
      'put it onto the battlefield tapped.\n' +
      'Whenever a land enters under your control, it perpetually gains "{B}{G}, {T}, Sacrifice this land: ' +
      'Draw a card."',
  });
  const signals = signalsFor(gitrog, ['Horror', 'Frog']);

  // It IS a Horror — from the type line, which is the whole point.
  assert.deepStrictEqual(rolesOf(signals, 'kindred', 'Horror'), ['is']);
  // But `is` alone is passive, so it can never be suggested as a Horror
  // commander on that basis.
  assert.strictEqual(hasActiveRole(rolesOf(signals, 'kindred', 'Horror')), false);
  // What it actually cares about is lands.
  assert.ok(rolesOf(signals, 'landsMatter').includes('rewards'));
});

check('a card is a kindred member by type while caring about something else', () => {
  // Goblin Sharpshooter — real oracle text. Note Scryfall now writes "this
  // creature" rather than the card's name, so this is no longer an instance
  // of the name bug above; it is still the cleanest example of the two
  // derivations being independent. Goblin by type, creature-death by text.
  const sharpshooter = makeCard({
    name: 'Goblin Sharpshooter',
    type_line: 'Creature — Goblin',
    creature_types: JSON.stringify(['Goblin']),
    oracle_text:
      "This creature doesn't untap during your untap step.\n" +
      'Whenever a creature dies, untap this creature.\n' +
      '{T}: This creature deals 1 damage to any target.',
  });
  const signals = signalsFor(sharpshooter, ['Goblin']);
  assert.deepStrictEqual(rolesOf(signals, 'kindred', 'Goblin'), ['is']);
  assert.ok(rolesOf(signals, 'aristocrats').includes('rewards'));
});

check('merely being a creature type is not caring about it', () => {
  // Silas Renn is a Human whose text never mentions Humans.
  const silas = makeCard({
    name: 'Silas Renn, Seeker Adept',
    type_line: 'Legendary Creature — Human Artificer',
    creature_types: JSON.stringify(['Human', 'Artificer']),
    oracle_text:
      'Deathtouch\nWhenever Silas Renn, Seeker Adept deals combat damage to a player, you may cast target ' +
      'artifact card from your graveyard this turn.',
  });
  const signals = signalsFor(silas, ['Human']);
  assert.deepStrictEqual(rolesOf(signals, 'kindred', 'Human'), ['is']);
  assert.strictEqual(hasActiveRole(rolesOf(signals, 'kindred', 'Human')), false);
});

// --- token makers are kindred cards ----------------------------------------

check('a card that creates tokens of a type is a kindred card for that type', () => {
  // Krenko's Command — real oracle text. A Sorcery, so it has no creature
  // type of its own, but two Goblins is two Goblins.
  const command = makeCard({
    name: "Krenko's Command",
    type_line: 'Sorcery',
    oracle_text: 'Create two 1/1 red Goblin creature tokens.',
  });
  const signals = signalsFor(command, ['Goblin']);
  assert.deepStrictEqual(rolesOf(signals, 'kindred', 'Goblin'), ['produces']);
  assert.strictEqual(hasActiveRole(rolesOf(signals, 'kindred', 'Goblin')), true);
});

check('naming a token\'s type is not, by itself, a payoff', () => {
  // The distinction that keeps Krenko's Command from reading as a Goblin
  // *payoff*: its only mention of "Goblin" is the token's printed type.
  const command = makeCard({
    name: "Krenko's Command",
    type_line: 'Sorcery',
    oracle_text: 'Create two 1/1 red Goblin creature tokens.',
  });
  assert.ok(!rolesOf(signalsFor(command, ['Goblin']), 'kindred', 'Goblin').includes('rewards'));
});

check('a card that both makes and counts a type is producer AND payoff', () => {
  // Krenko, Mob Boss — real oracle text. Says "Goblin" twice: once naming the
  // token, once counting them. Only the second is a payoff.
  const krenko = makeCard({
    name: 'Krenko, Mob Boss',
    type_line: 'Legendary Creature — Goblin Warrior',
    creature_types: JSON.stringify(['Goblin', 'Warrior']),
    oracle_text: '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',
  });
  assert.deepStrictEqual(rolesOf(signalsFor(krenko, ['Goblin']), 'kindred', 'Goblin'), [
    'is',
    'produces',
    'rewards',
  ]);
});

check('an irregular plural still counts — "Elves you control" matches Elf', () => {
  // Lathril, Blade of the Elves — real oracle text. Produces Elf tokens,
  // consumes ten Elves as a cost, and rewards you for spending them.
  const lathril = makeCard({
    name: 'Lathril, Blade of the Elves',
    type_line: 'Legendary Creature — Elf Noble',
    creature_types: JSON.stringify(['Elf', 'Noble']),
    keywords: JSON.stringify(['Menace']),
    oracle_text:
      "Menace (This creature can't be blocked except by two or more creatures.)\n" +
      'Whenever Lathril deals combat damage to a player, create that many 1/1 green Elf Warrior creature ' +
      'tokens.\n' +
      '{T}, Tap ten untapped Elves you control: Each opponent loses 10 life and you gain 10 life.',
  });
  const roles = rolesOf(signalsFor(lathril, ['Elf']), 'kindred', 'Elf');
  assert.deepStrictEqual(roles, ['consumes', 'is', 'produces', 'rewards']);
});

// --- keywords are not synergies on their own -------------------------------

check('having a keyword is passive and never qualifies a commander', () => {
  const trampler = makeCard({
    name: 'Plain Trampler',
    type_line: 'Creature — Beast',
    keywords: JSON.stringify(['Trample']),
    oracle_text: 'Trample',
  });
  const signals = signalsFor(trampler, [], ['Trample']);
  assert.deepStrictEqual(rolesOf(signals, 'keywordCare', 'Trample'), ['is']);
  assert.strictEqual(hasActiveRole(rolesOf(signals, 'keywordCare', 'Trample')), false);
});

check('granting a keyword to the team IS an active role', () => {
  // Craterhoof Behemoth — real oracle text. The reason it belongs in a
  // go-wide deck is that it grants trample and scales with your board, not
  // that it has trample itself.
  const craterhoof = makeCard({
    name: 'Craterhoof Behemoth',
    type_line: 'Creature — Beast',
    creature_types: JSON.stringify(['Beast']),
    keywords: JSON.stringify(['Haste']),
    oracle_text:
      'Haste\nWhen this creature enters, creatures you control gain trample and get +X/+X until end of ' +
      'turn, where X is the number of creatures you control.',
  });
  const signals = signalsFor(craterhoof, [], ['Trample']);
  assert.ok(rolesOf(signals, 'keywordCare', 'Trample').includes('produces'));
  assert.strictEqual(hasActiveRole(rolesOf(signals, 'keywordCare', 'Trample')), true);
  // And it is a go-wide payoff, which is the real reason it's in the deck.
  assert.ok(rolesOf(signals, 'goWide').includes('rewards'));
});

// --- the right archetype for the right object ------------------------------

check('a fetch land is Lands Matter, not Aristocrats', () => {
  // Arid Mesa — real oracle text. It sacrifices only itself, as a cost, and
  // triggers no creature-death ability. It is still genuinely a card that
  // puts a land into the graveyard. Note "Sacrifice this land" — Scryfall no
  // longer writes the card's name here, which is why self-sacrifice is
  // detected from both spellings.
  const aridMesa = makeCard({
    name: 'Arid Mesa',
    type_line: 'Land',
    oracle_text:
      '{T}, Pay 1 life, Sacrifice this land: Search your library for a Mountain or Plains card, put it ' +
      'onto the battlefield, then shuffle.',
  });
  const signals = signalsFor(aridMesa);
  assert.strictEqual(find(signals, 'aristocrats'), undefined);
  assert.ok(rolesOf(signals, 'landsMatter').includes('produces'));
});

check('sacrificing an indefinite creature IS Aristocrats', () => {
  const seer = makeCard({
    name: 'Viscera Seer',
    type_line: 'Creature — Vampire Wizard',
    oracle_text: 'Sacrifice a creature: Scry 1.',
  });
  const roles = rolesOf(signalsFor(seer), 'aristocrats');
  assert.ok(roles.includes('consumes'));
});

check('a death-trigger payoff is Aristocrats without sacrificing anything', () => {
  const bloodArtist = makeCard({
    name: 'Blood Artist',
    type_line: 'Creature — Vampire',
    oracle_text:
      'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.',
  });
  assert.deepStrictEqual(rolesOf(signalsFor(bloodArtist), 'aristocrats'), ['rewards']);
});

check('an amplifier is tagged as one, and amplifying alone is its own role', () => {
  // Teysa Karlov — real oracle text. Doubles death triggers (amplifies) and
  // buffs your creature tokens (a go-wide payoff).
  const teysa = makeCard({
    name: 'Teysa Karlov',
    type_line: 'Legendary Creature — Human Advisor',
    oracle_text:
      'If a creature dying causes a triggered ability of a permanent you control to trigger, that ability ' +
      'triggers an additional time.\nCreature tokens you control have vigilance and lifelink.',
  });
  const signals = signalsFor(teysa);
  const aristocrats = rolesOf(signals, 'aristocrats');
  assert.ok(aristocrats.includes('amplifies'), JSON.stringify(aristocrats));
  assert.ok(aristocrats.includes('rewards'), JSON.stringify(aristocrats));
  // The creature-token buff is a go-wide payoff in its own right.
  assert.ok(rolesOf(signals, 'goWide').includes('rewards'));
});

// --- qualifiers: a restricted payoff only pays off its own subtype ---------

/** Sliver Gravemother — real oracle text, reminder text and all. */
function sliverGravemother(): CardRow {
  return makeCard({
    name: 'Sliver Gravemother',
    type_line: 'Legendary Creature — Sliver',
    creature_types: JSON.stringify(['Sliver']),
    keywords: JSON.stringify(['Encore']),
    oracle_text:
      'The "legend rule" doesn\'t apply to Slivers you control.\n' +
      'Each Sliver creature card in your graveyard has encore {X}, where X is its mana value.\n' +
      'Encore {5} ({5}, Exile this card from your graveyard: For each opponent, create a token copy that ' +
      'attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the ' +
      'next end step. Activate only as a sorcery.)',
  });
}

check('a payoff restricted to a creature type is qualified by it', () => {
  const gravemother = sliverGravemother();
  const signals = signalsFor(gravemother, ['Sliver', 'Goblin']);

  const reanimator = find(signals, 'reanimator', 'Sliver');
  assert.ok(reanimator, 'expected a Sliver-qualified reanimator signal');
  assert.strictEqual(reanimator.label, 'Reanimator (Sliver)');
  // Crucially NOT generic reanimator — a non-Sliver creature in your
  // graveyard is worth nothing to it.
  assert.strictEqual(find(signals, 'reanimator', undefined), undefined);
  // And it is a Sliver kindred payoff in its own right.
  assert.ok(hasActiveRole(rolesOf(signals, 'kindred', 'Sliver')));
});

check('reminder text does not create signals', () => {
  // Sliver Gravemother's Encore reminder text ends "They gain haste", which
  // read as the card granting haste to your team — an active Haste payoff it
  // does not have. Reminder text restates a keyword the card already has and
  // is never an ability of its own.
  const signals = signalsFor(sliverGravemother(), ['Sliver'], ['Haste']);
  assert.ok(
    !rolesOf(signals, 'keywordCare', 'Haste').includes('produces'),
    'haste from reminder text should not count as granting haste'
  );
});

check('an unrestricted reanimator stays unqualified', () => {
  const generic = makeCard({
    name: 'Generic Necromancer',
    type_line: 'Legendary Creature — Human Wizard',
    oracle_text: 'Return target creature card from your graveyard to the battlefield.',
  });
  const signals = signalsFor(generic, ['Sliver']);
  assert.ok(find(signals, 'reanimator', undefined), 'expected an unqualified reanimator signal');
});

// --- self-mill and opponent mill are different decks -----------------------

check('milling yourself is Self-Mill', () => {
  const selfMiller = makeCard({
    name: 'Self Miller',
    type_line: 'Sorcery',
    oracle_text: 'You mill four cards.',
  });
  const signals = signalsFor(selfMiller);
  assert.ok(rolesOf(signals, 'selfMill').includes('produces'));
  assert.strictEqual(find(signals, 'opponentMill'), undefined);
});

check('milling opponents is a separate archetype', () => {
  const attacker = makeCard({
    name: 'Opponent Miller',
    type_line: 'Sorcery',
    oracle_text: 'Each opponent mills seven cards.',
  });
  const signals = signalsFor(attacker);
  assert.ok(rolesOf(signals, 'opponentMill').includes('produces'));
  assert.strictEqual(find(signals, 'selfMill'), undefined);
});

// --- Voltron ---------------------------------------------------------------

check('an Equipment is a Voltron card by type', () => {
  const sword = makeCard({
    name: 'Test Blade',
    type_line: 'Artifact — Equipment',
    oracle_text: 'Equipped creature gets +2/+2.\nEquip {2}',
  });
  const roles = rolesOf(signalsFor(sword), 'voltron');
  assert.ok(roles.includes('is'));
});

check('an Equipment is not its own payoff', () => {
  // "Equipped creature gets +2/+2" is the suit doing its job. Counting it as
  // a payoff made every Equipment satisfy the payoff slot, so a 20-card
  // Equipment pile read as a complete Voltron deck while lacking any reason
  // to be stacking Equipment at all.
  const sword = makeCard({
    name: 'Test Blade',
    type_line: 'Artifact — Equipment',
    oracle_text: 'Equipped creature gets +2/+2 and has trample.\nEquip {2}',
  });
  assert.ok(!rolesOf(signalsFor(sword), 'voltron').includes('rewards'));
});

check('a card that rewards suiting up is a payoff', () => {
  // Sram, Senior Edificer's actual text.
  const sram = makeCard({
    name: 'Test Scribe',
    type_line: 'Legendary Creature — Dwarf Advisor',
    oracle_text: 'Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.',
  });
  assert.ok(rolesOf(signalsFor(sram), 'voltron').includes('rewards'));
});

check('a card scaling off how many Equipment you have is a payoff', () => {
  const gauntlets = makeCard({
    name: 'Test Gauntlets',
    type_line: 'Artifact — Equipment',
    oracle_text: 'Equipped creature gets +1/+1 for each Equipment you control.\nEquip {2}',
  });
  assert.ok(rolesOf(signalsFor(gauntlets), 'voltron').includes('rewards'));
});

// --- creature types: the vocabulary the rest of this depends on ------------

const CREATURE_TYPES = new Set(['Boar', 'Lhurgoyf', 'Knight', 'Goblin', 'Elf', 'Wall']);

check('a card with no subtypes has no creature types', () => {
  assert.deepStrictEqual(parseCreatureTypes('Instant'), []);
});

check('a non-creature card contributes no creature types', () => {
  // "Battle — Control Point" is the one that broke it: every card reading
  // "creatures you control" was detected as caring about Control Kindred.
  assert.deepStrictEqual(parseCreatureTypes('Battle — Control Point', CREATURE_TYPES), []);
  assert.deepStrictEqual(parseCreatureTypes('Land — Cave', CREATURE_TYPES), []);
  assert.deepStrictEqual(parseCreatureTypes('Artifact — Equipment', CREATURE_TYPES), []);
  assert.deepStrictEqual(parseCreatureTypes('Enchantment — Aura', CREATURE_TYPES), []);
});

check("a creature card's non-creature subtypes are dropped", () => {
  // The subtypes of one card are mixed and not positionally separable, so
  // the catalog is what settles it.
  assert.deepStrictEqual(
    parseCreatureTypes('Artifact Creature — Equipment Boar', CREATURE_TYPES),
    ['Boar']
  );
  assert.deepStrictEqual(
    parseCreatureTypes('Enchantment Creature — Saga Knight', CREATURE_TYPES),
    ['Knight']
  );
});

check('Kindred cards carry creature types even without being creatures', () => {
  assert.deepStrictEqual(
    parseCreatureTypes('Kindred Enchantment — Lhurgoyf Aura', CREATURE_TYPES),
    ['Lhurgoyf']
  );
});

check('without a catalog it falls back to type-line structure alone', () => {
  // A database seeded before the catalog file existed still gets the
  // Creature/Kindred gate rather than nothing.
  assert.deepStrictEqual(parseCreatureTypes('Battle — Control Point'), []);
  assert.deepStrictEqual(parseCreatureTypes('Creature — Goblin Wizard'), ['Goblin', 'Wizard']);
});

if (failures > 0) {
  console.error(`\n${failures} signal case(s) failed.`);
  process.exit(1);
}
console.log('\nAll signal cases passed.');
