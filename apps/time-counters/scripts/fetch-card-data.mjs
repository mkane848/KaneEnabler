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

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { JESKAI_COLORS, isWithinIdentity } from '../src/utils/colorIdentity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'public', 'cards.json');
const CACHE_DIR = path.join(ROOT, '.cache');
const BULK_CACHE_PATH = path.join(CACHE_DIR, 'oracle-cards.json');

/** How long a downloaded bulk file is considered good enough to reuse. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const USER_AGENT = 'mtg-time-tracker/0.1 (personal Commander companion app)';

/** Overridable so the pipeline can be exercised against a local mirror or fixture. */
const BULK_INDEX_URL = process.env.SCRYFALL_BULK_INDEX ?? 'https://api.scryfall.com/bulk-data';

/**
 * Oracle text is only consulted to pre-fill a starting count, so it is kept
 * just for cards that mention a time counter — Suspend, Vanishing, Fading,
 * and the Time Travel keyword action, which are the only mechanics that use
 * them. This pattern is deliberately broader than the app's detection
 * regexes: over-matching costs a few kilobytes, under-matching would
 * silently break auto-detection.
 */
const TIME_COUNTER_TEXT = /suspend|vanishing|fading|time counter|fade counter|time travel/i;

/** Scryfall returns an HTML error page often enough that the body is worth logging. */
async function describeFailure(res) {
  let body = '';
  try {
    body = (await res.text()).trim();
  } catch {
    /* keep the status */
  }
  if (!body) return `HTTP ${res.status}`;
  return `HTTP ${res.status}: ${body.length > 500 ? body.slice(0, 500) + '…' : body}`;
}

async function fetchBulkDataUrl() {
  const res = await fetch(BULK_INDEX_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok)
    throw new Error(`Scryfall bulk-data index request failed: ${await describeFailure(res)}`);
  const body = await res.json();
  const entry = body.data.find((d) => d.type === 'oracle_cards');
  if (!entry)
    throw new Error('Could not find an "oracle_cards" entry in the Scryfall bulk-data index.');
  // Scryfall used to publish a plain-JSON `download_uri`; it now only
  // publishes a gzip-compressed JSON-Lines file (see fetchBulkCards).
  if (!entry.jsonl_download_uri) {
    throw new Error(
      'The "oracle_cards" bulk-data entry has no jsonl_download_uri — Scryfall changed its format again.',
    );
  }
  return entry.jsonl_download_uri;
}

/**
 * Describes the cached bulk file if it's recent enough to reuse, else null.
 *
 * Re-pulling ~190MB is by far the slowest part of a run, and the fields this
 * script reads only change when Scryfall republishes (roughly daily), so a
 * week-old copy is fine while iterating locally. Deploys are unaffected: Render
 * builds from a clean checkout with no .cache directory, so the download always
 * happens there and a deployed catalog is never stale.
 */
async function readFreshCache() {
  let stats;
  try {
    stats = await stat(BULK_CACHE_PATH);
  } catch {
    return null;
  }
  if (stats.size === 0) return null; // a truncated download is worse than none

  const ageMs = Date.now() - stats.mtimeMs;
  if (ageMs >= MAX_AGE_MS) return null;

  return {
    ageHours: Math.floor(ageMs / (60 * 60 * 1000)),
    sizeMb: (stats.size / 1024 / 1024).toFixed(1),
  };
}

/** Returns the parsed bulk card array, downloading it only when needed. */
async function fetchBulkCards(force) {
  const cached = force ? null : await readFreshCache();
  if (cached) {
    console.log(
      `Reusing cached bulk file (${cached.sizeMb}MB, ${cached.ageHours}h old).\n` +
        '  Pass --force to download a fresh copy.',
    );
    return JSON.parse(await readFile(BULK_CACHE_PATH, 'utf8'));
  }

  const downloadUri = await fetchBulkDataUrl();
  console.log(`Downloading Scryfall Oracle Cards bulk file…\n  ${downloadUri}`);
  const res = await fetch(downloadUri, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Bulk data download failed: ${await describeFailure(res)}`);

  // The file is gzip-compressed JSON Lines (one card object per line), not
  // a single JSON array — Scryfall retired the plain-JSON bulk download.
  const compressed = Buffer.from(await res.arrayBuffer());
  const cards = gunzipSync(compressed)
    .toString('utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(BULK_CACHE_PATH, JSON.stringify(cards));
  console.log(`Cached to ${path.relative(ROOT, BULK_CACHE_PATH)}.`);

  return cards;
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
 * The front face's own value for a field, falling back to the top-level
 * field for single-faced cards. Unlike faceField, this never combines both
 * faces — mana cost is a per-face characteristic, and a modal DFC is cast
 * as one face or the other, never both, so joining "{1}{G}" and "{3}{G}{G}"
 * into "{1}{G} // {3}{G}{G}" produced five pips for what should show one
 * cost. Same front-face principle as commander eligibility elsewhere in
 * this codebase (CR 712.4): a card outside the battlefield is its front
 * face only.
 */
function frontFaceField(card, field) {
  if (card[field] !== undefined) return card[field];
  if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    return card.card_faces[0][field];
  }
  return undefined;
}

function imageSmall(card) {
  if (card.image_uris?.small) return card.image_uris.small;
  if (Array.isArray(card.card_faces) && card.card_faces[0]?.image_uris?.small) {
    return card.card_faces[0].image_uris.small;
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
  const img = imageSmall(card);
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
