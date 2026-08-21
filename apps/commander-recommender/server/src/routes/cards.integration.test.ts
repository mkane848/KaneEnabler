/**
 * End-to-end check of /api/cards against the real seeded database — same
 * skip-when-unseeded convention as recommend.integration.test.ts (see that
 * file's header comment), since this sandbox has no network access to
 * Scryfall. Runs in CI via .github/workflows/scryfall-fetch-check.yml,
 * after `pnpm run prepare-data` has actually seeded the database.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import { isSeeded, findCardsByNames } from '../db';

describe.skipIf(!isSeeded)('GET /api/cards — real seeded database', () => {
  it('resolves an oracle_id back to its card data', async () => {
    const sol = findCardsByNames(['Sol Ring']).get('sol ring');
    expect(sol).toBeDefined();

    const res = await request(app).get(`/api/cards?ids=${sol!.oracle_id}`);

    expect(res.status).toBe(200);
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0]).toMatchObject({
      oracleId: sol!.oracle_id,
      name: 'Sol Ring',
    });
  });

  it('resolves several ids, de-duplicated', async () => {
    const sol = findCardsByNames(['Sol Ring']).get('sol ring')!;
    const tymna = findCardsByNames(['Tymna the Weaver']).get('tymna the weaver')!;

    const res = await request(app).get(
      `/api/cards?ids=${sol.oracle_id},${tymna.oracle_id},${sol.oracle_id}`,
    );

    expect(res.status).toBe(200);
    const names = res.body.cards.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual(['Sol Ring', 'Tymna the Weaver']);
  });

  it('marks a commander-eligible card accordingly', async () => {
    const tymna = findCardsByNames(['Tymna the Weaver']).get('tymna the weaver')!;

    const res = await request(app).get(`/api/cards?ids=${tymna.oracle_id}`);

    expect(res.body.cards[0].isCommanderEligible).toBe(true);
  });

  it('returns an empty list for an id that matches nothing', async () => {
    const res = await request(app).get('/api/cards?ids=not-a-real-oracle-id');

    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([]);
  });

  it('400s on a missing or empty ids parameter', async () => {
    const missing = await request(app).get('/api/cards');
    expect(missing.status).toBe(400);

    const empty = await request(app).get('/api/cards?ids=');
    expect(empty.status).toBe(400);
  });

  it('400s rather than running an unbounded query when "ids" lists too many cards', async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => `not-a-real-id-${i}`).join(',');
    const res = await request(app).get(`/api/cards?ids=${tooMany}`);
    expect(res.status).toBe(400);
  });
});
