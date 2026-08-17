#!/usr/bin/env node
/**
 * Makes sure public/cards.json exists before dev/build.
 *
 * The real catalog is ~4.5 MB of generated data, so it is gitignored and
 * rebuilt by `npm run fetch-cards` (which Render runs on every deploy). This
 * copies the small committed seed into place when no catalog is present, so a
 * fresh clone can `npm run dev` without needing network access first.
 *
 * An existing catalog is never overwritten — only `fetch-cards` does that.
 */

import { copyFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SEED = path.join(ROOT, 'scripts', 'seed-cards.json');
const TARGET = path.join(ROOT, 'public', 'cards.json');

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

if (await exists(TARGET)) {
  process.exit(0);
}

await mkdir(path.dirname(TARGET), { recursive: true });
await copyFile(SEED, TARGET);
console.log(
  'No card catalog found — copied the demo seed to public/cards.json.\n' +
    'Run `npm run fetch-cards` to pull every Commander-legal Jeskai card from Scryfall.',
);
