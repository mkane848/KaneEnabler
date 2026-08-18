#!/usr/bin/env node
/**
 * Builds the app's card catalog: every Commander-legal card whose color
 * identity fits inside Jeskai (White/Blue/Red), taken from Scryfall's
 * "Oracle Cards" bulk data and written to public/cards.json.
 *
 * Usage:
 *   npm run fetch-cards
 *   npm run fetch-cards -- --force   # re-download instead of reusing the cache
 *
 * The output lands in public/ rather than src/ on purpose. It is a few
 * megabytes, so it ships as a separate static asset the app fetches at
 * runtime instead of being inlined into the JavaScript bundle.
 *
 * Failures here are deliberately fatal. This runs as part of the Render
 * build (see render.yaml), and a catalog that silently fell back to a
 * handful of cards would produce a green build serving a broken app.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUserAgent, ensureOracleCardsSnapshot } from '@mtg/scryfall';
import { frontFaceField, frontImageUri } from '@mtg/card-model';
import { JESKAI_COLORS, isWithinIdentity } from '../src/utils/colorIdentity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'public', 'cards.json');
const CACHE_DIR = path.join(ROOT, '.cache');
// JSONL, not JSON: Scryfall's bulk endpoint publishes newline-delimited
// JSON, gzipped — @mtg/scryfall's ensureOracleCardsSnapshot writes the
// decompressed stream straight to this path.
const BULK_CACHE_PATH = path.join(CACHE_DIR, 'oracle-cards.jsonl');

/**
 * Deliberately not computed at module scope: importing this file just for
 * toCardData (as fetch-card-data.test.mjs does) shouldn't also read
 * package.json off disk on every test run.
 */
async function scryfallHeaders() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  return {
    'User-Agent': buildUserAgent({
      product: 'mtg-time-tracker',
      version: pkg.version,
      contact: 'personal Commander companion app',
    }),
    Accept: 'application/json',
  };
}

/**
 * Oracle text is only consulted to pre-fill a starting count, so it is kept
 * just for cards that mention a time counter — Suspend, Vanishing, Fading,
 * and the Time Travel keyword action, which are the only mechanics that use
 * them. This pattern is deliberately broader than the app's detection
 * regexes: over-matching costs a few kilobytes, under-matching would
 * silently break auto-detection.
 */
const TIME_COUNTER_TEXT = /suspend|vanishing|fading|time counter|fade counter|time travel/i;

/**
 * Returns the parsed bulk card array, downloading it only when the
 * published snapshot has changed since the last run (or `force` is set) —
 * @mtg/scryfall compares Scryfall's own `updated_at` rather than guessing
 * from local file age, the same way commander-recommender/server already
 * did. That replaces a 7-day file-mtime heuristic that was wrong in both
 * directions: it happily served a week-old copy after Scryfall had
 * published something new, and forced a full re-download of a file that
 * hadn't changed. Deploys are unaffected either way: Render builds from a
 * clean checkout with no .cache directory, so the download always happens
 * there and a deployed catalog is never stale.
 */
async function fetchBulkCards(force) {
  await mkdir(CACHE_DIR, { recursive: true });
  const result = await ensureOracleCardsSnapshot({
    destPath: BULK_CACHE_PATH,
    headers: await scryfallHeaders(),
    force,
  });

  if (result.downloaded) {
    const sizeMb = result.compressedSize
      ? `~${(result.compressedSize / 1024 / 1024).toFixed(1)}MB compressed`
      : 'size unknown';
    console.log(`Downloaded Oracle Cards (updated ${result.updatedAt}, ${sizeMb}).`);
  } else {
    console.log(
      `Reusing cached bulk file (published ${result.updatedAt}).\n` +
        '  Pass --force to download a fresh copy.',
    );
  }

  const text = await readFile(BULK_CACHE_PATH, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

/** Reads a field from the card, falling back to combining its faces for DFCs/MDFCs. */
function faceField(card, field) {
  if (card[field] !== undefined) return card[field];
  if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    const joiner = field === 'oracle_text' ? '\n//\n' : ' // ';
    const combined = card.card_faces
      .map((f) => f[field])
      .filter(Boolean)
      .join(joiner);
    return combined || undefined;
  }
  return undefined;
}

/**
 * Only the fields the UI actually reads. cmc, colors and the large image
 * sizes were dropped after an audit showed nothing rendered them; across
 * ~16k cards those add up to megabytes of dead payload.
 */
export function toCardData(card) {
  const oracleText = faceField(card, 'oracle_text');
  const out = {
    id: card.id,
    name: card.name,
    typeLine: card.type_line,
    manaCost: frontFaceField(card, 'mana_cost') || '',
    colorIdentity: card.color_identity ?? [],
  };
  const img = frontImageUri(card, 'small');
  if (img) out.imageSmall = img;
  if (card.artist) out.artist = card.artist;
  if (oracleText && TIME_COUNTER_TEXT.test(oracleText)) out.oracleText = oracleText;
  return out;
}

function isCommanderLegal(card) {
  return card.legalities?.commander === 'legal';
}

async function main() {
  const force = process.argv.includes('--force');
  const allCards = await fetchBulkCards(force);
  console.log(`Loaded ${allCards.length} unique cards from Scryfall.`);

  const commanderLegal = allCards.filter(isCommanderLegal);
  console.log(`  ${commanderLegal.length} are legal in Commander.`);

  const jeskai = commanderLegal.filter((c) => isWithinIdentity(c.color_identity, JESKAI_COLORS));
  console.log(`  ${jeskai.length} of those fit the Jeskai (W/U/R) color identity.`);

  const output = jeskai.map(toCardData).sort((a, b) => a.name.localeCompare(b.name));
  const withText = output.filter((c) => c.oracleText).length;

  const json = JSON.stringify(output) + '\n';
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, json, 'utf8');

  const mb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
  console.log(
    `\nWrote ${output.length} card(s) to ${path.relative(ROOT, OUTPUT_PATH)} (${mb} MB).`,
  );
  console.log(`Kept oracle text for ${withText} card(s) with time-counter mechanics.`);

  // A catalog this far off expectations means an upstream format change.
  if (output.length < 1000) {
    throw new Error(
      `Only ${output.length} cards survived filtering — that is far below the expected ` +
        `~16,000 and suggests Scryfall changed its data format. Refusing to ship it.`,
    );
  }

  // Keep the committed seed honest about what it is.
  try {
    const seed = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
    if (!Array.isArray(seed)) throw new Error('written catalog is not an array');
  } catch (err) {
    throw new Error(`Wrote a catalog that could not be read back: ${err.message}`);
  }
}

// Only run the fetch when this file is executed directly (npm run fetch-cards),
// not when a test imports its pure functions (toCardData, etc.).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('\nfetch-cards failed:', err.message);
    process.exit(1);
  });
}
