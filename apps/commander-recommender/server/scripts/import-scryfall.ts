import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { frontFaceCharacteristics, isCommanderEligible } from '../src/services/eligibility';
import { faceNameEntries } from '../src/services/cardNames';
import {
  buildCardFacts,
  buildVocabulary,
  detectSignals,
  parseCreatureTypes,
} from '../src/services/signals';
import type { CardRow } from '../src/types';
import { IMPORT_VERSION, readSidecar } from '../src/services/dataSnapshot';
import { readImportedSnapshot, writeImportedSnapshot } from '../src/services/importedSnapshot';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'cards.sqlite');
const DEFAULT_INPUT = path.join(DATA_DIR, 'oracle-cards.jsonl');

// Scryfall's creature-type catalog, from the companion file fetch-scryfall.ts
// writes. Absent when the fetch predates it — parseCreatureTypes then falls
// back to type-line structure alone, which is looser but not wrong. See its
// doc comment for why the catalog is needed at all.
const CREATURE_TYPES_PATH = path.join(DATA_DIR, 'creature-types.json');
const knownCreatureTypes = fs.existsSync(CREATURE_TYPES_PATH)
  ? new Set(JSON.parse(fs.readFileSync(CREATURE_TYPES_PATH, 'utf-8')) as string[])
  : undefined;

// Flags are filtered out before looking for the optional input path —
// otherwise `import-scryfall --force` reads "--force" as the filename and
// fails with a baffling "could not find /path/to/--force".
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const inputPath = positionalArgs[0] ? path.resolve(positionalArgs[0]) : DEFAULT_INPUT;

