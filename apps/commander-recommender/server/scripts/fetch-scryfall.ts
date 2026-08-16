import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { diskHasSnapshot, writeSidecar } from '../src/services/dataSnapshot';

const DATA_DIR = path.join(__dirname, '..', 'data');
// JSONL, not JSON: Scryfall's bulk endpoint now publishes newline-delimited
// JSON, gzipped. See BulkDataEntry below.
const OUTPUT_PATH = path.join(DATA_DIR, 'oracle-cards.jsonl');
// Small companion file — see fetchFlavorNames below for why this isn't part
// of the bulk download.
const FLAVOR_NAMES_PATH = path.join(DATA_DIR, 'flavor-names.json');
const CREATURE_TYPES_PATH = path.join(DATA_DIR, 'creature-types.json');

/**
 * Reuse is decided by comparing the *published snapshot* against the one on
 * disk, not by how old the file is.
 *
 * This replaced a 7-day file-mtime heuristic, which was wrong in both
 * directions: it happily served a week-old copy after Scryfall had published
 * something new, and forced a full re-download of a file that hadn't
 * changed. Scryfall gives an exact answer — every snapshot has its own
 * `updated_at` and its own content-addressed URL — so guessing from a
 * timestamp was never necessary.
 *
 * It has no effect on a deploy either way: the build starts from a clean
 * checkout with no data directory, so there is nothing to reuse and the
 * download always happens. See docs/card-data-strategy.md for what it would
 * take to change that.
 */

// Scryfall requires both of these on every request and answers 400 without
// them. The User-Agent must identify this app specifically — they flag the
// defaults HTTP libraries send (Node's built-in fetch included) as junk
// traffic. See https://scryfall.com/docs/api
// Kept in sync with services/spellbook.ts's User-Agent by hand — see the
// note there on why it isn't read from package.json.
const SCRYFALL_HEADERS = {
  'User-Agent': 'CommanderIHardlyKnowEr/1.0.0 (hobby project; https://github.com/mkane848/HardlyKnowHer)',
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};

/**
 * One entry in Scryfall's bulk-data list.
 *
 * Scryfall changed this shape: entries used to carry `download_uri` (a plain
 * uncompressed JSON array) and `size`. Both are gone. The replacements are
 * `jsonl_download_uri` — newline-delimited JSON, gzipped — and
 * `compressed_size`. Reading the old field names silently yielded
 * `undefined`, which surfaced as "Failed to parse URL from undefined" and a
 * download size of "~NaNMB".
 *
 * Both fields are optional here so a future rename fails with the explicit
 * check below rather than another undefined-URL crash.
 */
interface BulkDataEntry {
  type: string;
  updated_at: string;
  jsonl_download_uri?: string;
  compressed_size?: number;
}

/**
 * Builds the "what went wrong" half of a failure message.
 *
 * Scryfall explains rejections in the response body — a JSON error object
 * whose `details` field says exactly what it objected to — while the status
 * code alone rarely narrows it down. These requests only ever run
 * unattended in a build log, so there's no chance to re-run them by hand
 * with more logging; whatever we print here is all you get.
 */
async function describeFailure(res: Response): Promise<string> {
  let body = '';
  try {
    body = (await res.text()).trim();
  } catch {
    // An unreadable body shouldn't swallow the status code.
  }

  if (!body) return `HTTP ${res.status}`;
  // Bounded in case a proxy or error page answers with a wall of HTML.
  const snippet = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  return `HTTP ${res.status}: ${snippet}`;
}

