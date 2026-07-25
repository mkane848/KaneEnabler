#!/usr/bin/env node
/**
 * Downloads Scryfall's "Oracle Cards" bulk data file and filters it down to
 * the cards listed in decklist.txt, writing a small src/data/cards.json
 * bundle that ships with the app. This means the running app never needs to
 * call the Scryfall API itself — it's a fully static, offline card catalog.
 *
 * Usage:
 *   npm run fetch-cards
 *
 * If decklist.txt has no card names in it, this falls back to grabbing
 * every card whose rules text includes Suspend, Vanishing, or Fading —
 * useful for poking at the app before you've entered your real decklist.
 *
 * Every result is also filtered down to the Jeskai (White/Blue/Red) color
 * identity — this deck's commanders are The Tenth Doctor and Rose Tyler —
 * so anything outside that identity never makes it into the bundled catalog.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DECKLIST_PATH = path.join(ROOT, 'decklist.txt');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'cards.json');

const USER_AGENT = 'mtg-time-tracker/0.1 (personal Commander companion app)';

/** This deck's color identity — White/Blue/Red. */
const JESKAI_COLORS = ['W', 'U', 'R'];

/** Colorless cards (no color identity at all) are legal in any color identity. */
function isWithinIdentity(colors, allowed) {
  if (!colors || colors.length === 0) return true;
  return colors.every(c => allowed.includes(c));
}

async function readDecklist() {
  let raw = '';
  try {
    raw = await readFile(DECKLIST_PATH, 'utf8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

async function fetchBulkDataUrl() {
  const res = await fetch('https://api.scryfall.com/bulk-data', {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Scryfall bulk-data index request failed: HTTP ${res.status}`);
  const body = await res.json();
  const entry = body.data.find(d => d.type === 'oracle_cards');
  if (!entry) throw new Error('Could not find an "oracle_cards" entry in the Scryfall bulk-data index.');
  return entry.download_uri;
}

async function fetchBulkCards(downloadUri) {
  console.log(`Downloading Scryfall Oracle Cards bulk file…\n  ${downloadUri}`);
  const res = await fetch(downloadUri, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Bulk data download failed: HTTP ${res.status}`);
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

function imageField(card, size) {
  if (card.image_uris?.[size]) return card.image_uris[size];
  if (Array.isArray(card.card_faces) && card.card_faces[0]?.image_uris?.[size]) {
    return card.card_faces[0].image_uris[size];
  }
  return undefined;
}

function toCardData(card) {
  return {
    id: card.id,
    name: card.name,
    manaCost: faceField(card, 'mana_cost') || '',
    cmc: card.cmc,
    typeLine: card.type_line,
    oracleText: faceField(card, 'oracle_text'),
    imageSmall: imageField(card, 'small'),
    imageNormal: imageField(card, 'normal'),
    colors: card.colors ?? [],
    colorIdentity: card.color_identity ?? [],
    artist: card.artist,
  };
}

async function main() {
  const wanted = await readDecklist();
  const bulkUrl = await fetchBulkDataUrl();
  const allCards = await fetchBulkCards(bulkUrl);
  console.log(`Loaded ${allCards.length} unique cards from Scryfall.`);

  let filtered;
  if (wanted.length > 0) {
    const wantedSet = new Set(wanted.map(n => n.toLowerCase()));
    filtered = allCards.filter(c => wantedSet.has(c.name.toLowerCase()));

    const foundNames = new Set(filtered.map(c => c.name.toLowerCase()));
    const missing = wanted.filter(n => !foundNames.has(n.toLowerCase()));
    if (missing.length > 0) {
      console.warn(`\nWarning: ${missing.length} name(s) from decklist.txt were not found on Scryfall:`);
      missing.forEach(n => console.warn(`  - ${n}`));
      console.warn('Double-check spelling — matching is exact (but not case-sensitive).\n');
    }
  } else {
    console.log('\ndecklist.txt has no card names yet — falling back to every Suspend/Vanishing/Fading card.');
    filtered = allCards.filter(c => {
      const text = faceField(c, 'oracle_text') || '';
      return /suspend \d|vanishing(?:\s+\d)?\b|fading \d/i.test(text);
    });
  }

  const beforeColorFilter = filtered.length;
  filtered = filtered.filter(c => isWithinIdentity(c.color_identity, JESKAI_COLORS));
  const excludedByColor = beforeColorFilter - filtered.length;
  if (excludedByColor > 0) {
    console.log(`Excluded ${excludedByColor} card(s) outside the Jeskai (W/U/R) color identity.`);
  }

  const output = filtered.map(toCardData).sort((a, b) => a.name.localeCompare(b.name));

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`\nWrote ${output.length} card(s) to ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch(err => {
  console.error('\nfetch-cards failed:', err.message);
  process.exit(1);
});
