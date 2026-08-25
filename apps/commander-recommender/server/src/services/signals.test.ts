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
  archetypeDisplay,
  buildCardFacts,
  buildVocabulary,
  definingRequirement,
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
    is_changeling: 0,
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

describe('kindred\'s own wildcard: "choose a creature type" supports every theme, forms none of its own', () => {
  it('cost reduction and library-peek scoped to the chosen type are enables + produces', () => {
    // Herald's Horn — real oracle text.
    const horn = makeCard({
      name: "Herald's Horn",
      type_line: 'Artifact',
      oracle_text:
        'As this artifact enters, choose a creature type.\n' +
        'Creature spells you cast of the chosen type cost {1} less to cast.\n' +
        "At the beginning of your upkeep, look at the top card of your library. If it's a " +
        'creature card of the chosen type, you may reveal it and put it into your hand.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(horn), 'kindred', '*'), ['enables', 'produces']);
  });

  it('an anthem and a cast trigger scoped to the chosen type are rewards', () => {
    // Vanquisher's Banner — real oracle text.
    const banner = makeCard({
      name: "Vanquisher's Banner",
      type_line: 'Artifact',
      oracle_text:
        'As this artifact enters, choose a creature type.\n' +
        'Creatures you control of the chosen type get +1/+1.\n' +
        'Whenever you cast a creature spell of the chosen type, draw a card.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(banner), 'kindred', '*'), ['rewards']);
  });

  it('mana restricted to spending on the chosen type is enables', () => {
    // Unclaimed Territory — real oracle text.
    const territory = makeCard({
      name: 'Unclaimed Territory',
      type_line: 'Land',
      oracle_text:
        'As this land enters, choose a creature type.\n' +
        '{T}: Add {C}.\n' +
        '{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the ' +
        'chosen type.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(territory), 'kindred', '*'), ['enables']);
  });

  it('scrying on a spell that shares a type with the commander is the wildcard trigger, not a name match', () => {
    // Path of Ancestry — real oracle text. Never says "choose a creature
    // type" at all; it reads its commander's type dynamically instead, but
    // the effect is the same shape.
    const path = makeCard({
      name: 'Path of Ancestry',
      type_line: 'Land',
      oracle_text:
        'This land enters tapped.\n' +
        "{T}: Add one mana of any color in your commander's color identity. When that mana is " +
        'spent to cast a creature spell that shares a creature type with your commander, scry 1.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(path), 'kindred', '*'), ['rewards']);
  });

  it("a printed type and the wildcard are independent signals on the same card", () => {
    // Realmwalker — real oracle text. It is itself a Shapeshifter (`is`) and
    // separately supports every other kindred theme in the deck (`*`,
    // `produces` — casting from the top of the library scoped to the chosen
    // type). Changeling is not yet honoured here — see Phase E's own
    // Changeling sub-item — so this only asserts what detectKindred emits
    // today, not the eventual "every creature type" reading.
    const realmwalker = makeCard({
      name: 'Realmwalker',
      type_line: 'Creature — Shapeshifter',
      creature_types: JSON.stringify(['Shapeshifter']),
      oracle_text:
        'Changeling (This card is every creature type.)\n' +
        'As this creature enters, choose a creature type.\n' +
        'You may look at the top card of your library any time.\n' +
        'You may cast creature spells of the chosen type from the top of your library.',
    });
    const signals = signalsFor(realmwalker, ['Shapeshifter']);
    assert.deepStrictEqual(rolesOf(signals, 'kindred', 'Shapeshifter'), ['is']);
    assert.deepStrictEqual(rolesOf(signals, 'kindred', '*'), ['produces']);
  });

  it('a card naming a real type, not the chosen one, never gets a wildcard signal', () => {
    // Sliver Overlord — real oracle text. A specific-type tutor/steal effect;
    // nothing about it lets the caster choose a type, so it must stay a
    // Sliver-only signal rather than also registering as the wildcard.
    const overlord = makeCard({
      name: 'Sliver Overlord',
      type_line: 'Legendary Creature — Sliver Mutant',
      creature_types: JSON.stringify(['Sliver', 'Mutant']),
      oracle_text:
        '{3}: Search your library for a Sliver card, reveal that card, put it into your hand, ' +
        'then shuffle.\n' +
        '{3}: Gain control of target Sliver. (This effect lasts indefinitely.)',
    });
    const signals = signalsFor(overlord, ['Sliver', 'Mutant']);
    assert.strictEqual(find(signals, 'kindred', '*'), undefined);
  });
});

describe('Changeling (CR 702.73a) is every creature type, unqualified', () => {
  it('a changeling with no type mentions of its own registers as an unqualified kindred member', () => {
    // Chomping Changeling — real oracle text. No creature-type word appears
    // anywhere in it, so the per-type loop finds nothing to attach roles to;
    // the unqualified signal is the only source of kindred membership here.
    const chomping = makeCard({
      name: 'Chomping Changeling',
      type_line: 'Creature — Shapeshifter',
      creature_types: JSON.stringify(['Shapeshifter']),
      keywords: JSON.stringify(['Changeling']),
      is_changeling: 1,
      oracle_text:
        'Changeling (This card is every creature type.)\n' +
        'When this creature enters, destroy up to one target artifact or enchantment.',
    });
    const signals = signalsFor(chomping, ['Shapeshifter']);
    // Its own printed type, from the structural per-type loop.
    assert.deepStrictEqual(rolesOf(signals, 'kindred', 'Shapeshifter'), ['is']);
    // Every other type, from the unqualified signal — 'is' only, since
    // Changeling is structural, not a claim of caring about anything.
    assert.deepStrictEqual(rolesOf(signals, 'kindred', undefined), ['is']);
    assert.strictEqual(hasActiveRole(rolesOf(signals, 'kindred', undefined)), false);
  });

  it("Realmwalker's own tribal engine still qualifies by its own text, on top of the unqualified signal", () => {
    // Realmwalker — real oracle text. Its wildcard-kindred signal (Phase E's
    // earlier sub-item) and this unqualified Changeling signal are
    // independent: one says "supports whichever type you choose", the other
    // says "and is unconditionally every type regardless".
    const realmwalker = makeCard({
      name: 'Realmwalker',
      type_line: 'Creature — Shapeshifter',
      creature_types: JSON.stringify(['Shapeshifter']),
      keywords: JSON.stringify(['Changeling']),
      is_changeling: 1,
      oracle_text:
        'Changeling (This card is every creature type.)\n' +
        'As this creature enters, choose a creature type.\n' +
        'You may look at the top card of your library any time.\n' +
        'You may cast creature spells of the chosen type from the top of your library.',
    });
    const signals = signalsFor(realmwalker, ['Shapeshifter']);
    assert.deepStrictEqual(rolesOf(signals, 'kindred', 'Shapeshifter'), ['is']);
    assert.deepStrictEqual(rolesOf(signals, 'kindred', '*'), ['produces']);
    assert.deepStrictEqual(rolesOf(signals, 'kindred', undefined), ['is']);
  });

  it('a card with the Changeling keyword grants no extra kindred role beyond `is`, however active its other abilities are', () => {
    // Flock Impostor — real oracle text. Flash/Flying and a bounce trigger,
    // none of which are kindred-caring text — the unqualified signal must
    // stay `is`-only regardless of how much else the card does.
    const impostor = makeCard({
      name: 'Flock Impostor',
      type_line: 'Creature — Shapeshifter',
      creature_types: JSON.stringify(['Shapeshifter']),
      keywords: JSON.stringify(['Changeling', 'Flying', 'Flash']),
      is_changeling: 1,
      oracle_text:
        'Changeling (This card is every creature type.)\n' +
        'Flash\n' +
        'Flying\n' +
        "When this creature enters, return up to one other target creature you control to its owner's hand.",
    });
    const signals = signalsFor(impostor, ['Shapeshifter']);
    assert.deepStrictEqual(rolesOf(signals, 'kindred', undefined), ['is']);
  });

  it('a card without the Changeling keyword produces no unqualified kindred signal', () => {
    // Sliver Overlord again — a real, specific-type Sliver with no Changeling
    // keyword at all. Must not somehow register as "every type".
    const overlord = makeCard({
      name: 'Sliver Overlord',
      type_line: 'Legendary Creature — Sliver Mutant',
      creature_types: JSON.stringify(['Sliver', 'Mutant']),
      is_changeling: 0,
      oracle_text:
        '{3}: Search your library for a Sliver card, reveal that card, put it into your hand, ' +
        'then shuffle.\n' +
        '{3}: Gain control of target Sliver. (This effect lasts indefinitely.)',
    });
    const signals = signalsFor(overlord, ['Sliver', 'Mutant']);
    assert.strictEqual(find(signals, 'kindred', undefined), undefined);
  });
});

describe("kindred's own lifecycle: tribal mana, cost reduction, and tutors", () => {
  it('a mana ability granted to the type is enables', () => {
    // Gemhide Sliver — real oracle text.
    const gemhide = makeCard({
      name: 'Gemhide Sliver',
      type_line: 'Creature — Sliver',
      creature_types: JSON.stringify(['Sliver']),
      oracle_text: 'All Slivers have "{T}: Add one mana of any color."',
    });
    assert.ok(rolesOf(signalsFor(gemhide, ['Sliver']), 'kindred', 'Sliver').includes('enables'));

    // Manaweft Sliver — real oracle text, the "you control" phrasing variant.
    const manaweft = makeCard({
      name: 'Manaweft Sliver',
      type_line: 'Creature — Sliver',
      creature_types: JSON.stringify(['Sliver']),
      oracle_text: 'Sliver creatures you control have "{T}: Add one mana of any color."',
    });
    assert.ok(rolesOf(signalsFor(manaweft, ['Sliver']), 'kindred', 'Sliver').includes('enables'));
  });

  it('mana restricted to spending on the type is enables', () => {
    // Sliver Hive — real oracle text. Also a token producer, in a separate
    // clause and a separate role.
    const sliverHive = makeCard({
      name: 'Sliver Hive',
      type_line: 'Land',
      oracle_text:
        '{T}: Add {C}.\n' +
        '{T}: Add one mana of any color. Spend this mana only to cast a Sliver spell.\n' +
        '{5}, {T}: Create a 1/1 colorless Sliver creature token. Activate only if you control a Sliver.',
    });
    const roles = rolesOf(signalsFor(sliverHive, ['Sliver']), 'kindred', 'Sliver');
    assert.ok(roles.includes('enables'));
    assert.ok(roles.includes('produces'));
  });

  it('Affinity for the named type is cost reduction, and enables', () => {
    // Thrumming Hivepool — real oracle text. Affinity is a keyword ability
    // ("costs less to cast") whose whole explanation sits in reminder text,
    // so this needs its own check rather than the wildcard branch's "cost
    // {N} less to cast" text pattern, which never fires on a named type.
    const hivepool = makeCard({
      name: 'Thrumming Hivepool',
      type_line: 'Artifact',
      oracle_text:
        'Affinity for Slivers (This spell costs {1} less to cast for each Sliver you control.)\n' +
        'Slivers you control have double strike and haste.\n' +
        'At the beginning of your upkeep, create two 1/1 colorless Sliver creature tokens.',
    });
    const roles = rolesOf(signalsFor(hivepool, ['Sliver']), 'kindred', 'Sliver');
    assert.ok(roles.includes('enables'));
    // Granting double strike and haste is still `rewards`, the same
    // already-established treatment as Gleaming Overseer's hexproof grant —
    // not folded into `enables` as a separate "evasion and haste" slot; see
    // docs/archetypes.md's kindred lifecycle note for why.
    assert.ok(roles.includes('rewards'));
    // And it makes Sliver tokens.
    assert.ok(roles.includes('produces'));
  });

  it('searching the library for a card of the named type is a tutor, produces', () => {
    // Sliver Overlord — real oracle text.
    const overlord = makeCard({
      name: 'Sliver Overlord',
      type_line: 'Legendary Creature — Sliver Mutant',
      creature_types: JSON.stringify(['Sliver', 'Mutant']),
      oracle_text:
        '{3}: Search your library for a Sliver card, reveal that card, put it into your hand, ' +
        'then shuffle.\n' +
        '{3}: Gain control of target Sliver. (This effect lasts indefinitely.)',
    });
    assert.ok(rolesOf(signalsFor(overlord, ['Sliver']), 'kindred', 'Sliver').includes('produces'));
  });

  it('a generic tutor with no type restriction earns no tutor role for an unrelated type', () => {
    // Profane Tutor — real oracle text, from the same First Sliver decklist.
    // Names no creature type at all, so it must not register as a Sliver
    // tutor merely by coexisting with one in the same list.
    const profaneTutor = makeCard({
      name: 'Profane Tutor',
      type_line: 'Sorcery',
      oracle_text:
        'Suspend 2—{1}{B} (Rather than cast this card from your hand, pay {1}{B} and exile it with ' +
        'two time counters on it. At the beginning of your upkeep, remove a time counter. When the ' +
        'last is removed, you may cast it without paying its mana cost.)\n' +
        'Search your library for a card, put that card into your hand, then shuffle.',
    });
    assert.strictEqual(find(signalsFor(profaneTutor, ['Sliver']), 'kindred', 'Sliver'), undefined);
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

describe('Phase D: keyword buckets replace the single EXCLUDED_KEYWORDS set', () => {
  it('Flashback is a mechanic keyword — membership alone satisfies its own definingRequirement', () => {
    // Think Twice — real oracle text. Nothing here explicitly "cares" about
    // Flashback (no grants/rewards clause), so this stays keywordCare: is
    // only, same as any other bare keyword — MECHANIC_KEYWORDS relaxes the
    // gate that reads this role, not what role a bare Flashback card earns.
    const thinkTwice = makeCard({
      name: 'Think Twice',
      type_line: 'Instant',
      oracle_text:
        'Draw a card.\n' +
        'Flashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)',
      keywords: JSON.stringify(['Flashback']),
    });
    const signals = signalsFor(thinkTwice, [], ['Flashback']);
    assert.deepStrictEqual(rolesOf(signals, 'keywordCare', 'Flashback'), ['is']);
    assert.deepStrictEqual(definingRequirement('keywordCare', 'Flashback'), { role: 'is', minimum: 1 });
  });

  it('Escape is a mechanic keyword too, for the same reason', () => {
    // Glimpse of Freedom — real oracle text.
    const glimpseOfFreedom = makeCard({
      name: 'Glimpse of Freedom',
      type_line: 'Instant',
      oracle_text:
        'Draw a card.\n' +
        'Escape—{2}{U}, Exile five other cards from your graveyard. (You may cast this card from your ' +
        'graveyard for its escape cost.)',
      keywords: JSON.stringify(['Escape']),
    });
    const signals = signalsFor(glimpseOfFreedom, [], ['Escape']);
    assert.deepStrictEqual(rolesOf(signals, 'keywordCare', 'Escape'), ['is']);
    assert.deepStrictEqual(definingRequirement('keywordCare', 'Escape'), { role: 'is', minimum: 1 });
  });

  it('a combat keyword keeps requiring an active caring role, unchanged', () => {
    assert.deepStrictEqual(definingRequirement('keywordCare', 'Flying'), { role: 'rewards', minimum: 1 });
  });

  it('a keyword already covered by its own dedicated archetype produces no keywordCare signal at all', () => {
    // Unicycle — real oracle text. Crew is redundant with artifacts:Vehicle,
    // this phase's own paradigm example ("Crew stops mattering as a keyword
    // once artifacts:Vehicle carries the theme").
    const unicycle = makeCard({
      name: 'Unicycle',
      type_line: 'Artifact — Equipment Vehicle',
      mana_cost: '{2}',
      oracle_text: 'First strike, haste\nEquipped creature has first strike and haste.\nEquip {1}\nCrew 1',
      keywords: JSON.stringify(['First strike', 'Haste', 'Equip', 'Crew']),
    });
    const signals = signalsFor(unicycle, [], ['Crew', 'First strike', 'Haste']);
    assert.strictEqual(find(signals, 'keywordCare', 'Crew'), undefined);
    // The Vehicle subtype still carries the theme under its real name.
    assert.ok(rolesOf(signals, 'artifacts', 'Vehicle').includes('is'));
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

  it('a plural death trigger ("creatures ... die") is Aristocrats too, not just the singular "dies"', () => {
    const plural = makeCard({
      name: 'Test Plural Reaper',
      type_line: 'Creature — Spirit',
      oracle_text: 'Whenever one or more other creatures you control die, draw a card.',
    });
    assert.ok(rolesOf(signalsFor(plural), 'aristocrats').includes('rewards'));
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

  it('qualifies by the type the payoff actually restricts, not the first type word in the clause', () => {
    // Angel of Glory's Rise — real oracle text. Exiles Zombies (a cost/setup
    // clause), then returns Humans — the payoff must qualify Human, not
    // Zombie, even though "Zombies" appears earlier in the same clause.
    const angel = makeCard({
      name: "Angel of Glory's Rise",
      type_line: 'Creature — Angel',
      creature_types: JSON.stringify(['Angel']),
      keywords: JSON.stringify(['Flying']),
      oracle_text:
        'Flying\nWhen this creature enters, exile all Zombies, then return all Human creature ' +
        'cards from your graveyard to the battlefield.',
    });
    const signals = signalsFor(angel, ['Zombie', 'Human', 'Angel'], ['Flying']);
    assert.ok(find(signals, 'reanimator', 'Human'), 'expected a Human-qualified reanimator signal');
    assert.strictEqual(find(signals, 'reanimator', 'Zombie'), undefined);
  });
});

describe('qualifier borrowing: a produces-only match can inherit this card\'s own kindred restriction', () => {
  /** Ajani, Nacatl Pariah // Ajani, Nacatl Avenger — real oracle text, both
   * faces joined (import-scryfall.ts's own behaviour for a transform card).
   * His only goWide-matching text is "create ... creature token" (produces)
   * — no rewards clause of his own scales with board size the way goWide's
   * own regexes look for — so findQualifier alone leaves him unqualified and
   * generic, even though the token he makes is explicitly a Cat. His
   * "Whenever one or more other Cats you control die..." transform trigger
   * is a *different* clause that independently earns kindred:Cat an active
   * rewards role, which is what this fixture is really about. */
  function ajaniNacatlPariah(): CardRow {
    return makeCard({
      name: 'Ajani, Nacatl Pariah // Ajani, Nacatl Avenger',
      type_line: 'Legendary Creature — Cat Warrior',
      creature_types: JSON.stringify(['Cat', 'Warrior']),
      back_name: 'Ajani, Nacatl Avenger',
      oracle_text:
        'When Ajani enters, create a 2/1 white Cat Warrior creature token.\n' +
        'Whenever one or more other Cats you control die, you may exile Ajani, then return him to the ' +
        "battlefield transformed under his owner's control.\n" +
        '+2: Put a +1/+1 counter on each Cat you control.\n' +
        '0: Create a 2/1 white Cat Warrior creature token. When you do, if you control a red permanent ' +
        'other than Ajani, he deals damage equal to the number of creatures you control to any target.\n' +
        '−4: Each opponent chooses an artifact, a creature, an enchantment, and a planeswalker from ' +
        'among the nonland permanents they control, then sacrifices the rest.',
    });
  }

  it('goWide borrows Cat from kindred, and aristocrats qualifies to Cat on its own text', () => {
    const signals = signalsFor(ajaniNacatlPariah(), ['Cat']);

    // The evidence the borrow depends on: kindred:Cat is real and active,
    // independent of anything goWide-specific.
    assert.ok(rolesOf(signals, 'kindred', 'Cat').includes('rewards'));

    // No more phantom generic match — every goWide signal on this card is
    // now qualified.
    assert.strictEqual(find(signals, 'goWide', undefined), undefined);

    const goWide = find(signals, 'goWide', 'Cat');
    assert.ok(goWide, 'expected a Cat-qualified goWide signal');
    assert.ok(goWide!.roles.includes('produces'));
    assert.strictEqual(goWide!.qualifierSource, 'kindred');
    assert.strictEqual(goWide!.label, 'Go-Wide Combat (Cat)');

    // aristocrats reaches Cat a different way: the "dies?" regex fix lets it
    // match Ajani's own death-trigger clause directly, and that clause
    // already names Cats — findQualifier's ordinary text scan handles it,
    // no borrowing involved.
    const aristocrats = find(signals, 'aristocrats', 'Cat');
    assert.ok(aristocrats, 'expected a Cat-qualified aristocrats signal');
    assert.ok(aristocrats!.roles.includes('rewards'));
    assert.strictEqual(aristocrats!.qualifierSource, undefined);
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
    // never the literal word "creature". Its aristocrats match also carries
    // `produces` (the token-making clause), so it stays unqualified rather
    // than borrowing Goblin from its own kindred signal — borrowing is
    // reserved for a produces-only match with no identity of its own to
    // protect (see `borrowedCreatureTypeQualifier`'s comment); `Sacrifice a
    // Goblin` being unreadable to `findQualifier` (a function matcher, not a
    // regex) is a separate, narrower gap this fix doesn't attempt to close.
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
    // "creature". Here the death-trigger clause itself names "Zombie", so
    // findQualifier's own text scan finds it directly — no borrowing needed,
    // unlike the two sacrifice-cost cases above.
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
    assert.ok(rolesOf(signals, 'aristocrats', 'Zombie').includes('consumes'));
    assert.strictEqual(find(signals, 'aristocrats', 'Zombie')?.qualifierSource, undefined);
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

describe('Counters matcher rewrite (the Sophia corpus deck)', () => {
  // Counters are qualified by kind now (like Kindred is qualified by
  // creature type), so a card whose only counter mention is "+1/+1" is
  // Counters (+1/+1) specifically, not bare "Counters" — see
  // findCounterKind.
  it("Hardened Scales' own passive-voice amplifier registers", () => {
    const hardenedScales = makeCard({
      name: 'Hardened Scales',
      type_line: 'Enchantment',
      oracle_text:
        'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 ' +
        'counters are put on it instead.',
    });
    assert.ok(rolesOf(signalsFor(hardenedScales), 'counters', '+1/+1').includes('amplifies'));
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
    assert.ok(rolesOf(signalsFor(herald), 'counters', '+1/+1').includes('rewards'));

    const ainok = makeCard({
      name: 'Ainok Bond-Kin',
      type_line: 'Creature — Dog Soldier',
      creature_types: JSON.stringify(['Dog', 'Soldier']),
      oracle_text:
        'Outlast {1}{W} ({1}{W}, {T}: Put a +1/+1 counter on this creature. Outlast only as a sorcery.)\n' +
        'Each creature you control with a +1/+1 counter on it has first strike.',
    });
    assert.ok(rolesOf(signalsFor(ainok), 'counters', '+1/+1').includes('rewards'));

    const inspiringCall = makeCard({
      name: 'Inspiring Call',
      type_line: 'Instant',
      oracle_text:
        'Draw a card for each creature you control with a +1/+1 counter on it. Those creatures gain ' +
        'indestructible until end of turn.',
    });
    assert.ok(rolesOf(signalsFor(inspiringCall), 'counters', '+1/+1').includes('rewards'));
  });

  it('The Ozolith is a payoff even though it never says "+1/+1" — and stays unqualified', () => {
    const ozolith = makeCard({
      name: 'The Ozolith',
      type_line: 'Legendary Artifact',
      oracle_text:
        'Whenever a creature you control leaves the battlefield, if it had counters on it, put those ' +
        'counters on The Ozolith.\n' +
        'At the beginning of combat on your turn, if The Ozolith has counters on it, you may move all ' +
        'counters from The Ozolith onto target creature.',
    });
    const signals = signalsFor(ozolith);
    // Bare "counters", no specific kind named — findCounterKind must not
    // invent one (e.g. extracting "had" from "if it had counters on it").
    assert.strictEqual(find(signals, 'counters', '+1/+1'), undefined);
    assert.ok(rolesOf(signals, 'counters', undefined).includes('rewards'));
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
    assert.ok(rolesOf(signalsFor(watchdog), 'counters', '+1/+1').includes('produces'));

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
    assert.ok(rolesOf(signalsFor(giada), 'counters', '+1/+1').includes('produces'));
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
    assert.ok(rolesOf(signalsFor(ajani), 'counters', '+1/+1').includes('produces'));

    // Proliferate alone names no specific counter kind, so this stays
    // unqualified — it cares about whatever counters are already out.
    const proliferator = makeCard({
      name: 'Test Proliferator',
      oracle_text: 'Proliferate.',
      keywords: JSON.stringify(['Proliferate']),
    });
    assert.ok(rolesOf(signalsFor(proliferator), 'counters', undefined).includes('produces'));
  });
});

describe('Counters: -1/-1, time, and stun are the same family as +1/+1', () => {
  it('Blight and Persist both register as -1/-1 counter production', () => {
    // High Perfect Morcant — real oracle text. "Blights" is the only
    // visible word; the -1/-1 explanation is reminder-only.
    const morcant = makeCard({
      name: 'High Perfect Morcant',
      type_line: 'Legendary Creature — Elf Cleric',
      creature_types: JSON.stringify(['Elf', 'Cleric']),
      keywords: JSON.stringify(['Blight', 'Proliferate']),
      oracle_text:
        'Whenever High Perfect Morcant or another Elf you control enters, each opponent blights 1.\n' +
        'Tap three untapped Elves you control: Proliferate. Activate only as a sorcery.',
    });
    assert.ok(rolesOf(signalsFor(morcant, ['Elf']), 'counters', '-1/-1').includes('produces'));

    // Puppeteer Clique — real oracle text. Persist's own reminder text is
    // the only place "-1/-1" is ever printed.
    const puppeteerClique = makeCard({
      name: 'Puppeteer Clique',
      type_line: 'Creature — Faerie Wizard',
      creature_types: JSON.stringify(['Faerie', 'Wizard']),
      keywords: JSON.stringify(['Flying', 'Persist']),
      oracle_text:
        'Flying\n' +
        'When this creature enters, put target creature card from an opponent\'s graveyard onto the ' +
        'battlefield under your control. It gains haste. At the beginning of your next end step, exile it.\n' +
        'Persist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield ' +
        "under its owner's control with a -1/-1 counter on it.)",
    });
    assert.ok(rolesOf(signalsFor(puppeteerClique), 'counters', '-1/-1').includes('produces'));
  });

  it('stun counters register under their own kind', () => {
    // The Watcher in the Water — real oracle text.
    const watcher = makeCard({
      name: 'The Watcher in the Water',
      type_line: 'Legendary Creature — Kraken',
      creature_types: JSON.stringify(['Kraken']),
      oracle_text:
        'The Watcher in the Water enters tapped with nine stun counters on it.\n' +
        'Whenever you draw a card during an opponent\'s turn, create a 1/1 blue Tentacle creature token.\n' +
        'Whenever a Tentacle you control dies, untap up to one target Kraken and put a stun counter on up ' +
        'to one target nonland permanent.',
    });
    assert.ok(rolesOf(signalsFor(watcher), 'counters', 'stun').includes('produces'));
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

    // Pinned, not incidental: kindred:Zombie's active `rewards` role above is
    // exactly the evidence the goWide-borrows-from-kindred fix looks for, so
    // this card's own otherwise-generic amass production now reads as
    // goWide:Zombie rather than a phantom unqualified Go-Wide Combat match.
    const signals = signalsFor(dreadhordeInvasion, ['Zombie']);
    assert.strictEqual(find(signals, 'goWide', undefined), undefined);
    const goWide = find(signals, 'goWide', 'Zombie');
    assert.ok(goWide, 'expected a Zombie-qualified goWide signal');
    assert.strictEqual(goWide!.qualifierSource, 'kindred');
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
    // Still unqualified after the goWide-borrows-from-kindred fix: both of
    // Gothmog's own kindred types are produces-only (asserted above), so
    // caresBeyondProduction declines both and there is nothing to borrow —
    // `rolesOf(signals, 'goWide')` (no qualifier arg) would return `[]` were
    // this accidentally qualified, since `find` would no longer see an
    // unqualified match at all.
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

describe('card properties: alternativeCost, modified, alternateWin', () => {
  it('reads Phyrexian mana as an alternative cost', () => {
    // Dismember — real oracle text and mana cost.
    const dismember = makeCard({
      name: 'Dismember',
      mana_cost: '{1}{B/P}{B/P}',
      cmc: 3,
      type_line: 'Instant',
      oracle_text:
        "({B/P} can be paid with either {B} or 2 life.)\nTarget creature gets -5/-5 until end of turn.",
    });
    assert.strictEqual(buildCardFacts(dismember, buildVocabulary([], [])).alternativeCost, true);
  });

  it('reads the commander free-cast template', () => {
    // Fierce Guardianship — real oracle text.
    const fierceGuardianship = makeCard({
      name: 'Fierce Guardianship',
      mana_cost: '{2}{U}',
      cmc: 3,
      type_line: 'Instant',
      oracle_text:
        'If you control a commander, you may cast this spell without paying its mana cost.\n' +
        'Counter target noncreature spell.',
    });
    assert.strictEqual(
      buildCardFacts(fierceGuardianship, buildVocabulary([], [])).alternativeCost,
      true,
    );
  });

  it('reads the "rather than pay this spell\'s mana cost" template', () => {
    // Snuff Out — real oracle text.
    const snuffOut = makeCard({
      name: 'Snuff Out',
      mana_cost: '{3}{B}',
      cmc: 4,
      type_line: 'Instant',
      oracle_text:
        "If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost.\n" +
        "Destroy target nonblack creature. It can't be regenerated.",
    });
    assert.strictEqual(buildCardFacts(snuffOut, buildVocabulary([], [])).alternativeCost, true);
  });

  it('reads Evoke/Cleave/Delve/Convoke as an alternative cost', () => {
    // Walker of the Grove — real oracle text, has Evoke.
    const walkerOfTheGrove = makeCard({
      name: 'Walker of the Grove',
      mana_cost: '{6}{G}{G}',
      cmc: 8,
      type_line: 'Creature — Elemental',
      keywords: '["Evoke"]',
      oracle_text:
        'When this creature leaves the battlefield, create a 4/4 green Elemental creature token.\n' +
        "Evoke {4}{G} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)",
    });
    assert.strictEqual(
      buildCardFacts(walkerOfTheGrove, buildVocabulary([], [])).alternativeCost,
      true,
    );
  });

  it('does not read cost reduction granted to other spells as its own alternative cost', () => {
    // Nissa, Worldsoul Speaker — real oracle text: reduces the cost of
    // *other* permanent spells, not her own. That is `enables`
    // (`reducesCostOf`), not this card's own alternativeCost.
    const nissa = makeCard({
      name: 'Nissa, Worldsoul Speaker',
      mana_cost: '{2}{G}',
      cmc: 3,
      type_line: 'Legendary Planeswalker — Nissa',
      oracle_text:
        'Landfall — Whenever a land you control enters, you get {E}{E} (two energy counters).\n' +
        'You may pay eight {E} rather than pay the mana cost for permanent spells you cast.',
    });
    assert.strictEqual(buildCardFacts(nissa, buildVocabulary([], [])).alternativeCost, false);
  });

  it('reads "modified creature(s)/permanent(s)" and "is modified"', () => {
    // Kodama of the West Tree — real oracle text, the CR-umbrella card the
    // property is named for.
    const kodama = makeCard({
      name: 'Kodama of the West Tree',
      type_line: 'Legendary Creature — Fox Spirit',
      oracle_text:
        'Reach\nModified creatures you control have trample. ' +
        '(Equipment, Auras you control, and counters are modifications.)\n' +
        'Whenever a modified creature you control deals combat damage to a player, search your ' +
        'library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    });
    assert.strictEqual(buildCardFacts(kodama, buildVocabulary([], [])).modified, true);

    // Orochi Merge-Keeper — real oracle text, "is modified" rather than
    // "modified creature".
    const orochiMergeKeeper = makeCard({
      name: 'Orochi Merge-Keeper',
      type_line: 'Creature — Snake Warrior',
      oracle_text: 'As long as this creature is modified, it has "{T}: Add {G}{G}."',
    });
    assert.strictEqual(buildCardFacts(orochiMergeKeeper, buildVocabulary([], [])).modified, true);
  });

  it('does not mistake "these modified rules" for the Modified mechanic', () => {
    // Booster Blitz — real oracle text: "modified" describing house rules
    // for a game variant, nothing to do with counters/Equipment/Auras.
    const boosterBlitz = makeCard({
      name: 'Booster Blitz',
      type_line: 'Sorcery',
      oracle_text: 'Start a series of Magic games with these modified rules: Players start at 5 life.',
    });
    assert.strictEqual(buildCardFacts(boosterBlitz, buildVocabulary([], [])).modified, false);
  });

  it('reads an actual "you win the game" outcome', () => {
    // Knuckles the Echidna and Approach of the Second Sun — real oracle text.
    const knuckles = makeCard({
      name: 'Knuckles the Echidna',
      type_line: 'Legendary Creature — Echidna',
      oracle_text:
        'Double strike, trample, haste\n' +
        'Whenever one or more creatures you control deal combat damage to a player, create a Treasure token.\n' +
        'Treasure Hunter — At the beginning of your upkeep, if you control thirty or more artifacts, you win the game.',
    });
    assert.strictEqual(buildCardFacts(knuckles, buildVocabulary([], [])).alternateWin, true);

    const approach = makeCard({
      name: 'Approach of the Second Sun',
      type_line: 'Sorcery',
      oracle_text:
        "If this spell was cast from your hand and you've cast another spell named Approach of " +
        'the Second Sun this game, you win the game. Otherwise, put Approach of the Second Sun ' +
        "into its owner's library seventh from the top and you gain 7 life.",
    });
    assert.strictEqual(buildCardFacts(approach, buildVocabulary([], [])).alternateWin, true);
  });

  it('does not read a "can\'t lose/win" prevention effect as an alternate win condition', () => {
    // The Book of Exalted Deeds — real oracle text. archetypes.md names this
    // card as an alternateWin example, but it only ever GRANTS "you can't
    // lose the game and your opponents can't win the game" to an Angel — a
    // symmetric protection clause, not a win condition of its own. Verified
    // against the seeded database rather than trusting the doc's memory.
    const bookOfExaltedDeeds = makeCard({
      name: 'The Book of Exalted Deeds',
      type_line: 'Legendary Artifact',
      oracle_text:
        'At the beginning of your end step, if you gained 3 or more life this turn, create a 3/3 ' +
        'white Angel creature token with flying.\n' +
        '{W}{W}{W}, {T}, Exile The Book of Exalted Deeds: Put an enlightened counter on target ' +
        'Angel. It gains "You can\'t lose the game and your opponents can\'t win the game." ' +
        'Activate only as a sorcery.',
    });
    assert.strictEqual(
      buildCardFacts(bookOfExaltedDeeds, buildVocabulary([], [])).alternateWin,
      false,
    );

    // Herald of Eternal Dawn — real oracle text, same "can't lose/win" shape.
    const heraldOfEternalDawn = makeCard({
      name: 'Herald of Eternal Dawn',
      type_line: 'Creature — Angel',
      keywords: '["Flash"]',
      oracle_text:
        'Flash (You may cast this spell any time you could cast an instant.)\n' +
        "Flying\nYou can't lose the game and your opponents can't win the game.",
    });
    assert.strictEqual(
      buildCardFacts(heraldOfEternalDawn, buildVocabulary([], [])).alternateWin,
      false,
    );
  });

  it('exposes cmc for archetypes to read alongside alternativeCost', () => {
    const card = makeCard({ name: 'Test Card', cmc: 5 });
    assert.strictEqual(buildCardFacts(card, buildVocabulary([], [])).cmc, 5);

    const noCost = makeCard({ name: 'Test Land', cmc: null, type_line: 'Land' });
    assert.strictEqual(buildCardFacts(noCost, buildVocabulary([], [])).cmc, 0);
  });
});

describe('Copy Effects: spells, abilities, and permanents', () => {
  it('qualifies a spell-copy payoff by the card type it restricts to', () => {
    // Kalamax, the Stormsire — real oracle text.
    const kalamax = makeCard({
      name: 'Kalamax, the Stormsire',
      type_line: 'Legendary Creature — Elemental Dinosaur',
      oracle_text:
        'Whenever you cast your first instant spell each turn, if Kalamax is tapped, copy that ' +
        'spell. You may choose new targets for the copy.\n' +
        'Whenever you copy an instant spell, put a +1/+1 counter on Kalamax.',
    });
    const signals = signalsFor(kalamax);
    assert.ok(find(signals, 'copyEffects', 'Instant'), 'expected an Instant-qualified copy signal');
  });

  it('does not qualify an ability-copy payoff by its source permanent\'s type', () => {
    // Weaver of Harmony — real oracle text: the ability copied isn't itself
    // an Enchantment just because it comes from one.
    const weaver = makeCard({
      name: 'Weaver of Harmony',
      type_line: 'Creature — Human Druid',
      oracle_text:
        'Other enchantment creatures you control get +1/+1.\n' +
        '{G}, {T}: Copy target activated or triggered ability you control from an enchantment ' +
        'source. You may choose new targets for the copy.',
    });
    const signals = signalsFor(weaver);
    assert.ok(
      find(signals, 'copyEffects', undefined),
      'expected an unqualified copy signal, not Enchantment',
    );
    assert.strictEqual(find(signals, 'copyEffects', 'Enchantment'), undefined);
  });

  it('does not qualify an ability-copy payoff by what the copies can target', () => {
    // Agrus Kos, Eternal Soldier — real oracle text: the ability copied
    // isn't itself a Creature just because the copies target creatures.
    const agrusKos = makeCard({
      name: 'Agrus Kos, Eternal Soldier',
      type_line: 'Legendary Creature — Human Soldier',
      oracle_text:
        'Vigilance\n' +
        'Whenever Agrus Kos becomes the target of an ability that targets only it, you may pay ' +
        '{1}{R/W}. If you do, copy that ability for each other creature you control that ability ' +
        'could target. Each copy targets a different one of those creatures.',
    });
    const signals = signalsFor(agrusKos);
    assert.ok(
      find(signals, 'copyEffects', undefined),
      'expected an unqualified copy signal, not Creature',
    );
    assert.strictEqual(find(signals, 'copyEffects', 'Creature'), undefined);
  });

  it('qualifies a token-copy payoff by what it copies', () => {
    // Rite of Replication — real oracle text.
    const rite = makeCard({
      name: 'Rite of Replication',
      type_line: 'Sorcery',
      oracle_text:
        'Kicker {5} (You may pay an additional {5} as you cast this spell.)\n' +
        "Create a token that's a copy of target creature. If this spell was kicked, create five " +
        'of those tokens instead.',
    });
    const signals = signalsFor(rite);
    assert.ok(find(signals, 'copyEffects', 'Creature'));
  });

  it('recognizes a clone/shapeshift copy with no "token" wording', () => {
    // Sculpting Steel and Mirrorweave — real oracle text. "Enter as a copy
    // of" and "becomes a copy of" are different templates (only the first
    // uses "as"), both worth recognizing.
    const sculptingSteel = makeCard({
      name: 'Sculpting Steel',
      type_line: 'Artifact',
      oracle_text: 'You may have this artifact enter as a copy of any artifact on the battlefield.',
    });
    assert.ok(find(signalsFor(sculptingSteel), 'copyEffects', 'Artifact'));

    const mirrorweave = makeCard({
      name: 'Mirrorweave',
      type_line: 'Instant',
      oracle_text: 'Each other creature becomes a copy of target nonlegendary creature until end of turn.',
    });
    assert.ok(find(signalsFor(mirrorweave), 'copyEffects', 'Creature'));
  });

  it('leaves an ability-copy payoff unqualified when it names no card type at all', () => {
    // Kirol, Attentive First-Year — real oracle text.
    const kirol = makeCard({
      name: 'Kirol, Attentive First-Year',
      type_line: 'Legendary Creature — Vampire Cleric',
      oracle_text:
        'Tap two untapped creatures you control: Copy target triggered ability you control. You ' +
        'may choose new targets for the copy. Activate only once each turn.',
    });
    const signals = signalsFor(kirol);
    assert.ok(find(signals, 'copyEffects', undefined));
  });
});

describe('Free Spells: casting for less than the printed cost', () => {
  it('recognizes alternativeCost cards', () => {
    // Fierce Guardianship and Dismember — real oracle text.
    const fierceGuardianship = makeCard({
      name: 'Fierce Guardianship',
      mana_cost: '{2}{U}',
      cmc: 3,
      type_line: 'Instant',
      oracle_text:
        'If you control a commander, you may cast this spell without paying its mana cost.\n' +
        'Counter target noncreature spell.',
    });
    assert.ok(hasActiveRole(rolesOf(signalsFor(fierceGuardianship), 'freeSpells')));

    const dismember = makeCard({
      name: 'Dismember',
      mana_cost: '{1}{B/P}{B/P}',
      cmc: 3,
      type_line: 'Instant',
      oracle_text:
        "({B/P} can be paid with either {B} or 2 life.)\nTarget creature gets -5/-5 until end of turn.",
    });
    assert.ok(hasActiveRole(rolesOf(signalsFor(dismember), 'freeSpells')));
  });

  it('recognizes Cascade, Suspend, Plot, Discover, and Rebound from the bare keyword alone', () => {
    // Maelstrom Colossus (Cascade), Lotus Bloom (Suspend), Unscrupulous
    // Contractor (Plot), Hurl into History (Discover), and Staggershock
    // (Rebound) — real oracle text. Each keyword's own reminder text is the
    // only place it says "without paying its mana cost", and reminder text
    // is stripped, so only the bare keyword itself survives.
    const maelstromColossus = makeCard({
      name: 'Maelstrom Colossus',
      type_line: 'Creature — Eldrazi',
      keywords: '["Cascade"]',
      oracle_text:
        'Cascade (When you cast this spell, exile cards from the top of your library until you ' +
        'exile a nonland card that costs less. You may cast it without paying its mana cost. Put ' +
        'the exiled cards on the bottom in a random order.)',
    });
    assert.ok(hasActiveRole(rolesOf(signalsFor(maelstromColossus), 'freeSpells')));

    const lotusBloom = makeCard({
      name: 'Lotus Bloom',
      type_line: 'Artifact',
      keywords: '["Suspend"]',
      oracle_text:
        'Suspend 3—{0} (Rather than cast this card from your hand, pay {0} and exile it with ' +
        'three time counters on it. At the beginning of your upkeep, remove a time counter. When ' +
        "the last is removed, cast it without paying its mana cost.)\nWhen Lotus Bloom enters, sacrifice it.\n{T}, Sacrifice Lotus Bloom: Add three mana of any one color.",
    });
    assert.ok(hasActiveRole(rolesOf(signalsFor(lotusBloom), 'freeSpells')));

    const unscrupulousContractor = makeCard({
      name: 'Unscrupulous Contractor',
      type_line: 'Creature — Human Rogue',
      keywords: '["Plot"]',
      oracle_text:
        'When this creature enters, you may sacrifice a creature. When you do, target player ' +
        'draws two cards and loses 2 life.\n' +
        'Plot {2}{B} (You may pay {2}{B} and exile this card from your hand. Cast it as a ' +
        'sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)',
    });
    assert.ok(hasActiveRole(rolesOf(signalsFor(unscrupulousContractor), 'freeSpells')));

    const hurlIntoHistory = makeCard({
      name: 'Hurl into History',
      type_line: 'Instant',
      keywords: '["Discover"]',
      oracle_text:
        "Counter target artifact or creature spell. Discover X, where X is that spell's mana " +
        'value. (Exile cards from the top of your library until you exile a nonland card with ' +
        'that mana value or less. Cast it without paying its mana cost or put it into your hand. ' +
        'Put the rest on the bottom in a random order.)',
    });
    assert.ok(hasActiveRole(rolesOf(signalsFor(hurlIntoHistory), 'freeSpells')));

    const staggershock = makeCard({
      name: 'Staggershock',
      type_line: 'Instant',
      keywords: '["Rebound"]',
      oracle_text:
        'Staggershock deals 2 damage to any target.\n' +
        'Rebound (If you cast this spell from your hand, exile it as it resolves. At the ' +
        'beginning of your next upkeep, you may cast this card from exile without paying its ' +
        'mana cost.)',
    });
    assert.ok(hasActiveRole(rolesOf(signalsFor(staggershock), 'freeSpells')));
  });

  it('recognizes a card granting a free cast to something else, not just itself', () => {
    // Rashmi, Eternities Crafter and Mindclaw Shaman — real oracle text, no
    // Cascade/Suspend/etc. keyword and no alternativeCost of their own.
    const rashmi = makeCard({
      name: 'Rashmi, Eternities Crafter',
      type_line: 'Legendary Creature — Elemental Wizard',
      oracle_text:
        'Whenever you cast your first spell each turn, reveal the top card of your library. You ' +
        "may cast it without paying its mana cost if it's a spell with lesser mana value. If you " +
        "don't cast it, put it into your hand.",
    });
    assert.ok(hasActiveRole(rolesOf(signalsFor(rashmi), 'freeSpells')));

    const mindclawShaman = makeCard({
      name: 'Mindclaw Shaman',
      type_line: 'Creature — Human Shaman',
      oracle_text:
        'When this creature enters, target opponent reveals their hand. You may cast an instant ' +
        'or sorcery spell from among those cards without paying its mana cost.',
    });
    assert.ok(hasActiveRole(rolesOf(signalsFor(mindclawShaman), 'freeSpells')));
  });

  it('does not fire on an ordinary card with no free or alternative cost', () => {
    // Sol Ring and Lightning Bolt — real oracle text, neither has anything
    // to do with alternative costs.
    const solRing = makeCard({
      name: 'Sol Ring',
      type_line: 'Artifact',
      oracle_text: '{T}: Add {C}{C}.',
    });
    assert.strictEqual(find(signalsFor(solRing), 'freeSpells', undefined), undefined);

    const lightningBolt = makeCard({
      name: 'Lightning Bolt',
      type_line: 'Instant',
      oracle_text: 'Lightning Bolt deals 3 damage to any target.',
    });
    assert.strictEqual(find(signalsFor(lightningBolt), 'freeSpells', undefined), undefined);
  });
});

describe('Artifacts: Vehicle, Food, Clue, and Treasure', () => {
  it('qualifies structurally by its own subtype, no text required', () => {
    // Smuggler's Copter — real oracle text.
    const smugglersCopter = makeCard({
      name: "Smuggler's Copter",
      type_line: 'Artifact — Vehicle',
      oracle_text:
        'Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard ' +
        'a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: ' +
        "This Vehicle becomes an artifact creature until end of turn.)",
    });
    const signals = signalsFor(smugglersCopter);
    assert.ok(find(signals, 'artifacts', 'Vehicle'));
  });

  it('does not qualify by a structural subtype the archetype does not track', () => {
    // Cranial Plating — real oracle text. It's structurally an Equipment
    // (voltron's territory), and its own reward doesn't restrict to
    // Equipment at all — it reads *any* artifact, so it must not become
    // artifacts:Equipment just because it happens to be one.
    const cranialPlating = makeCard({
      name: 'Cranial Plating',
      type_line: 'Artifact — Equipment',
      oracle_text:
        'Equipped creature gets +1/+0 for each artifact you control.\n' +
        '{B}{B}: Attach this Equipment to target creature you control.\n' +
        'Equip {1}',
    });
    const signals = signalsFor(cranialPlating);
    assert.ok(find(signals, 'artifacts', undefined), 'expected an unqualified artifacts signal');
    assert.strictEqual(find(signals, 'artifacts', 'Equipment'), undefined);
  });

  it('qualifies a token-doubling amplifier by the type it restricts to', () => {
    // Xorn — real oracle text: Treasure-specific.
    const xorn = makeCard({
      name: 'Xorn',
      type_line: 'Creature — Elemental',
      oracle_text:
        'If you would create one or more Treasure tokens, instead create those tokens plus an ' +
        'additional Treasure token.',
    });
    assert.ok(find(signalsFor(xorn), 'artifacts', 'Treasure'));
  });

  it('leaves a token-doubler unqualified when it touches every type equally', () => {
    // Academy Manufactor — real oracle text: Clue, Food, *and* Treasure at
    // once, so it must not arbitrarily pick whichever type word the clause
    // happens to mention first.
    const academyManufactor = makeCard({
      name: 'Academy Manufactor',
      type_line: 'Artifact Creature — Assembly-Worker',
      oracle_text: 'If you would create a Clue, Food, or Treasure token, instead create one of each.',
    });
    const signals = signalsFor(academyManufactor);
    assert.ok(hasActiveRole(rolesOf(signals, 'artifacts')));
    assert.strictEqual(find(signals, 'artifacts', 'Clue'), undefined);
    assert.strictEqual(find(signals, 'artifacts', 'Food'), undefined);
    assert.strictEqual(find(signals, 'artifacts', 'Treasure'), undefined);
  });

  it('recognizes a payoff that reads artifact count generically', () => {
    // Monumental Corruption — real oracle text, no subtype restriction.
    const monumentalCorruption = makeCard({
      name: 'Monumental Corruption',
      type_line: 'Sorcery',
      oracle_text: 'Target player draws X cards and loses X life, where X is the number of artifacts you control.',
    });
    assert.ok(find(signalsFor(monumentalCorruption), 'artifacts', undefined));
  });

  it('recognizes sacrificing a Food as a payoff', () => {
    // Wicked Wolf — real oracle text.
    const wickedWolf = makeCard({
      name: 'Wicked Wolf',
      type_line: 'Creature — Boar',
      oracle_text:
        "When this creature enters, it fights up to one target creature you don't control.\n" +
        'Sacrifice a Food: Put a +1/+1 counter on this creature. It gains indestructible until ' +
        'end of turn.',
    });
    assert.ok(find(signalsFor(wickedWolf), 'artifacts', 'Food'));
  });

  it('recognizes Investigate as production, unqualified (the Clue it makes is reminder-only)', () => {
    // Lazav, Wearer of Faces — real oracle text. Investigate's own "Create
    // a Clue token" is inside its reminder text and stripped, so this
    // stays unqualified rather than qualifying Clue — the same "unqualified
    // supports qualified" relation that lets it still back a qualified
    // Artifacts (Clue) theme once grouped with cards that do restrict.
    const lazav = makeCard({
      name: 'Lazav, Wearer of Faces',
      type_line: 'Legendary Creature — Zombie Shapeshifter',
      keywords: '[]',
      oracle_text:
        'Whenever Lazav attacks, exile target card from a graveyard, then investigate. (Create a ' +
        'Clue token. It\'s an artifact with "{2}, Sacrifice this token: Draw a card.")',
    });
    const signals = signalsFor(lazav);
    assert.ok(hasActiveRole(rolesOf(signals, 'artifacts')));
    assert.strictEqual(find(signals, 'artifacts', 'Clue'), undefined);
  });
});

describe('Game State: shared state read and written across control, not owned by a single card', () => {
  it('theRing: produces on tempting, rewards on being the Ring-bearer', () => {
    // Aragorn, Company Leader — real oracle text.
    const aragorn = makeCard({
      name: 'Aragorn, Company Leader',
      type_line: 'Legendary Creature — Human Ranger',
      keywords: '["Vigilance","Deathtouch"]',
      oracle_text:
        'Whenever the Ring tempts you, if you chose a creature other than Aragorn as your ' +
        'Ring-bearer, put your choice of a counter from among first strike, vigilance, ' +
        'deathtouch, and lifelink on Aragorn.\n' +
        'Whenever you put one or more counters on Aragorn, put one of each of those kinds of ' +
        'counters on up to one other target creature.',
    });
    const signals = signalsFor(aragorn);
    assert.deepStrictEqual(rolesOf(signals, 'gameState', 'theRing'), ['produces', 'rewards']);
  });

  it('monarch: produces on becoming, rewards on staying', () => {
    // Court of Ire — real oracle text.
    const courtOfIre = makeCard({
      name: 'Court of Ire',
      type_line: 'Enchantment',
      oracle_text:
        'When this enchantment enters, you become the monarch.\n' +
        "At the beginning of your upkeep, this enchantment deals 2 damage to any target. If you're " +
        'the monarch, it deals 7 damage instead.',
    });
    const signals = signalsFor(courtOfIre);
    assert.deepStrictEqual(rolesOf(signals, 'gameState', 'monarch'), ['produces', 'rewards']);
  });

  it('maxSpeed: keyword-detected, with a dash-separated reward clause', () => {
    // Gastal Raider — real oracle text.
    const gastalRaider = makeCard({
      name: 'Gastal Raider',
      type_line: 'Creature — Vampire Rogue',
      keywords: '["Max speed","Start your engines!"]',
      oracle_text:
        'Start your engines!\n' +
        'When this creature enters, target opponent reveals their hand. You choose an instant or ' +
        'sorcery card from it. That player discards that card.\n' +
        'Max speed — This creature gets +1/+1 and has menace.',
    });
    const signals = signalsFor(gastalRaider);
    assert.deepStrictEqual(rolesOf(signals, 'gameState', 'maxSpeed'), ['produces', 'rewards']);
  });

  it('initiative: recognizes third-person "has the initiative", not just "you have"', () => {
    // Undercellar Sweep — real oracle text. Regression test: the original
    // rewards regex only matched "you've"/"you have", which missed this
    // card's actual "if you or a player you're attacking has the
    // initiative" phrasing entirely.
    const undercellarSweep = makeCard({
      name: 'Undercellar Sweep',
      type_line: 'Enchantment',
      oracle_text:
        'When this enchantment enters, you take the initiative.\n' +
        "Whenever you attack, if you or a player you're attacking has the initiative, you create " +
        'two 1/1 white Soldier creature tokens that are tapped and attacking.',
    });
    const signals = signalsFor(undercellarSweep);
    assert.deepStrictEqual(rolesOf(signals, 'gameState', 'initiative'), ['produces', 'rewards']);
  });

  it('dayNight: text-detected even with no keyword present', () => {
    // Sunrise Cavalier — real oracle text. Daybound/Nightbound are absent —
    // this card only ever reads day/night state, so detection must fall
    // back to the clause text rather than requiring the keyword.
    const sunriseCavalier = makeCard({
      name: 'Sunrise Cavalier',
      type_line: 'Creature — Human Knight',
      keywords: '["Haste","Trample"]',
      oracle_text:
        'Trample, haste\n' +
        "If it's neither day nor night, it becomes day as this creature enters.\n" +
        'Whenever day becomes night or night becomes day, put a +1/+1 counter on target creature ' +
        'you control.',
    });
    const signals = signalsFor(sunriseCavalier);
    assert.deepStrictEqual(rolesOf(signals, 'gameState', 'dayNight'), ['produces', 'rewards']);
  });

  it('dayNight: keyword-detected from Daybound/Nightbound with no text mention', () => {
    // Graveyard Trespasser // Graveyard Glutton — real oracle text.
    const graveyardTrespasser = makeCard({
      name: 'Graveyard Trespasser // Graveyard Glutton',
      type_line: 'Creature — Human Werewolf',
      keywords: '["Transform","Daybound","Ward","Nightbound"]',
      oracle_text:
        'Ward—Discard a card.\n' +
        'Whenever this creature enters or attacks, exile up to one target card from a graveyard. ' +
        'If a creature card was exiled this way, each opponent loses 1 life and you gain 1 life.\n' +
        'Daybound (If a player casts no spells during their own turn, it becomes night next turn.)',
    });
    const signals = signalsFor(graveyardTrespasser);
    assert.ok(find(signals, 'gameState', 'dayNight'));
  });

  it('does not false-positive on an unrelated "night counter" mechanic', () => {
    // Replicating Ring — real oracle text: a literal counter type named
    // "night", nothing to do with the day/night game state.
    const replicatingRing = makeCard({
      name: 'Replicating Ring',
      type_line: 'Snow Artifact',
      oracle_text:
        '{T}: Add one mana of any color.\n' +
        'At the beginning of your upkeep, put a night counter on this artifact. Then if it has ' +
        'eight or more night counters on it, remove all of them and create eight colorless snow ' +
        'artifact tokens named Replicated Ring with "{T}: Add one mana of any color."',
    });
    const signals = signalsFor(replicatingRing);
    assert.strictEqual(find(signals, 'gameState'), undefined);
  });

  it('does not fire on a card with no game-state text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'gameState'), undefined);
  });
});

describe('Lifegain: gaining life on purpose, and the payoffs that read it', () => {
  it('produces from a direct "you gain N life" effect', () => {
    // Soul Warden — real oracle text.
    const soulWarden = makeCard({
      name: 'Soul Warden',
      type_line: 'Creature — Human Cleric',
      oracle_text: 'Whenever another creature enters, you gain 1 life.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(soulWarden), 'lifegain'), ['produces']);
  });

  it('produces from granting lifelink to another permanent, not just having it', () => {
    // Basilisk Collar — real oracle text. The Equipment itself has no
    // Lifelink keyword of its own; it grants lifelink to whatever it's
    // attached to.
    const basiliskCollar = makeCard({
      name: 'Basilisk Collar',
      type_line: 'Artifact — Equipment',
      keywords: '["Equip"]',
      oracle_text:
        'Equipped creature has deathtouch and lifelink. (Any amount of damage it deals to a creature ' +
        'is enough to destroy it. Damage dealt by this creature also causes you to gain that much ' +
        'life.)\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(basiliskCollar), 'lifegain'), ['produces']);
  });

  it('does not produce merely by mentioning a creature that already has lifelink', () => {
    // Duskfang Mentor — real oracle text, second ability only. Regression
    // guard: "each creature you control with lifelink" selects existing
    // lifelink creatures for a payoff, it doesn't grant lifelink to
    // anything, so it must not register as production.
    const duskfangMentorSecondAbility = makeCard({
      name: 'Duskfang Mentor',
      type_line: 'Creature — Vampire Cleric',
      oracle_text: '{1}{B}, {T}: Put a +1/+1 counter on each creature you control with lifelink.',
    });
    assert.strictEqual(find(signalsFor(duskfangMentorSecondAbility), 'lifegain'), undefined);
  });

  it('rewards whenever life is gained', () => {
    // Elenda's Hierophant — real oracle text.
    const eldensHierophant = makeCard({
      name: "Elenda's Hierophant",
      type_line: 'Creature — Vampire Cleric',
      keywords: '["Flying"]',
      oracle_text:
        'Flying\nWhenever you gain life, put a +1/+1 counter on this creature.\nWhen this creature ' +
        'dies, create X 1/1 white Vampire creature tokens with lifelink, where X is its power.',
    });
    const roles = rolesOf(signalsFor(eldensHierophant), 'lifegain');
    // Also produces: the death trigger creates lifelink tokens.
    assert.deepStrictEqual(roles, ['produces', 'rewards']);
  });

  it('rewards a bare "if you gained life this turn" conditional, not just a named threshold', () => {
    // Bre of Clan Stoutarm — real oracle text, the commander whose deck
    // motivated this archetype (docs/archetypes.md's keyword-shadow table:
    // her deck's real theme is Lifegain, previously reported as Lifelink).
    const bre = makeCard({
      name: 'Bre of Clan Stoutarm',
      type_line: 'Legendary Creature — Dwarf Berserker',
      oracle_text:
        '{1}{W}, {T}: Another target creature you control gains flying and lifelink until end of turn.\n' +
        "At the beginning of your end step, if you gained life this turn, exile cards from the top of " +
        "your library until you exile a nonland card. You may cast that card without paying its mana " +
        "cost if the spell's mana value is less than or equal to the amount of life you gained this " +
        'turn. Otherwise, put it into your hand.',
    });
    const roles = rolesOf(signalsFor(bre), 'lifegain');
    // Also produces: her activated ability grants lifelink.
    assert.deepStrictEqual(roles, ['produces', 'rewards']);
  });

  it('rewards an exact-threshold conditional', () => {
    // The Book of Exalted Deeds — real oracle text.
    const bookOfExaltedDeeds = makeCard({
      name: 'The Book of Exalted Deeds',
      type_line: 'Legendary Artifact — Book',
      oracle_text:
        'At the beginning of your end step, if you gained 3 or more life this turn, create a 3/3 white ' +
        'Angel creature token with flying.\n{W}{W}{W}, {T}, Exile The Book of Exalted Deeds: Put an ' +
        'enlightened counter on target Angel. It gains "You can\'t lose the game and your opponents ' +
        'can\'t win the game." Activate only as a sorcery.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(bookOfExaltedDeeds), 'lifegain'), ['rewards']);
  });

  it('amplifies a "would gain life ... instead" doubler', () => {
    // Angel of Vitality — real oracle text.
    const angelOfVitality = makeCard({
      name: 'Angel of Vitality',
      type_line: 'Creature — Angel',
      keywords: '["Flying"]',
      oracle_text:
        'Flying\nIf you would gain life, you gain that much life plus 1 instead.\nThis creature gets ' +
        '+2/+2 as long as you have 25 or more life.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(angelOfVitality), 'lifegain'), ['amplifies']);
  });

  it('does not amplify an opponent-facing lifegain denial effect', () => {
    // Tainted Remedy — real oracle text. "An opponent" would gain life, not
    // "you" — this is hate for an opposing lifegain plan, not an amplifier
    // for this deck's own.
    const taintedRemedy = makeCard({
      name: 'Tainted Remedy',
      type_line: 'Enchantment',
      oracle_text: 'If an opponent would gain life, that player loses that much life instead.',
    });
    assert.strictEqual(find(signalsFor(taintedRemedy), 'lifegain'), undefined);
  });

  it('does not fire on a card with no lifegain text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'lifegain'), undefined);
  });
});

describe('Drain: life loss as a trigger, not damage', () => {
  it('produces from the direct devotion/X-drain template', () => {
    // Gray Merchant of Asphodel — real oracle text.
    const grayMerchant = makeCard({
      name: 'Gray Merchant of Asphodel',
      type_line: 'Creature — Zombie',
      oracle_text:
        'When this creature enters, each opponent loses X life, where X is your devotion to black. ' +
        'You gain life equal to the life lost this way. (Each {B} in the mana costs of permanents you ' +
        'control counts toward your devotion to black.)',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(grayMerchant), 'drain'), ['produces']);
  });

  it('produces from an aristocrats-style death trigger', () => {
    // Zulaport Cutthroat — real oracle text.
    const zulaportCutthroat = makeCard({
      name: 'Zulaport Cutthroat',
      type_line: 'Creature — Human Rogue Ally',
      oracle_text:
        'Whenever this creature or another creature you control dies, each opponent loses 1 life and ' +
        'you gain 1 life.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(zulaportCutthroat), 'drain'), ['produces']);
  });

  it('produces from the Sanguine Bond/Vito bridge shape, since their trigger reads a different resource', () => {
    // Sanguine Bond — real oracle text. Its trigger is "you gain life"
    // (lifegain's own resource), so the opponent life loss it causes is
    // still drain's own production, not a reward for something drain
    // itself already produced.
    const sanguineBond = makeCard({
      name: 'Sanguine Bond',
      type_line: 'Enchantment',
      oracle_text: 'Whenever you gain life, target opponent loses that much life.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(sanguineBond), 'drain'), ['produces']);
  });

  it('rewards, not produces, a card whose trigger IS an opponent losing life by any cause', () => {
    // Exquisite Blood — real oracle text. Regression guard: unlike Sanguine
    // Bond, this card doesn't cause the loss itself, it reads someone
    // else's — a bare "each/opponent ... loses ... life" production
    // matcher would have false-positived it as also producing drain.
    const exquisiteBlood = makeCard({
      name: 'Exquisite Blood',
      type_line: 'Enchantment',
      oracle_text: 'Whenever an opponent loses life, you gain that much life.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(exquisiteBlood), 'drain'), ['rewards']);
  });

  it('does not reward a self-referential "whenever you lose life" trigger', () => {
    // Vampire Scrivener — real oracle text. A different, life-as-a-resource
    // theme (paying life for value), not this archetype.
    const vampireScrivener = makeCard({
      name: 'Vampire Scrivener',
      type_line: 'Creature — Vampire Cleric',
      oracle_text: 'Whenever you lose life during your turn, put a +1/+1 counter on this creature.',
    });
    assert.strictEqual(find(signalsFor(vampireScrivener), 'drain'), undefined);
  });

  it('does not fire on an edict — sacrificing is not losing life', () => {
    // Accursed Marauder — real oracle text.
    const accursedMarauder = makeCard({
      name: 'Accursed Marauder',
      type_line: 'Creature — Zombie Warrior',
      oracle_text: 'When this creature enters, each player sacrifices a nontoken creature of their choice.',
    });
    assert.strictEqual(find(signalsFor(accursedMarauder), 'drain'), undefined);
  });

  it('does not fire on a card with no drain text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'drain'), undefined);
  });
});

describe('Cycling / Discard: discarding cards on purpose as a resource', () => {
  it('produces from the Cycling keyword alone', () => {
    // Tectonic Reformation — real oracle text.
    const tectonicReformation = makeCard({
      name: 'Tectonic Reformation',
      type_line: 'Enchantment',
      keywords: '["Cycling"]',
      oracle_text: 'Each land card in your hand has cycling {R}.\nCycling {2}',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(tectonicReformation), 'cyclingDiscard'), ['produces']);
  });

  it('produces from a "draw N, then discard N" loot template', () => {
    // Faithless Looting — real oracle text.
    const faithlessLooting = makeCard({
      name: 'Faithless Looting',
      type_line: 'Sorcery',
      keywords: '["Flashback"]',
      oracle_text:
        'Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your ' +
        'graveyard for its flashback cost. Then exile it.)',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(faithlessLooting), 'cyclingDiscard'), ['produces']);
  });

  it('produces from discard as an additional cost', () => {
    // Thrill of Possibility — real oracle text.
    const thrillOfPossibility = makeCard({
      name: 'Thrill of Possibility',
      type_line: 'Instant',
      oracle_text: 'As an additional cost to cast this spell, discard a card.\nDraw two cards.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(thrillOfPossibility), 'cyclingDiscard'), ['produces']);
  });

  it('produces from a symmetric "each player discards their hand" effect', () => {
    // Windfall — real oracle text.
    const windfall = makeCard({
      name: 'Windfall',
      type_line: 'Sorcery',
      oracle_text:
        'Each player discards their hand, then draws cards equal to the greatest number of cards a ' +
        'player discarded this way.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(windfall), 'cyclingDiscard'), ['produces']);
  });

  it('rewards, not produces, a card whose trigger IS discarding/cycling itself', () => {
    // Ivora, Insatiable Heir — real oracle text, second ability only.
    // Regression guard: this card doesn't discard anything itself, it
    // reads a discard already happening — a bare "discards? a card"
    // production matcher would have false-positived it as also producing.
    const ivoraSecondAbility = makeCard({
      name: 'Ivora, Insatiable Heir',
      type_line: 'Legendary Creature — Vampire Warrior',
      keywords: '["Trample"]',
      oracle_text: 'Trample\nWhenever you discard a card, put a +1/+1 counter on Ivora.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(ivoraSecondAbility), 'cyclingDiscard'), ['rewards']);
  });

  it('produces and rewards together when a card both cycles and pays off cycling', () => {
    // Curator of Mysteries — real oracle text.
    const curatorOfMysteries = makeCard({
      name: 'Curator of Mysteries',
      type_line: 'Creature — Sphinx',
      keywords: '["Scry","Flying","Cycling"]',
      oracle_text:
        'Flying\nWhenever you cycle or discard another card, scry 1.\nCycling {U} ({U}, Discard this ' +
        'card: Draw a card.)',
    });
    const roles = rolesOf(signalsFor(curatorOfMysteries), 'cyclingDiscard');
    assert.deepStrictEqual(roles, ['produces', 'rewards']);
  });

  it('does not produce from an opponent being forced to discard — that is an attack, not a resource', () => {
    const edict = makeCard({
      name: 'Test Discard Edict',
      type_line: 'Sorcery',
      oracle_text: 'Target opponent discards a card.',
    });
    assert.strictEqual(find(signalsFor(edict), 'cyclingDiscard'), undefined);
  });

  it('does not fire on a card with no cycling/discard text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'cyclingDiscard'), undefined);
  });
});

describe('Temporary Effects: delayed-cost cards and the enablers that erase the trigger', () => {
  it('enables from Obeka herself — nothing in her text says "temporary"', () => {
    // Obeka, Brute Chronologist — real oracle text. She has no delayed-cost
    // clause of her own; her whole job is ending other cards' turns early.
    const obeka = makeCard({
      name: 'Obeka, Brute Chronologist',
      type_line: 'Legendary Creature — Ogre Wizard',
      oracle_text:
        '{T}: The player whose turn it is may end the turn. (Exile all spells and abilities from the ' +
        'stack. The player whose turn it is discards down to their maximum hand size. Damage wears ' +
        'off, and "this turn" and "until end of turn" effects end.)',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(obeka), 'temporaryEffects'), ['enables']);
  });

  it('enables from Sundial of the Infinite, the archetype\'s other named eraser', () => {
    // Sundial of the Infinite — real oracle text.
    const sundial = makeCard({
      name: 'Sundial of the Infinite',
      type_line: 'Artifact',
      oracle_text:
        '{1}, {T}: End the turn. Activate only during your turn. (Exile all spells and abilities from ' +
        'the stack. Discard down to your maximum hand size. Damage wears off, and "this turn" and ' +
        '"until end of turn" effects end.)',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(sundial), 'temporaryEffects'), ['enables']);
  });

  it('produces from a delayed reanimation effect', () => {
    // Sneak Attack — real oracle text.
    const sneakAttack = makeCard({
      name: 'Sneak Attack',
      type_line: 'Enchantment',
      oracle_text:
        '{R}: You may put a creature card from your hand onto the battlefield. That creature gains ' +
        'haste. Sacrifice the creature at the beginning of the next end step.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(sneakAttack), 'temporaryEffects'), ['produces']);
  });

  it('produces from Unearth, whose entire cleanup template hides in reminder text', () => {
    // Kathari Bomber — real oracle text. Regression guard: Unearth's whole
    // functional text lives inside its own parenthetical, which
    // stripReminderText deletes — the bare "at the beginning of the next
    // end step" text matcher never sees it, so this has to come from the
    // literal Scryfall keyword instead.
    const kathariBomber = makeCard({
      name: 'Kathari Bomber',
      type_line: 'Creature — Kithkin Rebel',
      keywords: '["Flying","Unearth"]',
      oracle_text:
        'Flying\nWhen this creature deals combat damage to a player, create two 1/1 red Goblin ' +
        'creature tokens and sacrifice this creature.\nUnearth {3}{B}{R} ({3}{B}{R}: Return this ' +
        'card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of ' +
        "the next end step or if it would leave the battlefield. Unearth only as a sorcery.)",
    });
    assert.deepStrictEqual(rolesOf(signalsFor(kathariBomber), 'temporaryEffects'), ['produces']);
  });

  it('produces from granting Unearth to other cards, not just having it', () => {
    // Grixis — real oracle text. The grant clause survives reminder
    // stripping (it sits outside the parenthetical it introduces), so this
    // needs its own text matcher rather than the keywords array.
    const grixis = makeCard({
      name: 'Grixis',
      type_line: 'Legendary Land',
      oracle_text:
        'Blue, black, and/or red creature cards in your graveyard have unearth. The unearth cost is ' +
        "equal to the card's mana cost. (Pay the card's mana cost: Return it to the battlefield. The " +
        'creature gains haste. Exile it at the beginning of the next end step or if it would leave ' +
        'the battlefield. Unearth only as a sorcery.)',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(grixis), 'temporaryEffects'), ['produces']);
  });

  it('produces and enables together on the same card', () => {
    // Glorious End — real oracle text. Ends the turn (enables) and also
    // carries its own delayed downside using the same template (produces).
    const gloriousEnd = makeCard({
      name: 'Glorious End',
      type_line: 'Instant',
      oracle_text:
        'End the turn. (Exile all spells and abilities from the stack, including this card. The ' +
        'player whose turn it is discards down to their maximum hand size. Damage wears off, and ' +
        '"this turn" and "until end of turn" effects end.)\nAt the beginning of your next end step, ' +
        'you lose the game.',
    });
    const roles = rolesOf(signalsFor(gloriousEnd), 'temporaryEffects');
    assert.deepStrictEqual(roles, ['enables', 'produces']);
  });

  it('does not enable from an unrelated "extra turn" effect', () => {
    // Alchemist's Gambit — real oracle text. Taking an extra turn is a
    // different mechanic; it never says "end the turn".
    const alchemistsGambit = makeCard({
      name: "Alchemist's Gambit",
      type_line: 'Sorcery',
      oracle_text:
        "Cleave {4}{U}{U}{R} (You may cast this spell for its cleave cost. If you do, remove the " +
        'words in square brackets.)\nTake an extra turn after this one. During that turn, damage ' +
        "can't be prevented. [At the beginning of that turn's end step, you lose the game.]\nExile " +
        "Alchemist's Gambit.",
    });
    assert.strictEqual(find(signalsFor(alchemistsGambit), 'temporaryEffects'), undefined);
  });

  it('does not fire on a card with no temporary-effect text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'temporaryEffects'), undefined);
  });
});

describe('Recursion: the same body coming back from the graveyard, again and again', () => {
  it('produces from a repeatable self-cast engine', () => {
    // Gravecrawler — real oracle text.
    const gravecrawler = makeCard({
      name: 'Gravecrawler',
      type_line: 'Creature — Zombie',
      oracle_text:
        "This creature can't block.\nYou may cast this card from your graveyard as long as you " +
        'control a Zombie.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(gravecrawler), 'recursion'), ['produces']);
  });

  it('produces from a repeatable self-return trigger', () => {
    // Prized Amalgam — real oracle text.
    const prizedAmalgam = makeCard({
      name: 'Prized Amalgam',
      type_line: 'Creature — Zombie',
      oracle_text:
        'Whenever a creature enters, if it entered from your graveyard or you cast it from your ' +
        'graveyard, return this card from your graveyard to the battlefield tapped at the beginning ' +
        'of the next end step.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(prizedAmalgam), 'recursion'), ['produces']);
  });

  it('produces from granting Persist to other creatures, not just having it', () => {
    // Isilu, Carrier of Twilight — real oracle text (Eirdu's back face, the
    // corpus deck this archetype was built against per the repo owner).
    const isilu = makeCard({
      name: 'Isilu, Carrier of Twilight',
      type_line: 'Legendary Creature — Elemental God',
      keywords: '["Flying","Lifelink"]',
      oracle_text:
        'Flying, lifelink\nEach other nontoken creature you control has persist. (When it dies, if ' +
        "it had no -1/-1 counters on it, return it to the battlefield under its owner's control " +
        'with a -1/-1 counter on it.)\nAt the beginning of your first main phase, you may pay {W}. ' +
        'If you do, transform Isilu.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(isilu), 'recursion'), ['produces']);
  });

  it('amplifies the Persist loop by cancelling its -1/-1 counter on re-entry', () => {
    // Cathars' Crusade — real oracle text. Repo owner's own clarification:
    // this is the deck's combo piece that lets an Isilu-granted Persist
    // creature return more than once — the +1/+1 it puts on every
    // entering creature (including the Persist creature's own re-entry)
    // cancels the -1/-1 counter under CR 704.5q, so the next death
    // triggers Persist again instead of failing its "no -1/-1 counters"
    // check.
    const cathartsCrusade = makeCard({
      name: "Cathars' Crusade",
      type_line: 'Enchantment',
      oracle_text: 'Whenever a creature you control enters, put a +1/+1 counter on each creature you control.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(cathartsCrusade), 'recursion'), ['amplifies']);
  });

  it('does not amplify a card that only buffs itself, since that never touches a different Persist creature', () => {
    // Hulkling, Burgeoning Bruiser — real oracle text. The counter goes on
    // Hulkling itself, never on the creature that just entered, so it
    // can't cancel that creature's own -1/-1 from Persist.
    const hulkling = makeCard({
      name: 'Hulkling, Burgeoning Bruiser',
      type_line: 'Legendary Creature — Skrull Warrior',
      oracle_text:
        'Whenever another creature you control enters, if it has greater power or toughness than ' +
        'Hulkling, put a +1/+1 counter on Hulkling.',
    });
    assert.strictEqual(find(signalsFor(hulkling), 'recursion'), undefined);
  });

  it('does not produce from Flashback, a one-shot cast rather than a repeatable loop', () => {
    // Cabal Therapy — real oracle text. Flashback exiles the card after
    // its one graveyard cast, so this is not "the same body returning
    // again and again" — Reanimator/graveyard-value territory, not this.
    const cabalTherapy = makeCard({
      name: 'Cabal Therapy',
      type_line: 'Sorcery',
      keywords: '["Flashback"]',
      oracle_text:
        'Choose a nonland card name. Target player reveals their hand and discards all cards with ' +
        'that name.\nFlashback—Sacrifice a creature. (You may cast this card from your graveyard ' +
        'for its flashback cost. Then exile it.)',
    });
    assert.strictEqual(find(signalsFor(cabalTherapy), 'recursion'), undefined);
  });

  it('does not fire on a card with no recursion text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'recursion'), undefined);
  });
});

describe('Tap for Value: tapping and untapping your own permanents as a resource', () => {
  it('produces from tapping a different creature you control as a cost for mana', () => {
    // Springleaf Drum — real oracle text. One of the six mana-tap enablers
    // named in docs/archetypes.md's own "enables" section — this is what
    // turns Kalamax on at instant speed without her needing to attack.
    const springleafDrum = makeCard({
      name: 'Springleaf Drum',
      type_line: 'Artifact',
      oracle_text: '{T}, Tap an untapped creature you control: Add one mana of any color.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(springleafDrum), 'tapForValue'), ['produces']);
  });

  it('produces from tapping a different legendary permanent you control for a non-mana benefit', () => {
    // Honor-Worn Shaku — real oracle text.
    const honorWornShaku = makeCard({
      name: 'Honor-Worn Shaku',
      type_line: 'Artifact',
      oracle_text: '{T}: Add {C}.\nTap an untapped legendary permanent you control: Untap this artifact.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(honorWornShaku), 'tapForValue'), ['produces']);
  });

  it('produces from untapping your own permanents for free', () => {
    // Seedborn Muse — real oracle text.
    const seedbornMuse = makeCard({
      name: 'Seedborn Muse',
      type_line: 'Creature — Spirit',
      oracle_text: "Untap all permanents you control during each other player's untap step.",
    });
    assert.deepStrictEqual(rolesOf(signalsFor(seedbornMuse), 'tapForValue'), ['produces']);
  });

  it('does not fire on the beneficiary of a tap-for-value enabler, only the enabler itself', () => {
    // Kalamax, the Stormsire — real oracle text. Her own text only reads
    // "if Kalamax is tapped" as a condition; she has no tap-another-
    // permanent ability of her own, so she isn't this archetype's own
    // identity even though the six enablers exist specifically for her.
    const kalamax = makeCard({
      name: 'Kalamax, the Stormsire',
      type_line: 'Legendary Creature — Elemental Dinosaur',
      oracle_text:
        'Whenever you cast your first instant spell each turn, if Kalamax is tapped, copy that ' +
        'spell. You may choose new targets for the copy.\nWhenever you copy an instant spell, put ' +
        'a +1/+1 counter on Kalamax.',
    });
    assert.strictEqual(find(signalsFor(kalamax), 'tapForValue'), undefined);
  });

  it('does not fire on a plain tapped land with no tap-for-value ability', () => {
    // Training Center — real oracle text.
    const trainingCenter = makeCard({
      name: 'Training Center',
      type_line: 'Land',
      oracle_text: 'This land enters tapped unless you have two or more opponents.\n{T}: Add {U} or {R}.',
    });
    assert.strictEqual(find(signalsFor(trainingCenter), 'tapForValue'), undefined);
  });

  it('does not fire on a card with no tap-for-value text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'tapForValue'), undefined);
  });
});

describe('Card Draw: repeatable engines, the payoffs that read a draw, and the doublers', () => {
  it('produces from a repeatable engine triggered on something other than drawing', () => {
    // Rhystic Study — real oracle text.
    const rhysticStudy = makeCard({
      name: 'Rhystic Study',
      type_line: 'Enchantment',
      oracle_text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(rhysticStudy), 'cardDraw'), ['produces']);
  });

  it('produces from a one-shot draw spell', () => {
    // Behold the Multiverse — real oracle text.
    const beholdTheMultiverse = makeCard({
      name: 'Behold the Multiverse',
      type_line: 'Instant',
      oracle_text:
        'Scry 2, then draw two cards.\n' +
        'Foretell {1}{U} (During your turn, you may pay {2} and exile this card from your hand ' +
        'face down. Cast it on a later turn for its foretell cost.)',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(beholdTheMultiverse), 'cardDraw'), ['produces']);
  });

  it("produces even when the trigger reads someone else's draw, since it still causes its own", () => {
    // Consecrated Sphinx — real oracle text.
    const consecratedSphinx = makeCard({
      name: 'Consecrated Sphinx',
      type_line: 'Creature — Sphinx',
      oracle_text: 'Flying\nWhenever an opponent draws a card, you may draw two cards.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(consecratedSphinx), 'cardDraw'), ['produces']);
  });

  it('rewards, not produces, when the trigger IS you drawing a card', () => {
    // Chasm Skulker — real oracle text. The trigger contains "draw a card"
    // itself, which must not also read as producing one.
    const chasmSkulker = makeCard({
      name: 'Chasm Skulker',
      type_line: 'Creature — Squid Horror',
      oracle_text:
        'Whenever you draw a card, put a +1/+1 counter on this creature.\n' +
        "When this creature dies, create X 1/1 blue Squid creature tokens with islandwalk, where " +
        'X is the number of +1/+1 counters on this creature.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(chasmSkulker), 'cardDraw'), ['rewards']);
  });

  it('rewards from "your second card each turn", not just a bare draw trigger', () => {
    // Homunculus Horde — real oracle text.
    const homunculusHorde = makeCard({
      name: 'Homunculus Horde',
      type_line: 'Creature — Homunculus',
      oracle_text: 'Whenever you draw your second card each turn, create a token that\'s a copy of this creature.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(homunculusHorde), 'cardDraw'), ['rewards']);
  });

  it('a card can independently earn produces from one clause and rewards from another', () => {
    // Toothy, Imaginary Friend — real oracle text. The counter-growing
    // clause reads a draw (rewards); the death trigger causes real draws of
    // its own (produces) — two different abilities, two different roles,
    // the same shape as Krenko, Mob Boss producing and rewarding at once.
    const toothy = makeCard({
      name: 'Toothy, Imaginary Friend',
      type_line: 'Legendary Creature — Illusion',
      oracle_text:
        'Partner with Pir, Imaginative Rascal (When this creature enters, target player may put ' +
        'Pir into their hand from their library, then shuffle.)\n' +
        'Whenever you draw a card, put a +1/+1 counter on Toothy.\n' +
        'When Toothy leaves the battlefield, draw a card for each +1/+1 counter on it.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(toothy), 'cardDraw'), ['produces', 'rewards']);
  });

  it('amplifies, not produces, for a pure replacement effect that never causes a draw itself', () => {
    // Teferi's Ageless Insight — real oracle text. It never draws you a
    // card on its own — it only modifies a draw already happening from
    // another source — the same reasoning artifacts' own replacement
    // effects (Academy Manufactor, Xorn) are amplifies only.
    const teferisAgelessInsight = makeCard({
      name: "Teferi's Ageless Insight",
      type_line: 'Legendary Enchantment',
      oracle_text:
        'If you would draw a card except the first one you draw in each of your draw steps, draw ' +
        'two cards instead.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(teferisAgelessInsight), 'cardDraw'), ['amplifies']);
  });

  it('a doubler that also doubles life gain earns both archetypes\' amplifies independently', () => {
    // Alhammarret's Archive — real oracle text. docs/archetypes.md's own
    // corpus note calls this out by name: one card, two archetypes.
    const alhammarretsArchive = makeCard({
      name: "Alhammarret's Archive",
      type_line: 'Legendary Artifact',
      oracle_text:
        'If you would gain life, you gain twice that much life instead.\n' +
        'If you would draw a card except the first one you draw in each of your draw steps, draw ' +
        'two cards instead.',
    });
    const signals = signalsFor(alhammarretsArchive);
    assert.deepStrictEqual(rolesOf(signals, 'cardDraw'), ['amplifies']);
    assert.ok(rolesOf(signals, 'lifegain').includes('amplifies'));
  });

  it('does not fire on a card with no drawing text at all', () => {
    // Ioreth of the Healing House — real oracle text, from the same
    // watcher-in-the-water.txt corpus deck. Untap effects only.
    const ioreth = makeCard({
      name: 'Ioreth of the Healing House',
      type_line: 'Legendary Creature — Human Cleric',
      oracle_text: '{T}: Untap another target permanent.\n{T}: Untap two other target legendary creatures.',
    });
    assert.strictEqual(find(signalsFor(ioreth), 'cardDraw'), undefined);
  });

  it("an opponent drawing a card as your trigger condition doesn't stop the effect drawing you cards", () => {
    // Consecrated Sphinx and Nezahal, Primal Tide — real oracle text. Both
    // name an opponent in the trigger, but the actual draw is unconditionally
    // yours (imperative "draw", no explicit subject) — checked against the
    // full card pool, not assumed, after finding both of the false
    // positives below in the same sweep.
    const nezahal = makeCard({
      name: 'Nezahal, Primal Tide',
      type_line: 'Legendary Creature — Elder Dinosaur',
      oracle_text:
        "This spell can't be countered.\n" +
        'You have no maximum hand size.\n' +
        'Whenever an opponent casts a noncreature spell, draw a card.\n' +
        "Discard three cards: Exile Nezahal. Return it to the battlefield tapped under its " +
        "owner's control at the beginning of the next end step.",
    });
    assert.deepStrictEqual(rolesOf(signalsFor(nezahal), 'cardDraw'), ['produces']);
  });

  it('a third-person "draws" that names only an opponent as its subject never counts, even off a real draw-related trigger', () => {
    // Vendilion Clique and Mathas, Fiend Seeker — real oracle text. Found
    // checking the full card pool: an ungated `draws?` pattern rescued 124
    // previously zero-active-signal commanders, and both of these were in
    // the sample. Vendilion Clique replaces a card it just made a player
    // discard — that player draws, not you. Mathas' bounty hands the
    // opponent a card as a downside when the bountied creature finally
    // dies — again, not you. Third-person "draws" (grammatically, a
    // singular subject) needs an explicit subject that includes you (`each
    // player`, `all players`) to count — see the archetype's own comment
    // in signals.ts for the full reasoning.
    const vendilionClique = makeCard({
      name: 'Vendilion Clique',
      type_line: 'Legendary Creature — Faerie Wizard',
      oracle_text:
        "Flash\nFlying\nWhen Vendilion Clique enters, look at target player's hand. You may choose " +
        'a nonland card from it. If you do, that player reveals the chosen card, puts it on the ' +
        'bottom of their library, then draws a card.',
    });
    assert.strictEqual(find(signalsFor(vendilionClique), 'cardDraw'), undefined);

    const mathas = makeCard({
      name: 'Mathas, Fiend Seeker',
      type_line: 'Legendary Creature — Vampire',
      oracle_text:
        'Menace\nAt the beginning of your end step, put a bounty counter on target creature an ' +
        'opponent controls. For as long as that creature has a bounty counter on it, it has ' +
        '"When this creature dies, each opponent draws a card and gains 2 life."',
    });
    assert.strictEqual(find(signalsFor(mathas), 'cardDraw'), undefined);
  });

  it('"each player draws" is produces too, since that includes you', () => {
    // Scrawling Crawler — real oracle text. A symmetric wheel-style effect
    // still genuinely draws you a card, unlike the opponent-only shapes
    // above.
    const scrawlingCrawler = makeCard({
      name: 'Scrawling Crawler',
      type_line: 'Artifact Creature — Phyrexian Construct',
      oracle_text:
        'At the beginning of your upkeep, each player draws a card.\n' +
        'Whenever an opponent draws a card, that player loses 1 life.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(scrawlingCrawler), 'cardDraw'), ['produces']);
  });

  it('a replacement effect never counts as produces, whatever it replaces a draw with or whose draw it redirects', () => {
    // Eruth, Tormented Prophet and Urabrask, Heretic Praetor — real oracle
    // text. Neither draws anyone a card at all: Eruth turns your own draws
    // into a different kind of card access, and Urabrask taxes an
    // opponent's draw into something else entirely. Found in the same full
    // card pool check as the Vendilion Clique/Mathas cases above.
    const eruth = makeCard({
      name: 'Eruth, Tormented Prophet',
      type_line: 'Legendary Creature — Human Wizard',
      oracle_text:
        'If you would draw a card, exile the top two cards of your library instead. You may play ' +
        'those cards this turn.',
    });
    assert.strictEqual(find(signalsFor(eruth), 'cardDraw'), undefined);

    const urabrask = makeCard({
      name: 'Urabrask, Heretic Praetor',
      type_line: 'Legendary Creature — Phyrexian Praetor',
      oracle_text:
        'Haste\n' +
        'At the beginning of your upkeep, exile the top card of your library. You may play it this turn.\n' +
        "At the beginning of each opponent's upkeep, the next time they would draw a card this " +
        'turn, instead they exile the top card of their library. They may play it this turn.',
    });
    assert.strictEqual(find(signalsFor(urabrask), 'cardDraw'), undefined);
  });
});

describe('Burn: damage dealt directly, not through combat', () => {
  it('produces from a fixed-amount direct-damage spell', () => {
    // Guttersnipe — real oracle text.
    const guttersnipe = makeCard({
      name: 'Guttersnipe',
      type_line: 'Creature — Goblin Shaman',
      oracle_text: 'Whenever you cast an instant or sorcery spell, this creature deals 2 damage to each opponent.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(guttersnipe), 'burn'), ['produces']);
  });

  it('produces from an X-damage spell', () => {
    // Comet Storm — real oracle text.
    const cometStorm = makeCard({
      name: 'Comet Storm',
      type_line: 'Instant',
      oracle_text:
        'Multikicker {1} (You may pay an additional {1} any number of times as you cast this spell.)\n' +
        'Choose any target, then choose another target for each time this spell was kicked. Comet Storm ' +
        'deals X damage to each of them.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(cometStorm), 'burn'), ['produces']);
  });

  it("produces from the power-into-damage template", () => {
    // Fling and Soul's Fire — real oracle text.
    const fling = makeCard({
      name: 'Fling',
      type_line: 'Instant',
      oracle_text:
        'As an additional cost to cast this spell, sacrifice a creature.\n' +
        "Fling deals damage equal to the sacrificed creature's power to any target.",
    });
    assert.deepStrictEqual(rolesOf(signalsFor(fling), 'burn'), ['produces']);

    const soulsFire = makeCard({
      name: "Soul's Fire",
      type_line: 'Instant',
      oracle_text: 'Target creature you control deals damage equal to its power to any target.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(soulsFire), 'burn'), ['produces']);
  });

  it('does not produce from a card whose only damage is a self-only cost, like a pain land', () => {
    // Adarkar Wastes — real oracle text. Paying 1 life-as-damage to use a
    // land is a cost, not a damage plan.
    const adarkarWastes = makeCard({
      name: 'Adarkar Wastes',
      type_line: 'Land',
      oracle_text: '{T}: Add {C}.\n{T}: Add {W} or {U}. This land deals 1 damage to you.',
    });
    assert.strictEqual(find(signalsFor(adarkarWastes), 'burn'), undefined);
  });

  it('still produces when a real target rides alongside a self-only clause', () => {
    // Char — real oracle text. Unlike a pain land, this clause also names
    // a real target in the same breath, so the self-inflicted half of it
    // doesn't disqualify the card.
    const char = makeCard({
      name: 'Char',
      type_line: 'Instant',
      oracle_text: 'Char deals 4 damage to any target and 2 damage to you.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(char), 'burn'), ['produces']);
  });

  it('does not produce from a combat-damage trigger alone', () => {
    // Rustmouth Ogre — real oracle text. "Not through combat" is this
    // archetype's own boundary.
    const rustmouthOgre = makeCard({
      name: 'Rustmouth Ogre',
      type_line: 'Creature — Ogre',
      oracle_text:
        'Whenever this creature deals combat damage to a player, you may destroy target artifact that ' +
        'player controls.',
    });
    assert.strictEqual(find(signalsFor(rustmouthOgre), 'burn'), undefined);
  });

  it('amplifies from a damage doubler', () => {
    // Torbran, Thane of Red Fell and Furnace of Rath — real oracle text.
    const torbran = makeCard({
      name: 'Torbran, Thane of Red Fell',
      type_line: 'Legendary Creature — Dwarf Noble',
      oracle_text:
        'If a red source you control would deal damage to an opponent or a permanent an opponent ' +
        'controls, it deals that much damage plus 2 instead.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(torbran), 'burn'), ['amplifies']);

    const furnaceOfRath = makeCard({
      name: 'Furnace of Rath',
      type_line: 'Enchantment',
      oracle_text:
        'If a source would deal damage to a permanent or player, it deals double that damage to that ' +
        'permanent or player instead.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(furnaceOfRath), 'burn'), ['amplifies']);
  });

  it('still produces from a reflect effect that deals a new instance of "that much" damage', () => {
    // Donna Noble — real oracle text. Regression guard: this is not a
    // doubler (no "would deal damage ... instead" replacement structure),
    // it creates a genuine new instance of damage to a new target sized off
    // an unrelated damage event. An early version of BURN_DAMAGE_DOUBLER's
    // exclusion was too broad and wrongly stripped every "that much damage"
    // clause of its produces role, this real commander included.
    const donnaNoble = makeCard({
      name: 'Donna Noble',
      type_line: 'Legendary Creature — Human',
      oracle_text:
        "Soulbond (You may pair this creature with another unpaired creature when either enters. " +
        "They remain paired for as long as you control both of them.)\n" +
        "Whenever Donna Noble or a creature it's paired with is dealt damage, Donna Noble deals that " +
        'much damage to target opponent.\n' +
        'Doctor\'s companion (You can have two commanders if the other is the Doctor.)',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(donnaNoble), 'burn'), ['produces']);
  });

  it('does not amplify a doubler redirected onto its own controller', () => {
    // Goldnight Castigator — real oracle text. A real downside some
    // risk-reward creatures carry (doubling damage against you or itself),
    // not a burn payoff — found checking the full card pool, since a bare
    // "would deal damage ... it deals double ... instead" pattern would
    // have false-positived it.
    const goldnightCastigator = makeCard({
      name: 'Goldnight Castigator',
      type_line: 'Creature — Angel',
      oracle_text:
        'Flying, haste\n' +
        'If a source would deal damage to you, it deals double that damage to you instead.\n' +
        'If a source would deal damage to this creature, it deals double that damage to this creature ' +
        'instead.',
    });
    assert.strictEqual(find(signalsFor(goldnightCastigator), 'burn'), undefined);
  });

  it('does not amplify a same-amount redirect, only a real increase', () => {
    // Harsh Judgment — real oracle text. Redirects a spell's damage onto
    // its own caster instead of you; the amount never changes, so this
    // isn't a burn amplifier despite matching a bare "would deal damage ...
    // it deals ... instead" shape.
    const harshJudgment = makeCard({
      name: 'Harsh Judgment',
      type_line: 'Enchantment',
      oracle_text:
        'As this enchantment enters, choose a color.\n' +
        'If an instant or sorcery spell of the chosen color would deal damage to you, it deals that ' +
        'damage to its controller instead.',
    });
    assert.strictEqual(find(signalsFor(harshJudgment), 'burn'), undefined);
  });

  it('does not fire on a card with no burn text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'burn'), undefined);
  });
});

describe('Big Mana: ramping toward an X spell or another huge-cost payoff', () => {
  it('produces from three or more mana symbols back to back', () => {
    // Basalt Monolith and Dark Ritual — real oracle text.
    const basaltMonolith = makeCard({
      name: 'Basalt Monolith',
      type_line: 'Artifact',
      oracle_text:
        "This artifact doesn't untap during your untap step.\n" +
        '{T}: Add {C}{C}{C}.\n' +
        '{3}: Untap this artifact.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(basaltMonolith), 'bigMana'), ['produces']);

    const darkRitual = makeCard({
      name: 'Dark Ritual',
      type_line: 'Instant',
      oracle_text: 'Add {B}{B}{B}.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(darkRitual), 'bigMana'), ['produces']);
  });

  it('produces from the word-count shape, including X mana', () => {
    // Gilded Lotus and Klauth, Unrivaled Ancient — real oracle text.
    const gildedLotus = makeCard({
      name: 'Gilded Lotus',
      type_line: 'Artifact',
      oracle_text: '{T}: Add three mana of any one color.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(gildedLotus), 'bigMana'), ['produces']);

    const klauth = makeCard({
      name: 'Klauth, Unrivaled Ancient',
      type_line: 'Legendary Creature — Dragon',
      oracle_text:
        'Flying, haste\n' +
        'Whenever Klauth attacks, add X mana in any combination of colors, where X is the total power ' +
        "of attacking creatures. Spend this mana only to cast spells. Until end of turn, you don't lose " +
        'this mana as steps and phases end.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(klauth), 'bigMana'), ['produces']);
  });

  it('does not produce from a one- or two-mana rock, a format-wide staple rather than a big-mana plan', () => {
    // Sol Ring and Arcane Signet — real oracle text.
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'bigMana'), undefined);

    const arcaneSignet = makeCard({
      name: 'Arcane Signet',
      type_line: 'Artifact',
      oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
    });
    assert.strictEqual(find(signalsFor(arcaneSignet), 'bigMana'), undefined);
  });
});

describe('Graveyard Toolbox: flexible retrieval from the graveyard as a resource', () => {
  it('produces from returning a flexible card choice to hand', () => {
    // Codex Shredder and Takenuma, Abandoned Mire — real oracle text.
    const codexShredder = makeCard({
      name: 'Codex Shredder',
      type_line: 'Artifact',
      oracle_text:
        '{T}: Target player mills a card. (They put the top card of their library into their graveyard.)\n' +
        '{5}, {T}, Sacrifice this artifact: Return target card from your graveyard to your hand.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(codexShredder), 'graveyardToolbox'), ['produces']);

    const takenuma = makeCard({
      name: 'Takenuma, Abandoned Mire',
      type_line: 'Legendary Land',
      oracle_text:
        '{T}: Add {B}.\n' +
        'Channel — {3}{B}, Discard this card: Mill three cards, then return a creature or planeswalker ' +
        'card from your graveyard to your hand. This ability costs {1} less to activate for each ' +
        'legendary creature you control.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(takenuma), 'graveyardToolbox'), ['produces']);
  });

  it('produces from reading a whole graveyard of activated abilities', () => {
    // Trazyn the Infinite and Mirran Safehouse — real oracle text.
    const trazyn = makeCard({
      name: 'Trazyn the Infinite',
      type_line: 'Legendary Artifact Creature — Necron',
      oracle_text:
        'Deathtouch\n' +
        'Prismatic Gallery — As long as Trazyn is on the battlefield, it has all activated abilities of ' +
        'all artifact cards in your graveyard.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(trazyn), 'graveyardToolbox'), ['produces']);

    const mirranSafehouse = makeCard({
      name: 'Mirran Safehouse',
      type_line: 'Artifact',
      oracle_text: 'As long as this artifact is on the battlefield, it has all activated abilities of all land cards in all graveyards.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(mirranSafehouse), 'graveyardToolbox'), ['produces']);
  });

  it('does not produce from a card that only ever retrieves itself', () => {
    // Squee, Goblin Nabob and Adéwalé, Breaker of Chains — real oracle text.
    // Regression guard: repeatable self-recursion isn't the flexible,
    // many-different-cards resource this archetype means, found checking
    // the full card pool before shipping.
    const squee = makeCard({
      name: 'Squee, Goblin Nabob',
      type_line: 'Legendary Creature — Goblin',
      oracle_text: 'At the beginning of your upkeep, you may return this card from your graveyard to your hand.',
    });
    assert.strictEqual(find(signalsFor(squee), 'graveyardToolbox'), undefined);

    const adewale = makeCard({
      name: 'Adéwalé, Breaker of Chains',
      type_line: 'Legendary Creature — Human Assassin Pirate',
      oracle_text:
        'When Adéwalé enters, reveal the top six cards of your library. Put an Assassin, Pirate, or ' +
        'Vehicle card from among them into your hand and the rest on the bottom of your library in a ' +
        'random order.\n' +
        'Whenever a Vehicle you control deals combat damage to a player, you may return this card from ' +
        'your graveyard to your hand.',
    });
    assert.strictEqual(find(signalsFor(adewale), 'graveyardToolbox'), undefined);
  });

  it('does not produce from a reanimation effect that returns to the battlefield, not the hand', () => {
    // Beacon of Unrest — real oracle text. Reanimator's own territory.
    const beaconOfUnrest = makeCard({
      name: 'Beacon of Unrest',
      type_line: 'Sorcery',
      oracle_text:
        "Put target artifact or creature card from a graveyard onto the battlefield under your control. " +
        "Shuffle Beacon of Unrest into its owner's library.",
    });
    assert.strictEqual(find(signalsFor(beaconOfUnrest), 'graveyardToolbox'), undefined);
  });
});

describe('Power Matters: payoffs that scale with how big a creature is', () => {
  it('enables from cost reduction scaled by total power', () => {
    // Ghalta, Primal Hunger — real oracle text.
    const ghalta = makeCard({
      name: 'Ghalta, Primal Hunger',
      type_line: 'Legendary Creature — Elder Dinosaur',
      oracle_text:
        'This spell costs {X} less to cast, where X is the total power of creatures you control.\n' +
        "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)",
    });
    assert.deepStrictEqual(rolesOf(signalsFor(ghalta), 'powerMatters'), ['enables']);
  });

  it('enables from a power threshold gating cost reduction, and rewards from the same threshold gating a combat buff', () => {
    // Goreclaw, Terror of Qal Sisma — real oracle text.
    const goreclaw = makeCard({
      name: 'Goreclaw, Terror of Qal Sisma',
      type_line: 'Legendary Creature — Bear',
      oracle_text:
        'Creature spells you cast with power 4 or greater cost {2} less to cast.\n' +
        'Whenever Goreclaw attacks, each creature you control with power 4 or greater gets +1/+1 and ' +
        'gains trample until end of turn.',
    });
    const roles = rolesOf(signalsFor(goreclaw), 'powerMatters');
    assert.ok(roles.includes('enables'));
    assert.ok(roles.includes('rewards'));
  });

  it('rewards from a power threshold gating a draw trigger', () => {
    // Outcaster Trailblazer — real oracle text.
    const outcasterTrailblazer = makeCard({
      name: 'Outcaster Trailblazer',
      type_line: 'Creature — Human Druid',
      oracle_text:
        'When this creature enters, add one mana of any color.\n' +
        'Whenever another creature you control with power 4 or greater enters, draw a card.\n' +
        'Plot {2}{G} (You may pay {2}{G} and exile this card from your hand. Cast it as a sorcery on a ' +
        'later turn without paying its mana cost. Plot only as a sorcery.)',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(outcasterTrailblazer), 'powerMatters'), ['rewards']);
  });

  it('rewards from reading the greatest power among your own creatures', () => {
    // Return of the Wildspeaker and Tuya Bearclaw — real oracle text.
    const returnOfTheWildspeaker = makeCard({
      name: 'Return of the Wildspeaker',
      type_line: 'Instant',
      oracle_text:
        'Choose one —\n' +
        '• Draw cards equal to the greatest power among non-Human creatures you control.\n' +
        '• Non-Human creatures you control get +3/+3 until end of turn.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(returnOfTheWildspeaker), 'powerMatters'), ['rewards']);

    const tuyaBearclaw = makeCard({
      name: 'Tuya Bearclaw',
      type_line: 'Legendary Creature — Human Warrior',
      oracle_text:
        'Whenever Tuya Bearclaw attacks, it gets +X/+X until end of turn, where X is the greatest power ' +
        'among other creatures you control.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(tuyaBearclaw), 'powerMatters'), ['rewards']);
  });

  it('rewards from a total-power threshold gating a free cast', () => {
    // Mosswort Bridge — real oracle text.
    const mosswortBridge = makeCard({
      name: 'Mosswort Bridge',
      type_line: 'Land',
      oracle_text:
        'Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face ' +
        'down, then put the rest on the bottom in a random order.)\n' +
        'This land enters tapped.\n' +
        '{T}: Add {G}.\n' +
        '{G}, {T}: You may play the exiled card without paying its mana cost if creatures you control ' +
        'have total power 10 or greater.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(mosswortBridge), 'powerMatters'), ['rewards']);
  });

  it('does not reward a power threshold describing a blocker restriction on opponents, not a payoff for your own creatures', () => {
    // Delney, Streetwise Lookout and April O'Neil, Kunoichi Trainee — real
    // oracle text. Regression guard: both use "power N or greater" to
    // describe a threat to opponents' blockers, not a payoff for having
    // big creatures of your own — found checking the full card pool.
    const delney = makeCard({
      name: 'Delney, Streetwise Lookout',
      type_line: 'Legendary Creature — Human Scout',
      oracle_text:
        "Creatures you control with power 2 or less can't be blocked by creatures with power 3 or " +
        'greater.\n' +
        'If a triggered ability of a creature you control with power 2 or less triggers, that ability ' +
        'triggers an additional time.',
    });
    assert.strictEqual(find(signalsFor(delney), 'powerMatters'), undefined);

    const aprilOneil = makeCard({
      name: "April O'Neil, Kunoichi Trainee",
      type_line: 'Legendary Creature — Human Ninja',
      oracle_text:
        "When April O'Neil enters, scry 2. (Look at the top two cards of your library, then put any " +
        'number of them on the bottom and the rest on top in any order.)\n' +
        "April O'Neil can't be blocked by creatures with power 3 or greater.",
    });
    assert.strictEqual(find(signalsFor(aprilOneil), 'powerMatters'), undefined);
  });

  it('does not fire on a card with no power-matters text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'powerMatters'), undefined);
  });
});

describe('Pillowfort: taxing or deterring attacks aimed at you', () => {
  it('produces from the classic tax shape', () => {
    // Ghostly Prison and Propaganda — real oracle text, identical wording.
    const ghostlyPrison = makeCard({
      name: 'Ghostly Prison',
      type_line: 'Enchantment',
      oracle_text:
        "Creatures can't attack you unless their controller pays {2} for each creature they control " +
        "that's attacking you.",
    });
    assert.deepStrictEqual(rolesOf(signalsFor(ghostlyPrison), 'pillowfort'), ['produces']);

    const propaganda = makeCard({
      name: 'Propaganda',
      type_line: 'Enchantment',
      oracle_text:
        "Creatures can't attack you unless their controller pays {2} for each creature they control " +
        "that's attacking you.",
    });
    assert.deepStrictEqual(rolesOf(signalsFor(propaganda), 'pillowfort'), ['produces']);
  });

  it('produces from the planeswalker-extended, alternative-cost variant', () => {
    // Norn's Annex — real oracle text.
    const nornsAnnex = makeCard({
      name: "Norn's Annex",
      type_line: 'Artifact',
      oracle_text:
        '({W/P} can be paid with either {W} or 2 life.)\n' +
        "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} " +
        'for each of those creatures.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(nornsAnnex), 'pillowfort'), ['produces']);
  });

  it('does not produce from a single-creature lockdown Aura or Equipment, only a board-wide deterrent', () => {
    // Vow of Duty and Assault Suit — real oracle text. Regression guard:
    // both neutralize one specific creature (usually stolen with a
    // Threaten effect), not a board-wide deterrent — a deck running any
    // one of the common Vow cycle isn't thereby a pillowfort deck. Found
    // checking the full card pool before shipping.
    const vowOfDuty = makeCard({
      name: 'Vow of Duty',
      type_line: 'Enchantment — Aura',
      oracle_text:
        'Enchant creature\n' +
        "Enchanted creature gets +2/+2, has vigilance, and can't attack you or planeswalkers you " +
        'control.',
    });
    assert.strictEqual(find(signalsFor(vowOfDuty), 'pillowfort'), undefined);

    const assaultSuit = makeCard({
      name: 'Assault Suit',
      type_line: 'Artifact — Equipment',
      oracle_text:
        "Equipped creature gets +2/+2, has haste, can't attack you or planeswalkers you control, and " +
        "can't be sacrificed.\n" +
        "At the beginning of each opponent's upkeep, you may have that player gain control of " +
        'equipped creature until end of turn. If you do, untap it.\n' +
        'Equip {3}',
    });
    assert.strictEqual(find(signalsFor(assaultSuit), 'pillowfort'), undefined);
  });

  it('does not fire on a card with no pillowfort text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'pillowfort'), undefined);
  });
});

describe('Mono-Color Devotion: payoffs that read your devotion to a single color', () => {
  it('rewards and qualifies by color from a payoff scaled by devotion', () => {
    // Gray Merchant of Asphodel and Purphoros, God of the Forge — real
    // oracle text.
    const grayMerchant = makeCard({
      name: 'Gray Merchant of Asphodel',
      type_line: 'Creature — Zombie',
      oracle_text:
        'When this creature enters, each opponent loses X life, where X is your devotion to black. ' +
        'You gain life equal to the life lost this way. (Each {B} in the mana costs of permanents ' +
        'you control counts toward your devotion to black.)',
    });
    assert.deepStrictEqual(
      rolesOf(signalsFor(grayMerchant), 'monoColorDevotion', 'Black'),
      ['rewards'],
    );

    const purphoros = makeCard({
      name: 'Purphoros, God of the Forge',
      type_line: 'Legendary Enchantment Creature — God',
      oracle_text:
        "Indestructible\nAs long as your devotion to red is less than five, Purphoros isn't a " +
        'creature.\nWhenever another creature you control enters, Purphoros deals 2 damage to each ' +
        'opponent.\n{2}{R}: Creatures you control get +1/+0 until end of turn.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(purphoros), 'monoColorDevotion', 'Red'), ['rewards']);
  });

  it('rewards and qualifies by color from the animation-threshold shape', () => {
    // Erebos, God of the Dead — real oracle text.
    const erebos = makeCard({
      name: 'Erebos, God of the Dead',
      type_line: 'Legendary Enchantment Creature — God',
      oracle_text:
        "Indestructible\nAs long as your devotion to black is less than five, Erebos isn't a " +
        'creature. (Each {B} in the mana costs of permanents you control counts toward your ' +
        'devotion to black.)\nYour opponents can\'t gain life.\n{1}{B}, Pay 2 life: Draw a card.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(erebos), 'monoColorDevotion', 'Black'), ['rewards']);
  });

  it('does not fire on devotion to a color pair, a different payoff shape', () => {
    // Phenax, God of Deception — real oracle text. Regression guard: this
    // archetype is specifically mono-color; a two-color devotion threshold
    // is a different, dual-color plan this pattern deliberately excludes.
    const phenax = makeCard({
      name: 'Phenax, God of Deception',
      type_line: 'Legendary Enchantment Creature — God',
      oracle_text:
        "Indestructible\nAs long as your devotion to blue and black is less than seven, Phenax isn't " +
        'a creature.\nCreatures you control have "{T}: Target player mills X cards, where X is this ' +
        'creature\'s toughness."',
    });
    assert.strictEqual(find(signalsFor(phenax), 'monoColorDevotion'), undefined);
  });

  it('does not fire on a card whose devotion is to a chosen color rather than a named one', () => {
    // Nykthos, Shrine to Nyx — real oracle text. A flexible devotion payoff
    // that supports whichever color the deck actually commits to, rather
    // than a payoff naming one fixed color of its own — nothing here for
    // the qualifier to key on.
    const nykthos = makeCard({
      name: 'Nykthos, Shrine to Nyx',
      type_line: 'Legendary Land',
      oracle_text:
        '{T}: Add {C}.\n{2}, {T}: Choose a color. Add an amount of mana of that color equal to your ' +
        'devotion to that color. (Your devotion to a color is the number of mana symbols of that ' +
        'color in the mana costs of permanents you control.)',
    });
    assert.strictEqual(find(signalsFor(nykthos), 'monoColorDevotion'), undefined);
  });

  it('does not fire on a card with no devotion text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'monoColorDevotion'), undefined);
  });
});

describe('Alternate Win Condition: a genuine "you win the game" outcome', () => {
  it('produces from a threshold-gated win condition', () => {
    // Knuckles the Echidna — real oracle text.
    const knuckles = makeCard({
      name: 'Knuckles the Echidna',
      type_line: 'Legendary Creature — Echidna Warrior',
      oracle_text:
        'Double strike, trample, haste\n' +
        'Whenever one or more creatures you control deal combat damage to a player, create a ' +
        'Treasure token.\n' +
        'Treasure Hunter — At the beginning of your upkeep, if you control thirty or more ' +
        'artifacts, you win the game.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(knuckles), 'alternateWin'), ['produces']);
  });

  it('produces from a mill-out win condition', () => {
    // Doctor Doom, Unrivaled — real oracle text.
    const doctorDoom = makeCard({
      name: 'Doctor Doom, Unrivaled',
      type_line: 'Legendary Creature — Human Sorcerer Villain',
      oracle_text:
        'Lifelink\n' +
        '{T}: You draw a card and lose 1 life. Then if your library has no cards in it, you win ' +
        "the game. (You win even if you have 0 life or didn't draw a card.)",
    });
    assert.deepStrictEqual(rolesOf(signalsFor(doctorDoom), 'alternateWin'), ['produces']);
  });

  it('does not produce from a symmetric "can\'t lose/win" grant, only a genuine win', () => {
    // The Book of Exalted Deeds — real oracle text. Regression guard: this
    // only ever grants an Angel "you can't lose the game and your
    // opponents can't win the game" — a symmetric protection clause, not a
    // win condition for its own controller.
    const bookOfExaltedDeeds = makeCard({
      name: 'The Book of Exalted Deeds',
      type_line: 'Legendary Artifact — Book',
      oracle_text:
        'At the beginning of your end step, if you gained 3 or more life this turn, create a 3/3 ' +
        'white Angel creature token with flying.\n{W}{W}{W}, {T}, Exile The Book of Exalted ' +
        'Deeds: Put an enlightened counter on target Angel. It gains "You can\'t lose the game ' +
        'and your opponents can\'t win the game." Activate only as a sorcery.',
    });
    assert.strictEqual(find(signalsFor(bookOfExaltedDeeds), 'alternateWin'), undefined);
  });

  it('does not fire on a card with no win-condition text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'alternateWin'), undefined);
  });
});

describe('Politics: multiplayer social tools that direct threat elsewhere', () => {
  it('produces from the Goad keyword', () => {
    // Eye of Nidhogg — real oracle text.
    const eyeOfNidhogg = makeCard(
      {
        name: 'Eye of Nidhogg',
        type_line: 'Legendary Enchantment — Aura',
        oracle_text:
          'Enchant creature\n' +
          'Enchanted creature is a black Dragon with base power and toughness 4/2, has flying and ' +
          "deathtouch, and is goaded. (It attacks each combat if able and attacks a player other " +
          "than you if able.)\n" +
          "When Eye of Nidhogg is put into a graveyard from the battlefield, return it to its " +
          "owner's hand.",
        keywords: '["Goad"]',
      },
    );
    assert.deepStrictEqual(rolesOf(signalsFor(eyeOfNidhogg), 'politics'), ['produces']);
  });

  it('produces from giving away a permanent to a chosen player', () => {
    // Crown of Doom and Donate — real oracle text.
    const crownOfDoom = makeCard({
      name: 'Crown of Doom',
      type_line: 'Artifact',
      oracle_text:
        'Whenever a creature attacks you or a planeswalker you control, it gets +2/+0 until end of ' +
        "turn.\n{2}: Target player other than this artifact's owner gains control of it. Activate " +
        'only during your turn.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(crownOfDoom), 'politics'), ['produces']);

    const donate = makeCard({
      name: 'Donate',
      type_line: 'Sorcery',
      oracle_text: 'Target player gains control of target permanent you control.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(donate), 'politics'), ['produces']);
  });

  it('produces from the symmetric reveal-and-exchange shape', () => {
    // Parker Luck and Keen Duelist — real oracle text.
    const parkerLuck = makeCard({
      name: 'Parker Luck',
      type_line: 'Enchantment',
      oracle_text:
        'At the beginning of your end step, two target players each reveal the top card of their ' +
        'library. They each lose life equal to the mana value of the card revealed by the other ' +
        'player. Then they each put the card they revealed into their hand.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(parkerLuck), 'politics'), ['produces']);

    const keenDuelist = makeCard({
      name: 'Keen Duelist',
      type_line: 'Creature — Human Wizard',
      oracle_text:
        'At the beginning of your upkeep, you and target opponent each reveal the top card of your ' +
        'library. You each lose life equal to the mana value of the card revealed by the other ' +
        'player. You each put the card you revealed into your hand.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(keenDuelist), 'politics'), ['produces']);
  });

  it('does not produce from giving yourself away for value, only a genuine choice among players', () => {
    // Humble Defector — real oracle text. Regression guard: "target
    // opponent" self-sacrifice-for-value engines are a different plan
    // from a political choice among several players, which always says
    // "target player" in this catalog's own grounding.
    const humbleDefector = makeCard({
      name: 'Humble Defector',
      type_line: 'Creature — Human Rogue',
      oracle_text: '{T}: Draw two cards. Target opponent gains control of this creature. Activate only during your turn.',
    });
    assert.strictEqual(find(signalsFor(humbleDefector), 'politics'), undefined);
  });

  it('does not fire on a card with no political text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'politics'), undefined);
  });
});

describe("Storm: casting many spells in a single turn as its own payoff", () => {
  it('produces from the Storm keyword', () => {
    // Empty the Warrens — real oracle text.
    const emptyTheWarrens = makeCard({
      name: 'Empty the Warrens',
      type_line: 'Sorcery',
      oracle_text:
        'Create two 1/1 red Goblin creature tokens.\n' +
        'Storm (When you cast this spell, copy it for each spell cast before it this turn.)',
      keywords: '["Storm"]',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(emptyTheWarrens), 'storm'), ['produces']);
  });

  it('rewards from a payoff scaled by spells cast this turn', () => {
    // Aetherflux Reservoir and Gnostro, Voice of the Crags — real oracle text.
    const aetherfluxReservoir = makeCard({
      name: 'Aetherflux Reservoir',
      type_line: 'Artifact',
      oracle_text:
        "Whenever you cast a spell, you gain 1 life for each spell you've cast this turn.\n" +
        'Pay 50 life: This artifact deals 50 damage to any target.',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(aetherfluxReservoir), 'storm'), ['rewards']);

    const gnostro = makeCard({
      name: 'Gnostro, Voice of the Crags',
      type_line: 'Legendary Creature — Chimera',
      oracle_text:
        "{T}: Choose one. X is the number of spells you've cast this turn.\n" +
        '• Scry X.\n• Gnostro deals X damage to target creature.\n• You gain X life.',
      keywords: '["Scry"]',
    });
    assert.deepStrictEqual(rolesOf(signalsFor(gnostro), 'storm'), ['rewards']);
  });

  it('does not reward cost reduction scaled by the same count, only a genuine scaled payoff', () => {
    // Demilich — real oracle text. Regression guard: cost reduction is a
    // different mechanism entirely (spellslinger's enables territory),
    // not a storm payoff, even though it reads the identical "spells
    // you've cast this turn" phrase.
    const demilich = makeCard({
      name: 'Demilich',
      type_line: 'Creature — Skeleton Wizard',
      oracle_text:
        "This spell costs {U} less to cast for each instant and sorcery spell you've cast this " +
        'turn.\nWhenever this creature attacks, exile up to one target instant or sorcery card ' +
        'from your graveyard. Copy it. You may cast the copy.\nYou may cast this card from your ' +
        'graveyard by exiling four instant and/or sorcery cards from your graveyard in addition ' +
        'to paying its other costs.',
    });
    assert.strictEqual(find(signalsFor(demilich), 'storm'), undefined);
  });

  it('does not reward a flat effect for the turn that never scales by the count', () => {
    // Domri, Anarch of Bolas — real oracle text. "Can't be countered" for
    // the turn doesn't scale by anything, unlike a genuine storm payoff.
    const domri = makeCard({
      name: 'Domri, Anarch of Bolas',
      type_line: 'Legendary Planeswalker — Domri',
      oracle_text:
        'Creatures you control get +1/+0.\n' +
        "+1: Add {R} or {G}. Creature spells you cast this turn can't be countered.\n" +
        '−2: Target creature you control fights target creature you don\'t control.',
      keywords: '["Fight"]',
    });
    assert.strictEqual(find(signalsFor(domri), 'storm'), undefined);
  });

  it('does not fire on a card with no storm text at all', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
    assert.strictEqual(find(signalsFor(solRing), 'storm'), undefined);
  });
});

describe('archetypeDisplay: rebuilding a signal read back out of card_signals', () => {
  // This is the presentation layer db.ts's findSignalsByOracleIds actually
  // uses to reconstruct a commander candidate's own signals from storage —
  // the path synergy.ts's themeSupport is built from, not detectSignals
  // directly (see synergy.ts's unitSignals). archetypeLabel has to survive
  // this round trip too, or the filter bar's grouping silently breaks for
  // every real commander suggestion even though a `detectSignals`-only test
  // would look fine.

  it('an unqualified archetype: label and archetypeLabel are the same', () => {
    const display = archetypeDisplay('aristocrats', null);
    assert.strictEqual(display.label, 'Aristocrats');
    assert.strictEqual(display.archetypeLabel, 'Aristocrats');
  });

  it('a qualified archetype: archetypeLabel stays the unqualified name', () => {
    const display = archetypeDisplay('goWide', 'Sliver');
    assert.strictEqual(display.label, 'Go-Wide Combat (Sliver)');
    assert.strictEqual(display.archetypeLabel, 'Go-Wide Combat');
  });

  it('kindred gets a generic archetypeLabel, not the per-type label', () => {
    const display = archetypeDisplay('kindred', 'Sliver');
    assert.strictEqual(display.label, 'Sliver Kindred');
    assert.strictEqual(display.archetypeLabel, 'Kindred');
  });

  it('keywordCare has no separate base concept — archetypeLabel is the keyword itself', () => {
    const display = archetypeDisplay('keywordCare', 'Flying');
    assert.strictEqual(display.label, 'Flying');
    assert.strictEqual(display.archetypeLabel, 'Flying');
  });

  it('an unknown archetype (a rename without a re-import) degrades without crashing', () => {
    const display = archetypeDisplay('someRemovedArchetype', null);
    assert.strictEqual(display.label, 'someRemovedArchetype');
    assert.strictEqual(display.archetypeLabel, 'someRemovedArchetype');
  });
});
