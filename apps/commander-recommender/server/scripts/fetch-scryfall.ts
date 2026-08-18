import fs, { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildUserAgent, describeFailure, ensureOracleCardsSnapshot } from '@mtg/scryfall';

const DATA_DIR = path.join(__dirname, '..', 'data');
// JSONL, not JSON: Scryfall's bulk endpoint now publishes newline-delimited
// JSON, gzipped.
const OUTPUT_PATH = path.join(DATA_DIR, 'oracle-cards.jsonl');
// Small companion file — see fetchFlavorNames below for why this isn't part
// of the bulk download.
const FLAVOR_NAMES_PATH = path.join(DATA_DIR, 'flavor-names.json');
const CREATURE_TYPES_PATH = path.join(DATA_DIR, 'creature-types.json');

// __dirname, not import.meta.url: this app has no "type": "module", so tsc
// (node16 module resolution) compiles this file as CommonJS and rejects
// import.meta outright — see tsconfig.json's own note on why.
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string;
};

// Scryfall requires both of these on every request and answers 400 without
// them. The User-Agent must identify this app specifically — they flag the
// defaults HTTP libraries send (Node's built-in fetch included) as junk
// traffic. See https://scryfall.com/docs/api
const SCRYFALL_HEADERS = {
  'User-Agent': buildUserAgent({
    product: 'CommanderIHardlyKnowEr',
    version: pkg.version,
    contact: 'hobby project; https://github.com/mkane848/HardlyKnowHer',
  }),
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};

async function main() {
  const force = process.argv.includes('--force');

  // Reuse is decided by comparing the *published* snapshot against the one
  // on disk (@mtg/scryfall's ensureOracleCardsSnapshot), not by how old the
  // file is — that replaced a 7-day file-mtime heuristic, which was wrong in
  // both directions: it happily served a week-old copy after Scryfall had
  // published something new, and forced a full re-download of a file that
  // hadn't changed.
  //
  // It has no effect on a deploy either way: the build starts from a clean
  // checkout with no data directory, so there is nothing to reuse and the
  // download always happens. See docs/card-data-strategy.md for what it
  // would take to change that.
  console.log('Checking Scryfall for the current Oracle Cards snapshot...');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const result = await ensureOracleCardsSnapshot({
    destPath: OUTPUT_PATH,
    headers: SCRYFALL_HEADERS,
    force,
  });

  if (!result.downloaded) {
    console.log(
      `Already have the current snapshot (published ${result.updatedAt}). Skipping download.\n` +
        'Pass --force to download it again anyway.',
    );
  } else {
    const sizeMb = result.compressedSize
      ? `~${(result.compressedSize / 1024 / 1024).toFixed(1)}MB compressed`
      : 'size unknown';
    const written = fs.statSync(OUTPUT_PATH).size;
    console.log(
      `Downloaded Oracle Cards (updated ${result.updatedAt}, ${sizeMb}), ` +
        `saved to ${OUTPUT_PATH} (${(written / 1024 / 1024).toFixed(1)}MB uncompressed).`,
    );
  }

  // Still fetch the re-skin names / creature types if we've never got them.
  // Skipping the bulk download must not mean permanently skipping a
  // companion file that didn't exist when that copy was downloaded.
  if (!fs.existsSync(FLAVOR_NAMES_PATH)) await fetchFlavorNames();
  if (!fs.existsSync(CREATURE_TYPES_PATH)) await fetchCreatureTypes();
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
        'https://scryfall.com/docs/api/catalogs for the current shape.',
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
  let url: string | null = 'https://api.scryfall.com/cards/search?q=has%3Aflavorname&unique=prints';

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
    url = page.has_more ? (page.next_page ?? null) : null;
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
