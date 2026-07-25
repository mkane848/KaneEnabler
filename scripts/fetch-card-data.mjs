#!/usr/bin/env node
/**
 * Builds the app's card catalog: every Commander-legal card whose color
 * identity fits inside Jeskai (White/Blue/Red), taken from Scryfall's
 * "Oracle Cards" bulk data and written to public/cards.json.
 *
 * Usage:
 *   npm run fetch-cards
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'public', 'cards.json');

const USER_AGENT = 'mtg-time-tracker/0.1 (personal Commander companion app)';

/** Overridable so the pipeline can be exercised against a local mirror or fixture. */
const BULK_INDEX_URL = process.env.SCRYFALL_BULK_INDEX ?? 'https://api.scryfall.com/bulk-data';

/** This deck's color identity — White/Blue/Red. */
const JESKAI_COLORS = ['W', 'U', 'R'];

/** Colorless cards (no color identity at all) are legal in any color identity. */
function isWithinIdentity(colors, allowed) {
  if (!colors || colors.length === 0) return true;
  return colors.every(c => allowed.includes(c));
}

/**
 * Oracle text is only consulted to pre-fill a starting count, so it is kept
 * just for cards that mention a time-counter mechanic. This pattern is
 * deliberately broader than the app's detection regexes: over-matching costs
 * a few kilobytes, under-matching would silently break auto-detection.
 */
const TIME_COUNTER_TEXT = /suspend|vanishing|fading|time counter|fade counter/i;

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
  if (!res.ok) throw new Error(`Scryfall bulk-data index request failed: ${await describeFailure(res)}`);
  const body = await res.json();
  const entry = body.data.find(d => d.type === 'oracle_cards');
  if (!entry) throw new Error('Could not find an "oracle_cards" entry in the Scryfall bulk-data index.');
  return entry.download_uri;
}

async function fetchBulkCards(downloadUri) {
  console.log(`Downloading Scryfall Oracle Cards bulk file…\n  ${downloadUri}`);
  const res = await fetch(downloadUri, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Bulk data download failed: ${await describeFailure(res)}`);
  return res.json();
}

/** Reads a field from the card, falling back to combining its faces for DFCs/MDFCs. */
function faceField(card, field) {
  if (card[field] !== undefined) return card[field];
  if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    const joiner = field === 'oracle_text' ? '\n//\n' : ' // ';
    const combined = card.card_faces.map(f => f[field]).filter(Boolean).join(joiner);
    return combined || undefined;
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
function toCardData(card) {
  const oracleText = faceField(card, 'oracle_text');
  const out = {
    id: card.id,
    name: card.name,
    typeLine: card.type_line,
    manaCost: faceField(card, 'mana_cost') || '',
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
  const bulkUrl = await fetchBulkDataUrl();
  const allCards = await fetchBulkCards(bulkUrl);
  console.log(`Loaded ${allCards.length} unique cards from Scryfall.`);

  const commanderLegal = allCards.filter(isCommanderLegal);
  console.log(`  ${commanderLegal.length} are legal in Commander.`);

  const jeskai = commanderLegal.filter(c => isWithinIdentity(c.color_identity, JESKAI_COLORS));
  console.log(`  ${jeskai.length} of those fit the Jeskai (W/U/R) color identity.`);

  const output = jeskai.map(toCardData).sort((a, b) => a.name.localeCompare(b.name));
  const withText = output.filter(c => c.oracleText).length;

  const json = JSON.stringify(output) + '\n';
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, json, 'utf8');

  const mb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
  console.log(`\nWrote ${output.length} card(s) to ${path.relative(ROOT, OUTPUT_PATH)} (${mb} MB).`);
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

main().catch(err => {
  console.error('\nfetch-cards failed:', err.message);
  process.exit(1);
});
