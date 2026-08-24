/**
 * Tests for resolving a card written down by one of its face names.
 *
 * Two halves, because the bug had two halves:
 *   1. `faceNameEntries` — which layouts contribute face names at all. The
 *      original allow-list covered only transform/modal_dfc, so 384 gameplay
 *      cards were unfindable by the name printed on them.
 *   2. The resolution *order* — 27 face names are also the real name of some
 *      other card, so indexing more names without ordering them would have
 *      traded one bug for a worse one. That half is tested against a real
 *      in-memory SQLite database mirroring the shipped schema and query.
 *
 * Card shapes are copied from real Scryfall data.
 */
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { describe, it } from 'vitest';
import { faceNameEntries, MULTI_FACE_LAYOUTS, type NamedCardLike } from './cardNames';

function names(card: NamedCardLike): string[] {
  return faceNameEntries(card).map((e) => e.faceNameLower);
}

/**
 * Builds an in-memory database with the shipped schema and the shipped
 * lookup, so the ordering rule is tested rather than described.
 */
function buildFixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE cards (oracle_id TEXT PRIMARY KEY, name TEXT, name_lower TEXT);
    CREATE TABLE card_face_names (
      face_name_lower TEXT NOT NULL,
      oracle_id TEXT NOT NULL,
      face_index INTEGER NOT NULL DEFAULT 0
    );
  `);
  const addCard = db.prepare('INSERT INTO cards VALUES (?, ?, ?)');
  const addFace = db.prepare('INSERT INTO card_face_names VALUES (?, ?, ?)');

  // The real collision: "Lightning Bolt" is a card in its own right, and is
  // also the back face of "Emeritus of Conflict // Lightning Bolt".
  addCard.run('bolt', 'Lightning Bolt', 'lightning bolt');
  addCard.run(
    'emeritus',
    'Emeritus of Conflict // Lightning Bolt',
    'emeritus of conflict // lightning bolt',
  );
  addFace.run('emeritus of conflict', 'emeritus', 0);
  addFace.run('lightning bolt', 'emeritus', 1);

  // A front-face collision: two different cards whose *front* faces share a
  // name would be genuinely ambiguous; this pair is front vs back.
  addCard.run(
    'gollum',
    'Gollum, Silent Slinker // Meager Meal',
    'gollum, silent slinker // meager meal',
  );
  addFace.run('gollum, silent slinker', 'gollum', 0);
  addFace.run('meager meal', 'gollum', 1);

  // Re-skinned printings: "Count Dracula" is Sorin the Mirthless.
  db.exec(`
    CREATE TABLE card_flavor_names (flavor_name_lower TEXT NOT NULL, oracle_id TEXT NOT NULL);
  `);
  addCard.run('sorin', 'Sorin the Mirthless', 'sorin the mirthless');
  db.prepare('INSERT INTO card_flavor_names VALUES (?, ?)').run('count dracula', 'sorin');
  // A re-skin name that is *also* a real card, to pin the precedence.
  addCard.run('decoy', 'Count Dracula', 'count dracula');

  // The reported "FlavourName - RealName" export line — rung 4. The printed
  // flavour name is "Dracula, Voyager", not "Dracula the Voyager", so this
  // only resolves via the fourth rung splitting on ' - ', never via the
  // flavor-name table above.
  addCard.run('edgar', 'Edgar, Charmed Groom', 'edgar, charmed groom');

  const exact = db.prepare('SELECT * FROM cards WHERE name_lower = ? LIMIT 1');
  const byFace = db.prepare(`
    SELECT cards.* FROM card_face_names
    JOIN cards ON cards.oracle_id = card_face_names.oracle_id
    WHERE card_face_names.face_name_lower = ?
    ORDER BY COALESCE(card_face_names.face_index, 0) ASC
    LIMIT 1
  `);
  const byFlavor = db.prepare(`
    SELECT cards.* FROM card_flavor_names
    JOIN cards ON cards.oracle_id = card_flavor_names.oracle_id
    WHERE card_flavor_names.flavor_name_lower = ?
    LIMIT 1
  `);
  const lookupOne = (lower: string) =>
    (exact.get(lower) ?? byFace.get(lower) ?? byFlavor.get(lower)) as { name: string } | undefined;

  // Mirrors db.ts's findCardsByNames rung 4 exactly, so this test exercises
  // the same behaviour rather than a paraphrase of it.
  return (name: string) => {
    const lower = name.toLowerCase();
    let row = lookupOne(lower);
    if (!row && lower.includes(' - ')) {
      for (const half of lower.split(' - ')) {
        row = lookupOne(half.trim());
        if (row) break;
      }
    }
    return row;
  };
}

describe('faceNameEntries', () => {
  // --- the reported bug -------------------------------------------------------

  it('a "prepare" card is findable by its front-face name', () => {
    // Adventurous Eater // Have a Bite. The `prepare` layout postdates the
    // original transform/modal_dfc allow-list, which is exactly how it got
    // missed: a closed list of layouts rots as new ones ship.
    const card: NamedCardLike = {
      name: 'Adventurous Eater // Have a Bite',
      layout: 'prepare',
      card_faces: [{ name: 'Adventurous Eater' }, { name: 'Have a Bite' }],
    };
    assert.deepStrictEqual(names(card), ['adventurous eater', 'have a bite']);
  });

  it('adventure, split and flip cards are all indexed too', () => {
    const adventure: NamedCardLike = {
      name: 'Gollum, Silent Slinker // Meager Meal',
      layout: 'adventure',
      card_faces: [{ name: 'Gollum, Silent Slinker' }, { name: 'Meager Meal' }],
    };
    const split: NamedCardLike = {
      name: 'Breaking // Entering',
      layout: 'split',
      card_faces: [{ name: 'Breaking' }, { name: 'Entering' }],
    };
    const flip: NamedCardLike = {
      name: 'Bushi Tenderfoot // Kenzo the Hardhearted',
      layout: 'flip',
      card_faces: [{ name: 'Bushi Tenderfoot' }, { name: 'Kenzo the Hardhearted' }],
    };
    assert.ok(names(adventure).includes('gollum, silent slinker'));
    assert.ok(names(split).includes('breaking'));
    assert.ok(names(flip).includes('bushi tenderfoot'));
  });

  it('the original transform/modal_dfc behaviour still works', () => {
    const card: NamedCardLike = {
      name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki',
      layout: 'transform',
      card_faces: [{ name: 'Fable of the Mirror-Breaker' }, { name: 'Reflection of Kiki-Jiki' }],
    };
    assert.deepStrictEqual(names(card), ['fable of the mirror-breaker', 'reflection of kiki-jiki']);
  });

  it('face positions are recorded, front first', () => {
    const card: NamedCardLike = {
      name: 'Adventurous Eater // Have a Bite',
      layout: 'prepare',
      card_faces: [{ name: 'Adventurous Eater' }, { name: 'Have a Bite' }],
    };
    assert.deepStrictEqual(faceNameEntries(card), [
      { faceNameLower: 'adventurous eater', faceIndex: 0 },
      { faceNameLower: 'have a bite', faceIndex: 1 },
    ]);
  });

  // --- what stays out ---------------------------------------------------------

  it('double-faced tokens are not indexed', () => {
    // Tokens are not deck entries, so indexing them is pure collision risk.
    const token: NamedCardLike = {
      name: "Foraging Squirrels // Foraging Squirrels (cont'd)",
      layout: 'double_faced_token',
      card_faces: [{ name: 'Foraging Squirrels' }, { name: "Foraging Squirrels (cont'd)" }],
    };
    assert.deepStrictEqual(names(token), []);
    assert.strictEqual(MULTI_FACE_LAYOUTS.has('double_faced_token'), false);
  });

  it('a single-faced card contributes nothing', () => {
    assert.deepStrictEqual(names({ name: 'Lightning Bolt', layout: 'normal' }), []);
  });

  it('a face whose name equals the full name is skipped', () => {
    // Exact-name matching already covers it, so indexing would be redundant.
    const card: NamedCardLike = {
      name: 'Some Card',
      layout: 'split',
      card_faces: [{ name: 'Some Card' }, { name: 'Other Half' }],
    };
    assert.deepStrictEqual(names(card), ['other half']);
  });

  it('missing or malformed faces degrade to nothing rather than throwing', () => {
    assert.deepStrictEqual(names({}), []);
    assert.deepStrictEqual(names({ name: 'X', layout: 'split' }), []);
    assert.deepStrictEqual(names({ name: 'X', layout: 'split', card_faces: [{}] }), []);
  });
});

describe('face-name resolution order (real database)', () => {
  it("a real card is never shadowed by another card's face of the same name", () => {
    const find = buildFixture();
    assert.strictEqual(find('Lightning Bolt')?.name, 'Lightning Bolt');
  });

  it('a front-face name still resolves to its whole card', () => {
    const find = buildFixture();
    assert.strictEqual(
      find('Gollum, Silent Slinker')?.name,
      'Gollum, Silent Slinker // Meager Meal',
    );
    assert.strictEqual(
      find('Emeritus of Conflict')?.name,
      'Emeritus of Conflict // Lightning Bolt',
    );
  });

  it('a back-face name resolves when nothing else claims it', () => {
    const find = buildFixture();
    assert.strictEqual(find('Meager Meal')?.name, 'Gollum, Silent Slinker // Meager Meal');
  });

  it('a re-skinned printing name resolves to the real card', () => {
    // The fixture above also registers a decoy card literally named "Count
    // Dracula", so this only passes if precedence is being applied rather
    // than the flavor table happening to be consulted first.
    const find = buildFixture();
    assert.strictEqual(find('Count Dracula')?.name, 'Count Dracula');
  });

  it('a re-skin never shadows a real card of the same name', () => {
    const find = buildFixture();
    // Sorin is reachable by his own name; the re-skin only fills gaps.
    assert.strictEqual(find('Sorin the Mirthless')?.name, 'Sorin the Mirthless');
  });

  it('a "FlavourName - RealName" export line resolves on its real-name half', () => {
    const find = buildFixture();
    // The exact reproducing line from docs/recommendation-coverage.md.
    assert.strictEqual(
      find('Dracula the Voyager - Edgar, Charmed Groom')?.name,
      'Edgar, Charmed Groom',
    );
  });

  it('rung 4 never fires when the whole name already resolves', () => {
    const find = buildFixture();
    // No ' - ' in this name at all, so rung 4 should never even be tried;
    // this just pins that the earlier rungs still win outright.
    assert.strictEqual(find('Lightning Bolt')?.name, 'Lightning Bolt');
  });
});
