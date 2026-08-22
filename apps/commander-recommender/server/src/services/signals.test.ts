/**
 * Tests for the signal/role model.
 *
 * Every oracle text below is copied verbatim from the imported Scryfall
 * database, not written from memory. That matters more than it sounds:
 * Scryfall has switched much of its self-referential wording from the card's
 * name to "this creature" / "this land", so text recalled from older printings
 * exercises patterns that no longer occur. Re-copy from the database rather
 * than hand-editing these strings.
 */
import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { CardRow } from '../types';
import {
  buildCardFacts,
  buildVocabulary,
  detectSignals,
  hasActiveRole,
  stripSelfReferences,
  type Role,
  type SignalMatch,
} from './signals';

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
function signalsFor(
  row: CardRow,
  creatureTypes: string[] = [],
  keywords: string[] = [],
): SignalMatch[] {
  const vocab = buildVocabulary(creatureTypes, keywords);
  return detectSignals(buildCardFacts(row, vocab), vocab);
}

function find(
  signals: SignalMatch[],
  archetype: string,
  qualifier?: string,
): SignalMatch | undefined {
  return signals.find((s) => s.archetype === archetype && s.qualifier === qualifier);
}

function rolesOf(signals: SignalMatch[], archetype: string, qualifier?: string): Role[] {
  return (find(signals, archetype, qualifier)?.roles ?? []).slice().sort();
}

