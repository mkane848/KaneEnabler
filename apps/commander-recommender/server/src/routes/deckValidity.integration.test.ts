/**
 * End-to-end check of POST /api/deck-validity against the real seeded database —
 * same skip-when-unseeded convention as recommend.integration.test.ts and
 * cards.integration.test.ts (see that file's header comment), since this
 * sandbox has no network access to Scryfall. Runs in CI via
 * .github/workflows/scryfall-fetch-check.yml, after `pnpm run prepare-data`.
 *
 * The fixtures are the real-deck corpus in services/__fixtures__/decks/: each
 * file's `#` header names its commander, and the README records the true totals
 * (yshtola is 99 as supplied — intentionally not padded).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import { isSeeded } from '../db';

const DECKS = path.join(__dirname, '..', 'services', '__fixtures__', 'decks');

async function deck(name: string): Promise<string> {
  return readFile(path.join(DECKS, `${name}.txt`), 'utf8');
}

describe.skipIf(!isSeeded)('POST /api/deck-validity — real seeded database', () => {
  it('yshtola (99 cards as supplied) is size-invalid', async () => {
    const res = await request(app).post('/api/deck-validity').send({
      list: await deck('yshtola'),
      commanderNames: ["Y'shtola, Night's Blessed"],
    });

    expect(res.status).toBe(200);
    expect(res.body.isValid).toBe(false);
    expect(res.body.deckSize.total).toBe(99);
    expect(res.body.deckSize.isValid).toBe(false);
  });

  it('The Tenth Doctor + Rose Tyler is a legal 100-card Doctor-and-companion deck', async () => {
    const res = await request(app).post('/api/deck-validity').send({
      list: await deck('tenth-doctor-rose-tyler'),
      commanderNames: ['The Tenth Doctor', 'Rose Tyler'],
    });

    expect(res.status).toBe(200);
    // The fixture is a real 100-card deck ordered around its two commanders;
    // if any card fails to resolve or rides outside the identity, this deck
    // exists precisely to expose it.
    expect(res.body.isValid).toBe(true);
    expect(res.body.deckSize.total).toBe(100);
    expect(res.body.commander.pairingLegal).toBe(true);
  });

  it('400s on a missing list or a commanderNames array without 1-2 names', async () => {
    const noList = await request(app).post('/api/deck-validity').send({ commanderNames: ['X'] });
    expect(noList.status).toBe(400);

    const noNames = await request(app).post('/api/deck-validity').send({ list: '1 Sol Ring' });
    expect(noNames.status).toBe(400);

    const tooMany = await request(app)
      .post('/api/deck-validity')
      .send({ list: '1 Sol Ring', commanderNames: ['A', 'B', 'C'] });
    expect(tooMany.status).toBe(400);
  });

  it('404s when a named commander does not resolve in the database', async () => {
    const res = await request(app).post('/api/deck-validity').send({
      list: '1 Sol Ring',
      commanderNames: ['Not A Real Commander'],
    });
    expect(res.status).toBe(404);
  });
});