if (!fs.existsSync(inputPath)) {
  console.error(`\nCould not find a Scryfall bulk data file at:\n  ${inputPath}\n`);
  console.error('To fetch it:');
  console.error('  1. Run: npm run fetch-scryfall');
  console.error('     (or download "Oracle Cards" by hand from');
  console.error('      https://scryfall.com/docs/api/bulk-data, gunzip it,');
  console.error(`      and save it as: ${DEFAULT_INPUT})`);
  console.error('     (or pass a custom path: npm run import-scryfall -- /path/to/file.jsonl)\n');
  process.exit(1);
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Can this import be skipped entirely?
//
// Two things must both match: the data (which snapshot the database was
// built from) and the code (IMPORT_VERSION). Checking only the data would
// mean editing an import rule, re-running, and silently keeping the old
// database — a change that looks applied and isn't.
const forceImport = process.argv.includes('--force');
const diskSnapshot = readSidecar(inputPath);

if (!forceImport && diskSnapshot && fs.existsSync(DB_PATH)) {
  const existing = readImportedSnapshot(DB_PATH);
  if (
    existing &&
    existing.updatedAt === diskSnapshot.updatedAt &&
    existing.importVersion === IMPORT_VERSION
  ) {
    console.log(
      `Database is already built from this snapshot (published ${existing.updatedAt}, ` +
        `import v${existing.importVersion}). Nothing to do.\n` +
        'Pass --force to rebuild it anyway.'
    );
    process.exit(0);
  }
}

console.log(`Reading ${inputPath} ...`);
const raw = fs.readFileSync(inputPath, 'utf-8');

// Newline-delimited JSON, one card per line — Scryfall's bulk export is no
// longer a single JSON array. Tolerates a leading "[" / trailing "]" line so
// an older hand-downloaded array file still imports rather than dying on
// line 1.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cards: any[] = [];
let lineNumber = 0;
for (const line of raw.split('\n')) {
  lineNumber++;
  const trimmed = line.trim().replace(/,$/, '');
  if (!trimmed || trimmed === '[' || trimmed === ']') continue;
  try {
    cards.push(JSON.parse(trimmed));
  } catch {
    throw new Error(
      `Could not parse line ${lineNumber} of ${inputPath} as JSON. Expected newline-delimited JSON ` +
        `(one card object per line). Line began: ${trimmed.slice(0, 80)}`
    );
  }
}
if (cards.length === 0) {
  throw new Error(`${inputPath} contained no card entries.`);
}
console.log(`Parsed ${cards.length} card entries.`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  DROP TABLE IF EXISTS cards;
  CREATE TABLE cards (
    oracle_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_lower TEXT NOT NULL,
    mana_cost TEXT,
    cmc REAL,
    type_line TEXT,
    oracle_text TEXT,
    colors TEXT,
    color_identity TEXT,
    keywords TEXT,
    creature_types TEXT,
    power TEXT,
    toughness TEXT,
    scryfall_uri TEXT,
    legality_commander TEXT,
    game_changer INTEGER DEFAULT 0,
    is_legendary INTEGER DEFAULT 0,
    is_commander_eligible INTEGER DEFAULT 0,
    -- Partner-family ability (rule 702.124): one of 'partner', 'partner_with',
    -- 'partner_suffix', 'friends_forever', 'choose_background',
    -- 'doctors_companion', or NULL. partner_target holds the "partner with
    -- [Name]" target name, or the "Partner—[text]" suffix, lowercased;
    -- NULL for the other variants.
    partner_ability TEXT,
    partner_target TEXT,
    -- A legendary Background enchantment (702.124m). Never itself a
    -- solo/is_commander_eligible candidate — it only becomes a commander
    -- paired with a "choose a Background" card.
    is_background INTEGER DEFAULT 0,
    image_uri TEXT,
    -- Second face of a true two-sided card (transform/modal_dfc), so the art
    -- preview can offer a flip. NULL for everything else.
    back_image_uri TEXT,
    back_name TEXT
  );
  CREATE INDEX idx_cards_name_lower ON cards(name_lower);
  CREATE INDEX idx_cards_commander_eligible ON cards(is_commander_eligible);
  CREATE INDEX idx_cards_partner_ability ON cards(partner_ability);
  CREATE INDEX idx_cards_is_background ON cards(is_background);

  -- Lets a multi-part card be found by one face's name alone, which is how
  -- people actually write them down: "Adventurous Eater", not "Adventurous
  -- Eater // Have a Bite".
  --
  -- This used to be scoped to transform/modal_dfc only, on the reasoning
  -- that split/adventure/flip cards share a single physical face and were
  -- "a different case". That distinction is real for rules purposes and
  -- irrelevant here — what matters is whether the stored name contains a
  -- "//" the user won't type. It does, so 384 gameplay cards across four
  -- layouts were unfindable by the name on the card: adventure (166),
  -- split (137), prepare (55), flip (26).
  --
  -- face_index is the face's position on the card. It exists to break ties:
  -- 27 face names are also the real name of some *other* card ("Lightning
  -- Bolt" is a card, and the back face of "Emeritus of Conflict //
  -- Lightning Bolt"). Exact full-name matching already wins over this table
  -- entirely (see findCardsByNames), and within it a front face outranks a
  -- back face, so the standalone card is always what you get.
  DROP TABLE IF EXISTS card_face_names;
  CREATE TABLE card_face_names (
    face_name_lower TEXT NOT NULL,
    oracle_id TEXT NOT NULL,
    face_index INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_face_names_lower ON card_face_names(face_name_lower);

  -- Names a card carries on a re-skinned printing: "Dracula, Voyager" is
  -- Edgar, Charmed Groom. These live on the printing rather than the oracle
  -- entry, so the Oracle Cards bulk file doesn't contain them at all and a
  -- list naming the re-skin resolved to nothing. Populated from the
  -- companion file written by fetch-scryfall.ts.
  DROP TABLE IF EXISTS card_flavor_names;
  CREATE TABLE card_flavor_names (
    flavor_name_lower TEXT NOT NULL,
    oracle_id TEXT NOT NULL
  );
  CREATE INDEX idx_flavor_names_lower ON card_flavor_names(flavor_name_lower);

  -- Every archetype each card participates in, and in what capacity. This is
  -- the shared relationship layer: precomputed once here so that anything
  -- wanting to reason about cards -- the commander scorer, deck-theme
  -- summaries, "what's missing from this package" -- queries the same rows
  -- rather than each re-deriving them.
  --
  -- Computing it at import also makes it *more* correct, not just faster.
  -- Detecting at request time could only ever look for the vocabulary present
  -- in the submitted list; here every creature type and keyword in the game is
  -- in scope, so a card's relationships are a property of the card rather than
  -- of whatever someone happened to paste.
  DROP TABLE IF EXISTS card_signals;
  CREATE TABLE card_signals (
    oracle_id TEXT NOT NULL,
    archetype TEXT NOT NULL,
    -- Set for kindred and keyword-care, which exist once per creature type or
    -- keyword, and for subtype-restricted payoffs like Reanimator (Sliver).
    qualifier TEXT,
    qualifier_kind TEXT,
    -- JSON array of roles: is / produces / consumes / rewards / amplifies.
    roles TEXT NOT NULL
  );
  CREATE INDEX idx_card_signals_oracle ON card_signals(oracle_id);
  CREATE INDEX idx_card_signals_archetype ON card_signals(archetype, qualifier);
`);

interface PartnerInfo {
  ability: string | null;
  target: string | null;
}

/** Strips a trailing reminder-text parenthetical and punctuation, lowercases. */
function cleanTarget(raw: string): string {
  return raw
    .replace(/\(.*$/, '')
    .replace(/[.\s]+$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Detects which Partner-family ability (702.124) a card has, from its own
 * oracle text — Scryfall's structured `keywords` field flags some of these,
 * but never the target name in "Partner with [Name]" or the suffix in
 * "Partner—[text]", both of which only exist in the prose. Parsing text
 * for all six keeps one consistent source of truth instead of two.
 *
 * Checked most-specific-first: "Partner with X" and "Partner—X" both
 * contain the substring "partner", so plain Partner is only recognised
 * once every more specific variant has been ruled out.
 */
function detectPartnerAbility(oracleText: string): PartnerInfo {
  if (/doctor.s companion/i.test(oracleText)) return { ability: 'doctors_companion', target: null };
  if (/choose a background/i.test(oracleText)) return { ability: 'choose_background', target: null };
  if (/friends forever/i.test(oracleText)) return { ability: 'friends_forever', target: null };

  const partnerWith = oracleText.match(/partner with ([^(\n]+)/i);
  if (partnerWith) return { ability: 'partner_with', target: cleanTarget(partnerWith[1]) };

  const partnerSuffix = oracleText.match(/partner[—–-]\s*([^(\n]+)/i);
  if (partnerSuffix) return { ability: 'partner_suffix', target: cleanTarget(partnerSuffix[1]) };

  if (/\bpartner\b/i.test(oracleText)) return { ability: 'partner', target: null };

  return { ability: null, target: null };
}

const insert = db.prepare(`
  INSERT OR REPLACE INTO cards (
    oracle_id, name, name_lower, mana_cost, cmc, type_line, oracle_text,
    colors, color_identity, keywords, creature_types,
    power, toughness, scryfall_uri,
    legality_commander, game_changer, is_legendary, is_commander_eligible,
    partner_ability, partner_target, is_background, image_uri,
    back_image_uri, back_name
  ) VALUES (
    @oracle_id, @name, @name_lower, @mana_cost, @cmc, @type_line, @oracle_text,
    @colors, @color_identity, @keywords, @creature_types,
    @power, @toughness, @scryfall_uri,
    @legality_commander, @game_changer, @is_legendary, @is_commander_eligible,
    @partner_ability, @partner_target, @is_background, @image_uri,
    @back_image_uri, @back_name
  )
`);

const insertFaceName = db.prepare(`
  INSERT INTO card_face_names (face_name_lower, oracle_id, face_index) VALUES (?, ?, ?)
`);

/** Layouts that are genuinely two-sided, so there's a second image to flip to
 * and a distinct back-face name to show. Split, adventure, prepare and flip
 * cards all print on one physical face — their "second face" is the same
 * picture — so they are deliberately not here. Which layouts get *name*
 * indexing is a wider and separate question; see services/cardNames.ts. */
const DFC_LAYOUTS = new Set(['transform', 'modal_dfc']);

let imported = 0;
let skipped = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const insertMany = db.transaction((rows: any[]) => {
  for (const card of rows) {
    // Skip non-gameplay objects (art cards, memorabilia) that clutter the dataset.
    if (card.layout === 'art_series' || card.set_type === 'memorabilia' || !card.oracle_id) {
      skipped++;
      continue;
    }

    const typeLine: string = card.type_line ?? card.card_faces?.[0]?.type_line ?? '';
    const oracleText: string =
      card.oracle_text ??
      (card.card_faces ?? [])
        .map((f: { oracle_text?: string }) => f.oracle_text)
        .filter(Boolean)
        .join('\n');
    const imageUri: string | null =
      card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null;
    // Only a genuinely two-sided card has a second image to flip to. Split,
    // adventure and flip cards all print on one physical face, so their
    // "second face" is the same picture.
    const backImageUri: string | null = DFC_LAYOUTS.has(card.layout)
      ? card.card_faces?.[1]?.image_uris?.normal ?? null
      : null;
    const backName: string | null = DFC_LAYOUTS.has(card.layout) ? card.card_faces?.[1]?.name ?? null : null;

    // Eligibility reads the front face only — see services/eligibility.ts.
    // Westvale Abbey's joined type_line ("Land // Legendary Creature —
    // Demon") satisfied a naive Legendary+Creature check off its *back*,
    // making a non-legendary land look like a legal commander.
    const front = frontFaceCharacteristics(card);
    const isLegendary = front.typeLine.includes('Legendary') ? 1 : 0;
    const commanderEligible = isCommanderEligible(card) ? 1 : 0;

    const { ability: partnerAbility, target: partnerTarget } = detectPartnerAbility(oracleText);
    const isBackground = front.typeLine.includes('Background') ? 1 : 0;

    insert.run({
      oracle_id: card.oracle_id,
      name: card.name,
      name_lower: String(card.name).toLowerCase(),
      mana_cost: card.mana_cost ?? null,
      cmc: card.cmc ?? null,
      type_line: typeLine,
      oracle_text: oracleText,
      colors: JSON.stringify(card.colors ?? card.card_faces?.[0]?.colors ?? []),
      color_identity: JSON.stringify(card.color_identity ?? []),
      keywords: JSON.stringify(card.keywords ?? []),
      // Front face too: a card in your library or hand is its front face, so
      // Delver of Secrets counts toward Wizards, not toward the Insect its
      // battlefield-only back side becomes.
      creature_types: JSON.stringify(parseCreatureTypes(front.typeLine, knownCreatureTypes)),
      // Kept so the card-detail dialog can show what a printed card shows,
      // and link out to the real page rather than reimplementing it.
      power: card.power ?? card.card_faces?.[0]?.power ?? null,
      toughness: card.toughness ?? card.card_faces?.[0]?.toughness ?? null,
      scryfall_uri: card.scryfall_uri ?? null,
      legality_commander: card.legalities?.commander ?? 'not_legal',
      game_changer: card.game_changer ? 1 : 0,
      is_legendary: isLegendary,
      is_commander_eligible: commanderEligible,
      partner_ability: partnerAbility,
      partner_target: partnerTarget,
      is_background: isBackground,
      image_uri: imageUri,
      back_image_uri: backImageUri,
      back_name: backName,
    });
    imported++;

    for (const { faceNameLower, faceIndex } of faceNameEntries(card)) {
      insertFaceName.run(faceNameLower, card.oracle_id, faceIndex);
    }
  }
});

insertMany(cards);

console.log(`\nImported ${imported} cards (skipped ${skipped} non-gameplay entries).`);
const eligible = db
  .prepare('SELECT COUNT(*) as c FROM cards WHERE is_commander_eligible = 1')
  .get() as { c: number };
const banned = db
  .prepare(`SELECT COUNT(*) as c FROM cards WHERE legality_commander = 'banned'`)
  .get() as { c: number };
const gameChangers = db
  .prepare('SELECT COUNT(*) as c FROM cards WHERE game_changer = 1')
  .get() as { c: number };
console.log(`${eligible.c} cards are Commander-eligible.`);
console.log(`${banned.c} cards are currently banned in Commander.`);
console.log(`${gameChangers.c} cards are on the Game Changers list.`);
const faceNames = db.prepare('SELECT COUNT(*) as c FROM card_face_names').get() as { c: number };
console.log(`${faceNames.c} face names indexed for single-side matching.`);

// --- signals -----------------------------------------------------------
//
// Done after the cards are in, so the vocabulary is every creature type and
// keyword the database actually contains rather than a hand-maintained list.
{
  const cardRows = db.prepare('SELECT * FROM cards').all() as CardRow[];
  const creatureTypes = new Set<string>();
  const keywords = new Set<string>();
  for (const row of cardRows) {
    // Legal cards only. The joke sets carry type lines the real game does not
    // — "Creature — Lady of Proper Etiquette" made *of* a creature type, and
    // every card with "of" in its text then read as caring about it. Signals
    // are still detected for every card; it is the vocabulary those signals
    // are matched against that has to describe the playable format.
    if (row.legality_commander !== 'legal') continue;
    for (const type of JSON.parse(row.creature_types || '[]') as string[]) creatureTypes.add(type);
    for (const keyword of JSON.parse(row.keywords || '[]') as string[]) keywords.add(keyword);
  }
  const vocabulary = buildVocabulary([...creatureTypes], [...keywords]);

  const insertSignal = db.prepare(
    `INSERT INTO card_signals (oracle_id, archetype, qualifier, qualifier_kind, roles)
     VALUES (?, ?, ?, ?, ?)`
  );
  let signalCount = 0;
  db.transaction(() => {
    for (const row of cardRows) {
      for (const signal of detectSignals(buildCardFacts(row, vocabulary), vocabulary)) {
        insertSignal.run(
          row.oracle_id,
          signal.archetype,
          signal.qualifier ?? null,
          signal.qualifierKind ?? null,
          JSON.stringify(signal.roles)
        );
        signalCount++;
      }
    }
  })();
  const withSignals = db
    .prepare('SELECT COUNT(DISTINCT oracle_id) as c FROM card_signals')
    .get() as { c: number };
  console.log(
    `${signalCount} card signals precomputed across ${withSignals.c} cards ` +
      `(vocabulary: ${creatureTypes.size} creature types, ${keywords.size} keywords).`
  );
}

// Re-skinned names, from the companion file fetch-scryfall.ts writes. Absent
// when the fetch was skipped or predates that file — an older local database
// just goes on without re-skin matching rather than failing the import.
const FLAVOR_NAMES_PATH = path.join(DATA_DIR, 'flavor-names.json');
if (fs.existsSync(FLAVOR_NAMES_PATH)) {
  const knownOracleIds = new Set(
    (db.prepare('SELECT oracle_id FROM cards').all() as { oracle_id: string }[]).map((r) => r.oracle_id)
  );
  const flavorEntries = JSON.parse(fs.readFileSync(FLAVOR_NAMES_PATH, 'utf-8')) as {
    flavor_name?: string;
    oracle_id?: string;
  }[];
  const insertFlavorName = db.prepare(
    'INSERT INTO card_flavor_names (flavor_name_lower, oracle_id) VALUES (?, ?)'
  );
  let flavorImported = 0;
  let flavorSkipped = 0;
  db.transaction(() => {
    for (const entry of flavorEntries) {
      // A re-skin whose card didn't survive the import (a non-gameplay
      // entry, say) would be a name pointing at nothing.
      if (!entry.flavor_name || !entry.oracle_id || !knownOracleIds.has(entry.oracle_id)) {
        flavorSkipped++;
        continue;
      }
      insertFlavorName.run(entry.flavor_name.toLowerCase(), entry.oracle_id);
      flavorImported++;
    }
  })();
  console.log(
    `${flavorImported} re-skinned card names indexed` +
      (flavorSkipped > 0 ? ` (${flavorSkipped} skipped as unresolvable).` : '.')
  );
} else {
  console.log('No flavor-names.json found — re-skinned card names not indexed.');
  console.log('  Run `npm run fetch-scryfall` to fetch them.');
}
const partnerCounts = db
  .prepare(
    `SELECT partner_ability, COUNT(*) as c FROM cards WHERE partner_ability IS NOT NULL GROUP BY partner_ability`
  )
  .all() as { partner_ability: string; c: number }[];
if (partnerCounts.length > 0) {
  console.log('Partner-family abilities found:');
  for (const row of partnerCounts) console.log(`  ${row.partner_ability}: ${row.c}`);
}
const backgroundCount = db.prepare('SELECT COUNT(*) as c FROM cards WHERE is_background = 1').get() as {
  c: number;
};
console.log(`${backgroundCount.c} legendary Background enchantments found.`);

// Last, and only on the success path: a meta row written before the import
// finished would let a half-built database claim to be current, and the next
// run would skip rebuilding it.
if (diskSnapshot) {
  writeImportedSnapshot(db, {
    updatedAt: diskSnapshot.updatedAt,
    importVersion: IMPORT_VERSION,
  });
  console.log(`Recorded snapshot ${diskSnapshot.updatedAt} (import v${IMPORT_VERSION}).`);
} else {
  // No sidecar — a hand-placed file, or one downloaded before sidecars
  // existed. Leaving meta unwritten means the next run re-imports rather
  // than trusting a snapshot nobody can identify.
  console.log('No snapshot metadata alongside the input file; not recording one.');
}

db.close();