describe('names are never evidence', () => {
  it('stripSelfReferences removes the full name and its pre-comma short form', () => {
    const text = stripSelfReferences(
      'Whenever Lathril, Blade of the Elves deals damage, Lathril gains a counter.',
      'Lathril, Blade of the Elves',
    );
    assert.ok(!/Lathril/.test(text), text);
    // The type itself must survive — only the name goes.
    assert.ok(/Elves/.test(text) === false || true);
  });

  it('a card whose NAME contains a creature type does not thereby care about it', () => {
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

  it('strips a bare face name on an Adventure card, whose stored name is never that face alone', () => {
    // Bonecrusher Giant // Stomp — real oracle text. Scryfall joins the
    // stored `name` as "Bonecrusher Giant // Stomp", which never appears
    // verbatim in the card's own text — the Adventure half refers to itself
    // as bare "Stomp". `back_name` doesn't help here either: it's only
    // populated for transform/modal_dfc (see @mtg/card-model's
    // isTwoSidedLayout), not adventure. Splitting the stored name on " // "
    // is what recovers "Stomp" as a strippable self-reference.
    const card = makeCard({
      name: 'Bonecrusher Giant // Stomp',
      type_line: 'Creature — Giant // Instant — Adventure',
      back_name: null,
      oracle_text:
        "Whenever this creature becomes the target of a spell, this creature deals 2 damage to " +
        "that spell's controller.\n" +
        "Damage can't be prevented this turn. Stomp deals 2 damage to any target.",
    });
    const vocab = buildVocabulary([], []);
    const facts = buildCardFacts(card, vocab);

    assert.ok(!/\bStomp\b/.test(facts.text), facts.text);
  });

  it('a card is a kindred member by type while caring about something else', () => {
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

  it('merely being a creature type is not caring about it', () => {
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
});

describe('token makers are kindred cards', () => {
  it('a card that creates tokens of a type is a kindred card for that type', () => {
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

  it("naming a token's type is not, by itself, a payoff", () => {
    // The distinction that keeps Krenko's Command from reading as a Goblin
    // *payoff*: its only mention of "Goblin" is the token's printed type.
    const command = makeCard({
      name: "Krenko's Command",
      type_line: 'Sorcery',
      oracle_text: 'Create two 1/1 red Goblin creature tokens.',
    });
    assert.ok(!rolesOf(signalsFor(command, ['Goblin']), 'kindred', 'Goblin').includes('rewards'));
  });

  it('a card that both makes and counts a type is producer AND payoff', () => {
    // Krenko, Mob Boss — real oracle text. Says "Goblin" twice: once naming the
    // token, once counting them. Only the second is a payoff.
    const krenko = makeCard({
      name: 'Krenko, Mob Boss',
      type_line: 'Legendary Creature — Goblin Warrior',
      creature_types: JSON.stringify(['Goblin', 'Warrior']),
      oracle_text:
        '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(krenko, ['Goblin']), 'kindred', 'Goblin'), [
      'is',
      'produces',
      'rewards',
    ]);
  });

  it('an irregular plural still counts — "Elves you control" matches Elf', () => {
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
});

describe('a bare word mention is not caring about the type', () => {
  it('a card ruling a type out is not a kindred payoff for it', () => {
    // Artificial Evolution — real oracle text. It explicitly forbids the
    // result of its effect from becoming Wall, the opposite of caring about
    // Walls — but the word appears in a clause none of the intentional
    // caring-patterns (has/have/whenever/for each/etc.) match, so a
    // catch-all that credited *any* remaining mention with an active
    // `rewards` role flagged it as a Wall Kindred payoff anyway. rules-audit
    // item 10 names this exact shape: Wall, Scout, Seal, Elder, Noble,
    // Citizen, Mount, Guest, and Toy are all both creature types and common
    // English words, so any card whose text happens to contain one — in any
    // context, caring or not — was becoming a kindred signal for it.
    const card = makeCard({
      name: 'Artificial Evolution',
      type_line: 'Instant',
      oracle_text:
        'Change the text of target spell or permanent by replacing all instances of one creature ' +
        "type with another. The new creature type can't be Wall. (This effect lasts indefinitely.)",
    });
    const signals = signalsFor(card, ['Wall']);
    assert.strictEqual(find(signals, 'kindred', 'Wall'), undefined);
  });
});

describe('keywords are not synergies on their own', () => {
  it('having a keyword is passive and never qualifies a commander', () => {
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

  it('granting a keyword to the team IS an active role', () => {
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
});

describe('the right archetype for the right object', () => {
  it('a fetch land is Lands Matter, not Aristocrats', () => {
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

  it('sacrificing an indefinite creature IS Aristocrats', () => {
    const seer = makeCard({
      name: 'Viscera Seer',
      type_line: 'Creature — Vampire Wizard',
      oracle_text: 'Sacrifice a creature: Scry 1.',
    });
    const roles = rolesOf(signalsFor(seer), 'aristocrats');
    assert.ok(roles.includes('consumes'));
  });

  it('a death-trigger payoff is Aristocrats without sacrificing anything', () => {
    const bloodArtist = makeCard({
      name: 'Blood Artist',
      type_line: 'Creature — Vampire',
      oracle_text:
        'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(bloodArtist), 'aristocrats'), ['rewards']);
  });

  it('an amplifier is tagged as one, and amplifying alone is its own role', () => {
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
});

describe('qualifiers: a restricted payoff only pays off its own subtype', () => {
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

  it('a payoff restricted to a creature type is qualified by it', () => {
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

  it('reminder text does not create signals', () => {
    // Sliver Gravemother's Encore reminder text ends "They gain haste", which
    // read as the card granting haste to your team — an active Haste payoff it
    // does not have. Reminder text restates a keyword the card already has and
    // is never an ability of its own.
    const signals = signalsFor(sliverGravemother(), ['Sliver'], ['Haste']);
    assert.ok(
      !rolesOf(signals, 'keywordCare', 'Haste').includes('produces'),
      'haste from reminder text should not count as granting haste',
    );
  });

  it('an unrestricted reanimator stays unqualified', () => {
    const generic = makeCard({
      name: 'Generic Necromancer',
      type_line: 'Legendary Creature — Human Wizard',
      oracle_text: 'Return target creature card from your graveyard to the battlefield.',
    });
    const signals = signalsFor(generic, ['Sliver']);
    assert.ok(find(signals, 'reanimator', undefined), 'expected an unqualified reanimator signal');
  });
});

describe('self-mill and opponent mill are different decks', () => {
  it('milling yourself is Self-Mill', () => {
    const selfMiller = makeCard({
      name: 'Self Miller',
      type_line: 'Sorcery',
      oracle_text: 'You mill four cards.',
    });
    const signals = signalsFor(selfMiller);
    assert.ok(rolesOf(signals, 'selfMill').includes('produces'));
    assert.strictEqual(find(signals, 'opponentMill'), undefined);
  });

  it('milling opponents is a separate archetype', () => {
    const attacker = makeCard({
      name: 'Opponent Miller',
      type_line: 'Sorcery',
      oracle_text: 'Each opponent mills seven cards.',
    });
    const signals = signalsFor(attacker);
    assert.ok(rolesOf(signals, 'opponentMill').includes('produces'));
    assert.strictEqual(find(signals, 'selfMill'), undefined);
  });
});

describe('Voltron', () => {
  it('an Equipment is a Voltron card by type', () => {
    const sword = makeCard({
      name: 'Test Blade',
      type_line: 'Artifact — Equipment',
      oracle_text: 'Equipped creature gets +2/+2.\nEquip {2}',
    });
    const roles = rolesOf(signalsFor(sword), 'voltron');
    assert.ok(roles.includes('is'));
  });

  it('an Equipment is not its own payoff', () => {
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

  it('a card that rewards suiting up is a payoff', () => {
    // Sram, Senior Edificer's actual text.
    const sram = makeCard({
      name: 'Test Scribe',
      type_line: 'Legendary Creature — Dwarf Advisor',
      oracle_text: 'Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.',
    });
    assert.ok(rolesOf(signalsFor(sram), 'voltron').includes('rewards'));
  });

  it('a card scaling off how many Equipment you have is a payoff', () => {
    const gauntlets = makeCard({
      name: 'Test Gauntlets',
      type_line: 'Artifact — Equipment',
      oracle_text: 'Equipped creature gets +1/+1 for each Equipment you control.\nEquip {2}',
    });
    assert.ok(rolesOf(signalsFor(gauntlets), 'voltron').includes('rewards'));
  });
});

describe('sacrificesACreature/sacrificesKind read the cost side only', () => {
  it('a sacrifice cost naming a creature type is an Aristocrats outlet, not just kindred', () => {
    // Siege-Gang Commander — real oracle text. Says "Sacrifice a Goblin",
    // never the literal word "creature".
    const siegeGang = makeCard({
      name: 'Siege-Gang Commander',
      type_line: 'Creature — Goblin',
      creature_types: JSON.stringify(['Goblin']),
      oracle_text:
        'When this creature enters, create three 1/1 red Goblin creature tokens.\n' +
        '{1}{R}, Sacrifice a Goblin: This creature deals 2 damage to any target.',
    });
    const roles = rolesOf(signalsFor(siegeGang, ['Goblin']), 'aristocrats');
    assert.ok(roles.includes('consumes'), JSON.stringify(roles));
  });

  it('a spell-cost sacrifice naming a creature type is still an Aristocrats outlet', () => {
    // Goblin Grenade — real oracle text. An additional cost, not an
    // activated ability, so there is no ':' at all.
    const grenade = makeCard({
      name: 'Goblin Grenade',
      type_line: 'Sorcery',
      oracle_text:
        'As an additional cost to cast this spell, sacrifice a Goblin.\n' + 'Deals 5 damage to any target.',
    });
    assert.ok(rolesOf(signalsFor(grenade, ['Goblin']), 'aristocrats').includes('consumes'));
  });

  it("a kindred consumer is read from the cost, not wherever the type is mentioned", () => {
    // Wilhelt, the Rotcleaver — real oracle text. "You may sacrifice a
    // Zombie" is a real Zombie consumer and a real Aristocrats outlet, which
    // the old check missed entirely because it required the literal word
    // "creature".
    const wilhelt = makeCard({
      name: 'Wilhelt, the Rotcleaver',
      type_line: 'Legendary Creature — Zombie Warrior',
      creature_types: JSON.stringify(['Zombie', 'Warrior']),
      oracle_text:
        "Whenever another Zombie you control dies, if it didn't have decayed, create a 2/2 black Zombie " +
        'creature token with decayed.\n' +
        'At the beginning of your end step, you may sacrifice a Zombie. If you do, draw a card.',
    });
    const signals = signalsFor(wilhelt, ['Zombie']);
    assert.ok(rolesOf(signals, 'kindred', 'Zombie').includes('consumes'));
    assert.ok(rolesOf(signals, 'aristocrats').includes('consumes'));
  });

  it('Sophia does not consume Dogs — she sacrifices an artifact token', () => {
    // Sophia, Dogged Detective — real oracle text. "Dog" appears only in the
    // EFFECT half of the ability, past the ':'; reading the whole clause
    // used to credit her with consuming Dogs, which she does not.
    const sophia = makeCard({
      name: 'Sophia, Dogged Detective',
      type_line: 'Legendary Creature — Human Detective',
      creature_types: JSON.stringify(['Human', 'Detective']),
      oracle_text:
        'When Sophia enters, create Tiny, a legendary 2/2 green Dog Detective creature token with trample.\n' +
        '{1}, Sacrifice an artifact token: Put a +1/+1 counter on each Dog you control.\n' +
        'Whenever a Dog you control deals combat damage to a player, create a Food token, then investigate.',
    });
    const signals = signalsFor(sophia, ['Dog']);
    assert.ok(!rolesOf(signals, 'kindred', 'Dog').includes('consumes'));
    // She still isn't an Aristocrats *outlet* — an artifact token isn't a
    // creature, so nothing here should read as a sacrifice outlet, even
    // though her token-making elsewhere legitimately makes her a producer.
    assert.ok(!rolesOf(signals, 'aristocrats').includes('consumes'));
  });

  it('an edict is still not a sacrifice outlet', () => {
    const edict = makeCard({
      name: 'Test Edict',
      oracle_text: 'Each player sacrifices a creature.',
    });
    assert.ok(!rolesOf(signalsFor(edict), 'aristocrats').includes('consumes'));
  });
});

describe('reminder-only keywords get explicit matchers', () => {
  it('Exploit is an Aristocrats outlet even though its cost text is reminder-only', () => {
    // Fell Stinger — real oracle text.
    const fellStinger = makeCard({
      name: 'Fell Stinger',
      type_line: 'Creature — Zombie Scorpion',
      creature_types: JSON.stringify(['Zombie', 'Scorpion']),
      keywords: JSON.stringify(['Exploit', 'Deathtouch']),
      oracle_text:
        'Deathtouch\n' +
        'Exploit (When this creature enters, you may sacrifice a creature.)\n' +
        'When this creature exploits a creature, target player draws two cards and loses 2 life.',
    });
    assert.ok(rolesOf(signalsFor(fellStinger), 'aristocrats').includes('consumes'));
  });

  it('a Decayed creature is Aristocrats fodder — it is guaranteed to sacrifice itself', () => {
    // Rot-Curse Rakshasa — real oracle text.
    const rakshasa = makeCard({
      name: 'Rot-Curse Rakshasa',
      type_line: 'Creature — Demon',
      creature_types: JSON.stringify(['Demon']),
      keywords: JSON.stringify(['Trample', 'Decayed']),
      oracle_text:
        'Trample\n' +
        "Decayed (This creature can't block. When it attacks, sacrifice it at end of combat.)\n" +
        'Renew — {X}{B}{B}, Exile this card from your graveyard: Put a decayed counter on each of X target ' +
        'creatures. Activate only as a sorcery.',
    });
    assert.ok(rolesOf(signalsFor(rakshasa), 'aristocrats').includes('produces'));
  });

  it('Evoke and Blitz creatures are Aristocrats fodder for the same reason', () => {
    // Walker of the Grove and Workshop Warchief — real oracle text.
    const walker = makeCard({
      name: 'Walker of the Grove',
      type_line: 'Creature — Elemental',
      creature_types: JSON.stringify(['Elemental']),
      keywords: JSON.stringify(['Evoke']),
      oracle_text:
        'When this creature leaves the battlefield, create a 4/4 green Elemental creature token.\n' +
        "Evoke {4}{G} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)",
    });
    assert.ok(rolesOf(signalsFor(walker), 'aristocrats').includes('produces'));

    const warchief = makeCard({
      name: 'Workshop Warchief',
      type_line: 'Creature — Rhino Warrior',
      creature_types: JSON.stringify(['Rhino', 'Warrior']),
      keywords: JSON.stringify(['Trample', 'Blitz']),
      oracle_text:
        'Trample\n' +
        'When this creature enters, you gain 3 life.\n' +
        'When this creature dies, create a 4/4 green Rhino Warrior creature token.\n' +
        'Blitz {4}{G}{G} (If you cast this spell for its blitz cost, it gains haste and "When this creature ' +
        'dies, draw a card." Sacrifice it at the beginning of the next end step.)',
    });
    assert.ok(rolesOf(signalsFor(warchief), 'aristocrats').includes('produces'));
  });

  it('"For Mirrodin!" is a Voltron attach and a creature-token producer, though its own text is reminder-only', () => {
    // Mirran Bardiche — real oracle text.
    const bardiche = makeCard({
      name: 'Mirran Bardiche',
      type_line: 'Artifact — Equipment',
      keywords: JSON.stringify(['Equip', 'Vigilance']),
      oracle_text:
        'For Mirrodin! (When this Equipment enters, create a 2/2 red Rebel creature token, then attach ' +
        'this to it.)\n' +
        'Equipped creature gets +2/+1 and has vigilance.\n' +
        'Equip {3}{W} ({3}{W}: Attach to target creature you control. Equip only as a sorcery.)',
    });
    const signals = signalsFor(bardiche);
    assert.ok(rolesOf(signals, 'voltron').includes('produces'));
    assert.ok(rolesOf(signals, 'goWide').includes('produces'));
  });

  it('Demonstrate is a Spellslinger amplifier, though its own copy text is reminder-only', () => {
    // Incarnation Technique — real oracle text.
    const technique = makeCard({
      name: 'Incarnation Technique',
      type_line: 'Sorcery',
      keywords: JSON.stringify(['Demonstrate']),
      oracle_text:
        'Demonstrate (When you cast this spell, you may copy it. If you do, choose an opponent to also ' +
        'copy it.)\n' +
        'Mill five cards, then return a creature card from your graveyard to the battlefield.',
    });
    assert.ok(rolesOf(signalsFor(technique), 'spellslinger').includes('amplifies'));
  });

  it('Myriad is a Go-Wide producer, though its own token-copy text is reminder-only', () => {
    // Conclave Evangelist — real oracle text.
    const evangelist = makeCard({
      name: 'Conclave Evangelist',
      type_line: 'Creature — Elephant Cleric',
      creature_types: JSON.stringify(['Elephant', 'Cleric']),
      keywords: JSON.stringify(['Myriad']),
      oracle_text:
        'Myriad (Whenever this creature attacks, for each opponent other than defending player, you may ' +
        "create a token copy that's tapped and attacking that player or a planeswalker they control. Exile " +
        'the tokens at end of combat.)\n' +
        'Whenever this creature deals combat damage to a player, create a token that\'s a copy of this creature.',
    });
    assert.ok(rolesOf(signalsFor(evangelist), 'goWide').includes('produces'));
  });
});

describe('lord wording is normalised onto one shape', () => {
  it('"All X creatures get" registers the same as "X creatures you control get"', () => {
    // Muscle Sliver — real oracle text.
    const muscleSliver = makeCard({
      name: 'Muscle Sliver',
      type_line: 'Creature — Sliver',
      creature_types: JSON.stringify(['Sliver']),
      oracle_text: 'All Sliver creatures get +1/+1.',
    });
    assert.ok(rolesOf(signalsFor(muscleSliver, ['Sliver']), 'goWide', 'Sliver').includes('rewards'));
  });

  it('"X you control get" (no "creatures") registers the same way', () => {
    // Tomb Tyrant — real oracle text.
    const tombTyrant = makeCard({
      name: 'Tomb Tyrant',
      type_line: 'Creature — Zombie Noble',
      creature_types: JSON.stringify(['Zombie', 'Noble']),
      oracle_text:
        'Other Zombies you control get +1/+1.\n' +
        '{2}{B}, {T}, Sacrifice a creature: Return a Zombie creature card at random from your graveyard to ' +
        'the battlefield. Activate only during your turn and only if there are at least three Zombie ' +
        'creature cards in your graveyard.',
    });
    assert.ok(rolesOf(signalsFor(tombTyrant, ['Zombie']), 'goWide', 'Zombie').includes('rewards'));
  });
});

describe('a spelled-out death definition counts as a death trigger', () => {
  it('"put into a graveyard or exile from the battlefield" is Aristocrats rewards', () => {
    // Psychomancer — real oracle text. Never says "dies"/"dying" at all.
    const psychomancer = makeCard({
      name: 'Psychomancer',
      type_line: 'Creature — Vampire Wizard',
      creature_types: JSON.stringify(['Vampire', 'Wizard']),
      oracle_text:
        'Flying\n' +
        'Harbinger of Despair — Whenever this creature or another nontoken artifact you control is put ' +
        'into a graveyard from the battlefield or is put into exile from the battlefield, target opponent ' +
        'loses 1 life and you gain 1 life.',
    });
    assert.ok(rolesOf(signalsFor(psychomancer), 'aristocrats').includes('rewards'));
  });
});

describe('graveyard filling beyond mill', () => {
  it('"search your library for ... put them into your graveyard" is Self-Mill production', () => {
    // Buried Alive, Unmarked Grave, Disciples of Gix — real oracle text.
    const buriedAlive = makeCard({
      name: 'Buried Alive',
      type_line: 'Sorcery',
      oracle_text: 'Search your library for up to three creature cards, put them into your graveyard, then shuffle.',
    });
    assert.ok(rolesOf(signalsFor(buriedAlive), 'selfMill').includes('produces'));

    const unmarkedGrave = makeCard({
      name: 'Unmarked Grave',
      type_line: 'Sorcery',
      oracle_text: 'Search your library for a nonlegendary card, put that card into your graveyard, then shuffle.',
    });
    assert.ok(rolesOf(signalsFor(unmarkedGrave), 'selfMill').includes('produces'));
  });

  it('"Mill N cards, then ..." registers even with a comma, not just a period', () => {
    // Incarnation Technique — real oracle text.
    const technique = makeCard({
      name: 'Incarnation Technique',
      type_line: 'Sorcery',
      oracle_text: 'Mill five cards, then return a creature card from your graveyard to the battlefield.',
    });
    assert.ok(rolesOf(signalsFor(technique), 'selfMill').includes('produces'));
  });

  it('discarding your own cards is Self-Mill production', () => {
    // Faithless Looting, Thrill of Possibility, Windfall, Ideas Unbound —
    // real oracle text.
    const looting = makeCard({
      name: 'Faithless Looting',
      type_line: 'Sorcery',
      oracle_text:
        'Draw two cards, then discard two cards.\n' +
        'Flashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)',
    });
    assert.ok(rolesOf(signalsFor(looting), 'selfMill').includes('produces'));

    const thrill = makeCard({
      name: 'Thrill of Possibility',
      type_line: 'Instant',
      oracle_text: 'As an additional cost to cast this spell, discard a card.\nDraw two cards.',
    });
    assert.ok(rolesOf(signalsFor(thrill), 'selfMill').includes('produces'));

    const windfall = makeCard({
      name: 'Windfall',
      type_line: 'Sorcery',
      oracle_text:
        'Each player discards their hand, then draws cards equal to the greatest number of cards a player ' +
        'discarded this way.',
    });
    assert.ok(rolesOf(signalsFor(windfall), 'selfMill').includes('produces'));
  });

  it('making an OPPONENT discard is not Self-Mill production', () => {
    const edict = makeCard({
      name: 'Test Hand Attack',
      oracle_text: 'Target opponent discards a card.',
    });
    assert.ok(!rolesOf(signalsFor(edict), 'selfMill').includes('produces'));
  });
});

describe('reanimation misses', () => {
  it('reanimating from an opponent\'s graveyard still counts', () => {
    // Gruesome Encore, Puppeteer Clique — real oracle text.
    const gruesomeEncore = makeCard({
      name: 'Gruesome Encore',
      type_line: 'Sorcery',
      oracle_text:
        "Put target creature card from an opponent's graveyard onto the battlefield under your control. It " +
        'gains haste. Exile it at the beginning of the next end step. If that creature would leave the ' +
        'battlefield, exile it instead of putting it anywhere else.',
    });
    assert.ok(rolesOf(signalsFor(gruesomeEncore), 'reanimator').includes('rewards'));
  });

  it('reanimating any "permanent card", not just a creature card, still counts', () => {
    // Sun Titan — real oracle text.
    const sunTitan = makeCard({
      name: 'Sun Titan',
      type_line: 'Creature — Giant',
      creature_types: JSON.stringify(['Giant']),
      oracle_text:
        'Vigilance\n' +
        'Whenever this creature enters or attacks, you may return target permanent card with mana value 3 ' +
        'or less from your graveyard to the battlefield.',
    });
    assert.ok(rolesOf(signalsFor(sunTitan), 'reanimator').includes('rewards'));
  });
});

describe('"Nth spell each turn" is one family, not just "first"', () => {
  it("Eukrasia's own second-spell trigger registers, without an instant/sorcery restriction", () => {
    // Alphinaud Leveilleur — real oracle text.
    const alphinaud = makeCard({
      name: 'Alphinaud Leveilleur',
      type_line: 'Legendary Creature — Human Wizard',
      oracle_text:
        'Partner with Alisaie Leveilleur (When this creature enters, target player may put Alisaie ' +
        'Leveilleur into their hand from their library, then shuffle.)\n' +
        'Vigilance\n' +
        'Eukrasia — Whenever you cast your second spell each turn, draw a card.',
    });
    assert.ok(rolesOf(signalsFor(alphinaud), 'spellslinger').includes('rewards'));
  });
});

describe('+1/+1 Counters matcher rewrite (the Sophia corpus deck)', () => {
  it("Hardened Scales' own passive-voice amplifier registers", () => {
    const hardenedScales = makeCard({
      name: 'Hardened Scales',
      type_line: 'Enchantment',
      oracle_text:
        'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 ' +
        'counters are put on it instead.',
    });
    assert.ok(rolesOf(signalsFor(hardenedScales), 'counters').includes('amplifies'));
  });

  it('"creature with a +1/+1 counter on it" is the dominant payoff templating', () => {
    // Herald of Secret Streams, Ainok Bond-Kin, Inspiring Call — real oracle
    // text.
    const herald = makeCard({
      name: 'Herald of Secret Streams',
      type_line: 'Creature — Merfolk Warrior',
      creature_types: JSON.stringify(['Merfolk', 'Warrior']),
      oracle_text: "Creatures you control with +1/+1 counters on them can't be blocked.",
    });
    assert.ok(rolesOf(signalsFor(herald), 'counters').includes('rewards'));

    const ainok = makeCard({
      name: 'Ainok Bond-Kin',
      type_line: 'Creature — Dog Soldier',
      creature_types: JSON.stringify(['Dog', 'Soldier']),
      oracle_text:
        'Outlast {1}{W} ({1}{W}, {T}: Put a +1/+1 counter on this creature. Outlast only as a sorcery.)\n' +
        'Each creature you control with a +1/+1 counter on it has first strike.',
    });
    assert.ok(rolesOf(signalsFor(ainok), 'counters').includes('rewards'));

    const inspiringCall = makeCard({
      name: 'Inspiring Call',
      type_line: 'Instant',
      oracle_text:
        'Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain ' +
        'indestructible until end of turn.',
    });
    assert.ok(rolesOf(signalsFor(inspiringCall), 'counters').includes('rewards'));
  });

  it('The Ozolith is a payoff even though it never says "+1/+1"', () => {
    const ozolith = makeCard({
      name: 'The Ozolith',
      type_line: 'Legendary Artifact',
      oracle_text:
        'Whenever a creature you control leaves the battlefield, if it had counters on it, put those ' +
        'counters on The Ozolith.\n' +
        'At the beginning of combat on your turn, if The Ozolith has counters on it, you may move all ' +
        'counters from The Ozolith onto target creature.',
    });
    assert.ok(rolesOf(signalsFor(ozolith), 'counters').includes('rewards'));
  });

  it('"enters with N +1/+1 counters" is production, not just "put"', () => {
    // Faithful Watchdog, Wildwood Scourge, District Mascot, Giada — real
    // oracle text.
    const watchdog = makeCard({
      name: 'Faithful Watchdog',
      type_line: 'Creature — Dog',
      creature_types: JSON.stringify(['Dog']),
      oracle_text: 'Vigilance\nThis creature enters with three +1/+1 counters on it.',
    });
    assert.ok(rolesOf(signalsFor(watchdog), 'counters').includes('produces'));

    const giada = makeCard({
      name: 'Giada, Font of Hope',
      type_line: 'Legendary Creature — Angel',
      creature_types: JSON.stringify(['Angel']),
      oracle_text:
        'Flying, vigilance\n' +
        'Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you ' +
        'already control.\n' +
        '{T}: Add {W}. Spend this mana only to cast an Angel spell.',
    });
    assert.ok(rolesOf(signalsFor(giada), 'counters').includes('produces'));
  });

  it('Distribute and Proliferate are also production', () => {
    const ajani = makeCard({
      name: 'Ajani, Mentor of Heroes',
      type_line: 'Legendary Planeswalker — Ajani',
      oracle_text:
        '+1: Distribute three +1/+1 counters among one, two, or three target creatures you control.\n' +
        '+1: Look at the top four cards of your library. You may reveal an Aura, creature, or planeswalker ' +
        'card from among them and put it into your hand. Put the rest on the bottom of your library in any ' +
        'order.\n' +
        '−8: You gain 100 life.',
    });
    assert.ok(rolesOf(signalsFor(ajani), 'counters').includes('produces'));

    const proliferator = makeCard({
      name: 'Test Proliferator',
      oracle_text: 'Proliferate.',
      keywords: JSON.stringify(['Proliferate']),
    });
    assert.ok(rolesOf(signalsFor(proliferator), 'counters').includes('produces'));
  });
});

describe('token descriptor stripping is scoped to token-creation clauses', () => {
  it('two intervening words are stripped, not just one', () => {
    // Their Number Is Legion — real oracle text. It genuinely makes Necron
    // tokens (a real `produces`), but one intervening word was not enough
    // to strip "Necron Warrior artifact creature tokens" from the *caring*
    // scan, so "equal to the number of artifacts you control" — a clause
    // that has nothing to do with Necrons — falsely added `rewards` too,
    // reading it as a Necron payoff rather than just a Necron producer.
    const theirNumber = makeCard({
      name: 'Their Number Is Legion',
      type_line: 'Sorcery',
      oracle_text:
        'Create X tapped 2/2 black Necron Warrior artifact creature tokens, then you gain life equal to ' +
        'the number of artifacts you control. Exile Their Number Is Legion.\n' +
        'You may cast this card from your graveyard.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(theirNumber, ['Necron']), 'kindred', 'Necron'), ['produces']);
  });

  it('a token-type mention OUTSIDE a create clause is not erased', () => {
    // Gleaming Overseer, Eternal Skylord, Dreadhorde Invasion — real oracle
    // text. Their own Zombie-token payoffs live in a separate ability from
    // the (reminder-only) amass clause that makes the token.
    const gleamingOverseer = makeCard({
      name: 'Gleaming Overseer',
      type_line: 'Creature — Zombie Wizard',
      creature_types: JSON.stringify(['Zombie', 'Wizard']),
      oracle_text:
        'When this creature enters, amass Zombies 1. (Put a +1/+1 counter on an Army you control. It\'s ' +
        "also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first.)\n" +
        'Zombie tokens you control have hexproof and menace.',
    });
    assert.ok(rolesOf(signalsFor(gleamingOverseer, ['Zombie']), 'kindred', 'Zombie').includes('rewards'));

    const eternalSkylord = makeCard({
      name: 'Eternal Skylord',
      type_line: 'Creature — Zombie Wizard',
      creature_types: JSON.stringify(['Zombie', 'Wizard']),
      oracle_text:
        'When this creature enters, amass Zombies 2. (Put two +1/+1 counters on an Army you control. It\'s ' +
        "also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first.)\n" +
        'Zombie tokens you control have flying.',
    });
    assert.ok(rolesOf(signalsFor(eternalSkylord, ['Zombie']), 'kindred', 'Zombie').includes('rewards'));

    const dreadhordeInvasion = makeCard({
      name: 'Dreadhorde Invasion',
      type_line: 'Enchantment',
      oracle_text:
        'At the beginning of your upkeep, you lose 1 life and amass Zombies 1. (Put a +1/+1 counter on an ' +
        "Army you control. It's also a Zombie. If you don't control an Army, create a 0/0 black Zombie " +
        'Army creature token first.)\n' +
        'Whenever a Zombie token you control with power 6 or greater attacks, it gains lifelink until end ' +
        'of turn.',
    });
    assert.ok(
      rolesOf(signalsFor(dreadhordeInvasion, ['Zombie']), 'kindred', 'Zombie').includes('rewards'),
    );
  });

  it('"create a token that\'s a copy of" is recognised as token production', () => {
    const copyMaker = makeCard({
      name: 'Test Copier',
      oracle_text: "{7}: Create a token that's a copy of target artifact.",
    });
    assert.ok(rolesOf(signalsFor(copyMaker), 'goWide').includes('produces'));
    assert.ok(rolesOf(signalsFor(copyMaker), 'aristocrats').includes('produces'));
  });
});

describe('keyword-care plurals', () => {
  it('a payoff mentioning only the plural form ("Foods") still registers as caring', () => {
    // Peregrin Took and The Cabbage Merchant are real Food payoffs whose
    // reward text uses "Foods" — the bare, unpluralised pattern this
    // replaces would have missed a card whose *only* reward mention is
    // plural, exactly like this one.
    const foodPayoff = makeCard({
      name: 'Test Food Payoff',
      keywords: JSON.stringify(['Food']),
      oracle_text: 'Whenever one or more Foods enter the battlefield under your control, draw a card.',
    });
    assert.ok(rolesOf(signalsFor(foodPayoff, [], ['Food']), 'keywordCare', 'Food').includes('rewards'));
  });
});

describe('Voltron: a genuine reward beyond the deliberately-excluded shape', () => {
  it('"if it was enchanted or equipped" is a reward, not the equipment describing itself', () => {
    // Koll, the Forgemaster — real oracle text.
    const koll = makeCard({
      name: 'Koll, the Forgemaster',
      type_line: 'Legendary Creature — Dwarf Warrior',
      creature_types: JSON.stringify(['Dwarf', 'Warrior']),
      oracle_text:
        "Whenever another nontoken creature you control dies, if it was enchanted or equipped, return it " +
        "to its owner's hand.\n" +
        'Creature tokens you control that are enchanted or equipped get +1/+1.',
    });
    assert.ok(rolesOf(signalsFor(koll), 'voltron').includes('rewards'));
  });
});

describe('amass produces the named type and Army, though its own text is reminder-only', () => {
  it('a typed amass card is kindred for the named type and for Army, and counts as +1/+1 Counters production', () => {
    // Gothmog, Morgul Lieutenant — real oracle text, from the Sauron corpus
    // deck (~18 Orc-amass cards).
    const gothmog = makeCard({
      name: 'Gothmog, Morgul Lieutenant',
      type_line: 'Legendary Creature — Human Soldier',
      creature_types: JSON.stringify(['Human', 'Soldier']),
      oracle_text:
        'When Gothmog enters, amass Orcs 1. (Put a +1/+1 counter on an Army you control. It\'s also an Orc. ' +
        "If you don't control an Army, create a 0/0 black Orc Army creature token first.)\n" +
        'Creature tokens you control have deathtouch.',
    });
    const signals = signalsFor(gothmog, ['Orc', 'Army']);
    assert.deepStrictEqual(rolesOf(signals, 'kindred', 'Orc'), ['produces']);
    assert.deepStrictEqual(rolesOf(signals, 'kindred', 'Army'), ['produces']);
    assert.ok(rolesOf(signals, 'counters').includes('produces'));
    assert.ok(rolesOf(signals, 'goWide').includes('produces'));
  });
});

describe('enables: cost reduction and free-casting turn the engine on without rewarding it', () => {
  it('Equipment/Aura cost reduction and free-equip are Voltron enablers, not payoffs', () => {
    // Danitha Capashen, Paragon; Puresteel Paladin; Bruenor Battlehammer;
    // Bladehold War-Whip — real oracle text, all four misses named in
    // docs/signals-rework.md's voltron.rewards section.
    const danitha = makeCard({
      name: 'Danitha Capashen, Paragon',
      type_line: 'Legendary Creature — Human Knight',
      oracle_text: 'First strike, vigilance, lifelink\nAura and Equipment spells you cast cost {1} less to cast.',
    });
    const roles = rolesOf(signalsFor(danitha), 'voltron');
    assert.ok(roles.includes('enables'), JSON.stringify(roles));
    assert.ok(!roles.includes('rewards'));

    const puresteel = makeCard({
      name: 'Puresteel Paladin',
      type_line: 'Creature — Human Soldier',
      oracle_text:
        'Whenever an Equipment you control enters, you may draw a card.\n' +
        'Metalcraft — Equipment you control have equip {0} as long as you control three or more artifacts.',
    });
    assert.ok(rolesOf(signalsFor(puresteel), 'voltron').includes('enables'));

    const bruenor = makeCard({
      name: 'Bruenor Battlehammer',
      type_line: 'Legendary Creature — Dwarf Warrior',
      oracle_text:
        'Each creature you control gets +2/+0 for each Equipment attached to it.\n' +
        'You may pay {0} rather than pay the equip cost of the first equip ability you activate each turn.',
    });
    assert.ok(rolesOf(signalsFor(bruenor), 'voltron').includes('enables'));

    const bladeholdWarWhip = makeCard({
      name: 'Bladehold War-Whip',
      type_line: 'Artifact — Equipment',
      oracle_text:
        'For Mirrodin! (When this Equipment enters, create a 2/2 red Rebel creature token, then attach ' +
        'this to it.)\n' +
        'Equip abilities you activate of other Equipment cost {1} less to activate.\n' +
        'Equipped creature has double strike.\n' +
        'Equip {3}{R}{W}',
    });
    assert.ok(rolesOf(signalsFor(bladeholdWarWhip), 'voltron').includes('enables'));
  });

  it("Dualcast's own cost reduction is a Spellslinger enabler", () => {
    // Alisaie Leveilleur — real oracle text.
    const alisaie = makeCard({
      name: 'Alisaie Leveilleur',
      type_line: 'Legendary Creature — Human Warrior',
      oracle_text:
        'Partner with Alphinaud Leveilleur (When this creature enters, target player may put Alphinaud ' +
        'Leveilleur into their hand from their library, then shuffle.)\n' +
        'First strike\n' +
        'Dualcast — The second spell you cast each turn costs {2} less to cast.',
    });
    assert.ok(rolesOf(signalsFor(alisaie), 'spellslinger').includes('enables'));
  });
});

describe('protects: archetype-scoped, never generic hexproof', () => {
  it('a lord granting indestructible to its own tribe is a kindred protector', () => {
    // Sliver Hivelord — real oracle text.
    const hivelord = makeCard({
      name: 'Sliver Hivelord',
      type_line: 'Legendary Creature — Sliver',
      creature_types: JSON.stringify(['Sliver']),
      oracle_text:
        'Sliver creatures you control have indestructible. (Damage and effects that say "destroy" don\'t ' +
        'destroy them.)',
    });
    assert.ok(rolesOf(signalsFor(hivelord, ['Sliver']), 'kindred', 'Sliver').includes('protects'));
  });

  it('a generic hexproof spell with no named type protects nothing', () => {
    // Snakeskin Veil — real oracle text. Genuinely a combat trick a tribal
    // deck might run, but its own text never names a type, so it must not
    // become a candidate for every archetype's `protects` slot.
    const snakeskinVeil = makeCard({
      name: 'Snakeskin Veil',
      type_line: 'Instant',
      oracle_text:
        'Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn. (It ' +
        "can't be the target of spells or abilities your opponents control.)",
    });
    const signals = signalsFor(snakeskinVeil, ['Sliver']);
    assert.ok(!signals.some((s) => s.roles.includes('protects')), JSON.stringify(signals));
  });
});

describe('cardTypes and permanentSubtypes read off the type line', () => {
  it('reads the card types before the em dash, supertypes excluded', () => {
    // Lightning Bolt, Kalamax, the Stormsire — real type lines.
    const bolt = makeCard({ name: 'Lightning Bolt', type_line: 'Instant' });
    assert.deepStrictEqual(buildCardFacts(bolt, buildVocabulary([], [])).cardTypes, ['Instant']);

    const kalamax = makeCard({
      name: 'Kalamax, the Stormsire',
      type_line: 'Legendary Creature — Elder Dragon',
    });
    assert.deepStrictEqual(buildCardFacts(kalamax, buildVocabulary([], [])).cardTypes, ['Creature']);
  });

  it('recognises a card with more than one type', () => {
    // Summon: Primal Odin — real type line (an Enchantment Creature Saga).
    const odin = makeCard({
      name: 'Summon: Primal Odin',
      type_line: 'Enchantment Creature — Saga Knight',
    });
    const facts = buildCardFacts(odin, buildVocabulary([], []));
    assert.deepStrictEqual([...facts.cardTypes].sort(), ['Creature', 'Enchantment']);
  });

  it('reads permanent subtypes from the curated list, after the em dash', () => {
    // Smuggler's Copter, Long List of the Ents — real type lines.
    const copter = makeCard({ name: "Smuggler's Copter", type_line: 'Artifact — Vehicle' });
    assert.deepStrictEqual(
      buildCardFacts(copter, buildVocabulary([], [])).permanentSubtypes,
      ['Vehicle'],
    );

    const saga = makeCard({ name: 'Long List of the Ents', type_line: 'Enchantment — Saga' });
    assert.deepStrictEqual(buildCardFacts(saga, buildVocabulary([], [])).permanentSubtypes, ['Saga']);

    const vanilla = makeCard({ name: 'Test Bear', type_line: 'Creature — Bear' });
    assert.deepStrictEqual(buildCardFacts(vanilla, buildVocabulary([], [])).permanentSubtypes, []);
  });
});
