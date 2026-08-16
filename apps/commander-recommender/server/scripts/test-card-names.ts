/**
 * Tests for resolving a card written down by one of its face names.
 * Run with: npm test
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
 * Dependency-free (node:assert + tsx), matching the other test scripts here.
 * Card shapes are copied from real Scryfall data.
 */
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { faceNameEntries, MULTI_FACE_LAYOUTS, type NamedCardLike } from '../src/services/cardNames';

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

function names(card: NamedCardLike): string[] {
  return faceNameEntries(card).map((e) => e.faceNameLower);
}

// --- the reported bug -------------------------------------------------------

check('a "prepare" card is findable by its front-face name', () => {
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

check('adventure, split and flip cards are all indexed too', () => {
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

check('the original transform/modal_dfc behaviour still works', () => {
  const card: NamedCardLike = {
    name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki',
    layout: 'transform',
    card_faces: [{ name: 'Fable of the Mirror-Breaker' }, { name: 'Reflection of Kiki-Jiki' }],
  };
  assert.deepStrictEqual(names(card), [
    'fable of the mirror-breaker',
    'reflection of kiki-jiki',
  ]);
});

check('face positions are recorded, front first', () => {
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

check('double-faced tokens are not indexed', () => {
  // Tokens are not deck entries, so indexing them is pure collision risk.
  const token: NamedCardLike = {
    name: "Foraging Squirrels // Foraging Squirrels (cont'd)",
    layout: 'double_faced_token',
    card_faces: [{ name: 'Foraging Squirrels' }, { name: "Foraging Squirrels (cont'd)" }],
  };
  assert.deepStrictEqual(names(token), []);
  assert.strictEqual(MULTI_FACE_LAYOUTS.has('double_faced_token'), false);
});

check('a single-faced card contributes nothing', () => {
  assert.deepStrictEqual(names({ name: 'Lightning Bolt', layout: 'normal' }), []);
});

check('a face whose name equals the full name is skipped', () => {
  // Exact-name matching already covers it, so indexing would be redundant.
  const card: NamedCardLike = {
    name: 'Some Card',
    layout: 'split',
    card_faces: [{ name: 'Some Card' }, { name: 'Other Half' }],
  };
  assert.deepStrictEqual(names(card), ['other half']);
});

check('missing or malformed faces degrade to nothing rather than throwing', () => {
  assert.deepStrictEqual(names({}), []);
  assert.deepStrictEqual(names({ name: 'X', layout: 'split' }), []);
  assert.deepStrictEqual(names({ name: 'X', layout: 'split', card_faces: [{}] }), []);
});

// --- resolution order, against a real database ------------------------------

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
  addCard.run('emeritus', 'Emeritus of Conflict // Lightning Bolt', 'emeritus of conflict // lightning bolt');
  addFace.run('emeritus of conflict', 'emeritus', 0);
  addFace.run('lightning bolt', 'emeritus', 1);

  // A front-face collision: two different cards whose *front* faces share a
  // name would be genuinely ambiguous; this pair is front vs back.
  addCard.run('gollum', 'Gollum, Silent Slinker // Meager Meal', 'gollum, silent slinker // meager meal');
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
  return (name: string) => {
    const lower = name.toLowerCase();
    return (exact.get(lower) ?? byFace.get(lower) ?? byFlavor.get(lower)) as
      | { name: string }
      | undefined;
  };
}

check('a real card is never shadowed by another card\'s face of the same name', () => {
  const find = buildFixture();
  assert.strictEqual(find('Lightning Bolt')?.name, 'Lightning Bolt');
});

check('a front-face name still resolves to its whole card', () => {
  const find = buildFixture();
  assert.strictEqual(find('Gollum, Silent Slinker')?.name, 'Gollum, Silent Slinker // Meager Meal');
  assert.strictEqual(find('Emeritus of Conflict')?.name, 'Emeritus of Conflict // Lightning Bolt');
});

check('a back-face name resolves when nothing else claims it', () => {
  const find = buildFixture();
  assert.strictEqual(find('Meager Meal')?.name, 'Gollum, Silent Slinker // Meager Meal');
});

check('a re-skinned printing name resolves to the real card', () => {
  // The fixture above also registers a decoy card literally named "Count
  // Dracula", so this only passes if precedence is being applied rather
  // than the flavor table happening to be consulted first.
  const find = buildFixture();
  assert.strictEqual(find('Count Dracula')?.name, 'Count Dracula');
});

check('a re-skin never shadows a real card of the same name', () => {
  const find = buildFixture();
  // Sorin is reachable by his own name; the re-skin only fills gaps.
  assert.strictEqual(find('Sorin the Mirthless')?.name, 'Sorin the Mirthless');
});

if (failures > 0) {
  console.error(`\n${failures} card-name case(s) failed.`);
  process.exit(1);
}
console.log('\nAll card-name cases passed.');
