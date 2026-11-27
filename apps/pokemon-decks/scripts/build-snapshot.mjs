#!/usr/bin/env node
// @ts-check
/**
 * Builds the app's vendored card snapshot from TCGdex's card database.
 *
 *   pnpm --filter pokemon-decks run build-snapshot                 # clone, then build
 *   pnpm --filter pokemon-decks run build-snapshot -- --source DIR # use an existing checkout
 *
 * Network: one `git clone --depth 1` of github.com/tcgdex/cards-database (MIT),
 * nothing else — no API requests, so no per-card traffic and no rate limit to
 * respect. It runs by hand or from the monthly pokemon-data-refresh workflow,
 * never at build, deploy, or page load; see docs/api-policy.md's TCGdex
 * section. It is not a `fetch` call site, which is why apiPolicy.test.ts's
 * allowlist doesn't list it.
 *
 * The database's files are TypeScript modules; they're parsed, never executed
 * (see tcgdexSource.mjs).
 *
 * Output, under public/data/ (served as static assets, read back through
 * import.meta.env.BASE_URL):
 *   index.json           source commit, sets, series, and the format filters
 *   series/<id>.json     that series' cards, trimmed to what the app reads
 *
 * The output is deterministic for a given source commit — no timestamps, stable
 * ordering — so a refresh PR's diff is only what actually changed upstream.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNamedExports, readDatabase } from './tcgdexSource.mjs';
import { buildSnapshot } from './snapshot.mjs';

const REPO = 'https://github.com/tcgdex/cards-database.git';
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(APP_ROOT, 'public', 'data');

const args = process.argv.slice(2);
const sourceArg = args.includes('--source') ? args[args.indexOf('--source') + 1] : undefined;

/** @param {string[]} gitArgs @param {string} [cwd] */
const git = (gitArgs, cwd) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8' }).trim();

let root = sourceArg;
let cleanup = () => {};
if (!root) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tcgdex-'));
  cleanup = () => rmSync(dir, { recursive: true, force: true });
  console.log(`Cloning ${REPO} (depth 1)…`);
  git(['clone', '--quiet', '--depth', '1', REPO, dir]);
  root = dir;
}

try {
  const commit = git(['rev-parse', 'HEAD'], root);
  const committedAt = git(['log', '-1', '--format=%cI'], root);
  const legals = parseNamedExports(
    readFileSync(path.join(root, 'meta', 'legals.ts'), 'utf8'),
    'meta/legals.ts',
  );
  // Pokémon TCG Pocket is a separate digital game with its own card pool.
  const { cards, unreadable } = readDatabase(root, { skipSeries: (id) => id === 'tcgp' });
  if (unreadable.length > 0) {
    // A handful is tolerable (one odd file shouldn't block a refresh); many
    // means the database changed shape and the parser needs updating.
    console.warn(`Skipped ${unreadable.length} unreadable file(s):\n  ${unreadable.join('\n  ')}`);
    if (unreadable.length > 25)
      throw new Error('Too many unreadable files — update tcgdexSource.mjs.');
  }

  const { index, series } = buildSnapshot(cards, legals, { repo: REPO, commit, committedAt });
  if (index.cardCount < 15_000) {
    throw new Error(
      `Only ${index.cardCount} English cards — refusing to write a partial snapshot.`,
    );
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(path.join(OUT_DIR, 'series'), { recursive: true });
  writeFileSync(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
  for (const [id, seriesCards] of series) {
    writeFileSync(path.join(OUT_DIR, 'series', `${id}.json`), `${JSON.stringify(seriesCards)}\n`);
  }
  console.log(
    `Wrote ${index.cardCount} cards in ${series.size} series from tcgdex@${commit.slice(0, 7)}.`,
  );
} finally {
  cleanup();
}