async function main() {
  const force = process.argv.includes('--force');

  // The listing is looked up first, and unconditionally: it is one small
  // request, and its `updated_at` is the only thing that can answer "is my
  // copy current?" without downloading 24MB to find out.
  console.log('Looking up the latest Scryfall bulk data URL...');
  const listRes = await fetch('https://api.scryfall.com/bulk-data', {
    headers: SCRYFALL_HEADERS,
  });
  if (!listRes.ok) {
    throw new Error(`Failed to list Scryfall bulk data (${await describeFailure(listRes)})`);
  }
  const { data } = (await listRes.json()) as { data: BulkDataEntry[] };
  const oracleCards = data.find((entry) => entry.type === 'oracle_cards');
  if (!oracleCards) {
    throw new Error('Could not find an "oracle_cards" entry in the Scryfall bulk data list.');
  }

  const downloadUri = oracleCards.jsonl_download_uri;
  if (!downloadUri) {
    throw new Error(
      'The "oracle_cards" bulk entry has no `jsonl_download_uri`. Scryfall has probably renamed the ' +
        'field again — check https://scryfall.com/docs/api/bulk-data for the current shape. ' +
        `Fields present: ${Object.keys(oracleCards).join(', ')}`
    );
  }

  const publishedUpdatedAt = oracleCards.updated_at;

  if (!force && diskHasSnapshot(OUTPUT_PATH, publishedUpdatedAt)) {
    console.log(
      `Already have the current snapshot (published ${publishedUpdatedAt}). Skipping download.\n` +
        'Pass --force to download it again anyway.'
    );
    // Still fetch the re-skin names if we've never got them. Skipping the
    // bulk download must not mean permanently skipping a companion file that
    // didn't exist when that copy was downloaded.
    if (!fs.existsSync(FLAVOR_NAMES_PATH)) await fetchFlavorNames();
    if (!fs.existsSync(CREATURE_TYPES_PATH)) await fetchCreatureTypes();
    return;
  }

  const sizeMb = oracleCards.compressed_size
    ? `~${(oracleCards.compressed_size / 1024 / 1024).toFixed(1)}MB compressed`
    : 'size unknown';
  console.log(`Found Oracle Cards (updated ${publishedUpdatedAt}, ${sizeMb}). Downloading...`);

  const fileRes = await fetch(downloadUri, { headers: SCRYFALL_HEADERS });
  if (!fileRes.ok) {
    throw new Error(`Failed to download bulk file (${await describeFailure(fileRes)})`);
  }
  if (!fileRes.body) {
    throw new Error('Bulk file response had no body.');
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Streamed rather than buffered: the file is ~25MB gzipped but expands to
  // several hundred MB, and there's no reason to hold all of that in memory
  // on the way to disk.
  await pipeline(
    Readable.fromWeb(fileRes.body as Parameters<typeof Readable.fromWeb>[0]),
    createGunzip(),
    fs.createWriteStream(OUTPUT_PATH)
  );

  const written = fs.statSync(OUTPUT_PATH).size;
  console.log(`Saved to ${OUTPUT_PATH} (${(written / 1024 / 1024).toFixed(1)}MB uncompressed).`);

  // Written only after the file is fully on disk, so an interrupted download
  // can never leave a sidecar claiming a snapshot we don't actually have.
  writeSidecar(OUTPUT_PATH, {
    updatedAt: publishedUpdatedAt,
    downloadUri,
    fetchedAt: new Date().toISOString(),
  });

  await fetchFlavorNames();
  await fetchCreatureTypes();
}

/**
 * Every creature type in the game, from Scryfall's own catalog.
 *
 * A type line's subtypes are not all creature types, and they are not
 * positionally separable: "Artifact Creature — Equipment Boar" carries an
 * artifact subtype and a creature type in that order, and "Kindred Enchantment
 * — Lhurgoyf Aura" does the same with an enchantment subtype. Deriving the
 * vocabulary from type lines therefore made Equipment, Aura, and Saga
 * "creature types", and a graveyard list came back with a three-card "Aura
 * Kindred" theme.
 *
 * One 30KB request against an endpoint we already use, and it stays correct
 * as new types are printed — which a hand-maintained denylist would not.
 */
async function fetchCreatureTypes() {
  console.log('Fetching the creature-type catalog...');

  const res = await fetch('https://api.scryfall.com/catalog/creature-types', {
    headers: SCRYFALL_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch the creature-type catalog (${await describeFailure(res)})`);
  }

  const body = (await res.json()) as { data?: unknown };
  if (!Array.isArray(body.data) || body.data.length === 0) {
    throw new Error(
      'The creature-type catalog came back without a non-empty `data` array. Check ' +
        'https://scryfall.com/docs/api/catalogs for the current shape.'
    );
  }

  fs.writeFileSync(CREATURE_TYPES_PATH, JSON.stringify(body.data, null, 2));
  console.log(`Saved ${body.data.length} creature types to ${CREATURE_TYPES_PATH}.`);
}

/**
 * Names that appear on re-skinned printings, and the card they really are.
 *
 * Universes Beyond and similar releases reprint an existing card under a
 * different name — "Dracula, Voyager" is Edgar, Charmed Groom. Scryfall calls
 * that a `flavor_name`, and it lives on the *printing*, not the oracle
 * entry. The Oracle Cards bulk file has one row per oracle ID under the
 * canonical name, so a list naming the re-skin resolves to nothing at all.
 *
 * Fetched from the search API rather than by switching to the `default_cards`
 * bulk file: that file is one row per printing and three times the size, to
 * recover a few hundred names. This is ~3 requests.
 */
async function fetchFlavorNames() {
  console.log('Fetching re-skinned card names...');

  const entries: { flavor_name: string; oracle_id: string }[] = [];
  // unique=prints, not unique=cards. A re-skin lives on a *printing*, and
  // unique=cards collapses each card to one printing — usually the canonical
  // one, which is exactly the printing without the flavor name. That drops
  // 176 of the 617 re-skinned printings on the floor.
  let url: string | null =
    'https://api.scryfall.com/cards/search?q=has%3Aflavorname&unique=prints';

  while (url) {
    const res: Response = await fetch(url, { headers: SCRYFALL_HEADERS });
    if (!res.ok) {
      // Non-fatal on purpose. Re-skin matching is a nicety; failing the whole
      // data refresh over it would take the app down for a rounding error.
      console.warn(`  Skipping re-skinned names (${await describeFailure(res)}).`);
      return;
    }
    const page = (await res.json()) as {
      data?: { flavor_name?: string; oracle_id?: string }[];
      has_more?: boolean;
      next_page?: string;
    };
    for (const card of page.data ?? []) {
      if (card.flavor_name && card.oracle_id) {
        entries.push({ flavor_name: card.flavor_name, oracle_id: card.oracle_id });
      }
    }
    url = page.has_more ? page.next_page ?? null : null;
    // Scryfall asks for 50-100ms between requests. See
    // https://scryfall.com/docs/api — this is the whole reason it's polite
    // to page rather than hammer.
    if (url) await new Promise((resolve) => setTimeout(resolve, 100));
  }

  fs.writeFileSync(FLAVOR_NAMES_PATH, JSON.stringify(entries, null, 2));
  console.log(`Saved ${entries.length} re-skinned names to ${FLAVOR_NAMES_PATH}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
