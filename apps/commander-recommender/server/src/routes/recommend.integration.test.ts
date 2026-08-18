/**
 * End-to-end check of the whole /api/recommend pipeline — parse -> singleton
 * limits -> collection profile -> commander units -> scoring -> selection ->
 * analysis -> serialization — against the real app and the real seeded
 * database, not the unit-level mocks synergy.test.ts and friends use.
 *
 * Requires `pnpm run prepare-data` to have been run locally first (real
 * Scryfall data, per this project's "never write oracle text from memory"
 * rule). Most CI runs and fresh clones have no seeded data/cards.sqlite, so
 * this whole suite is skipped rather than failing the build when isSeeded is
 * false — see .github/workflows/scryfall-fetch-check.yml, which does run
 * prepare-data first and so is the one place this suite actually executes.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import { isSeeded } from '../db';

describe.skipIf(!isSeeded)('POST /api/recommend — real seeded database', () => {
  it('returns ranked suggestions for a real decklist', async () => {
    const list = [
      '1 Tymna the Weaver',
      '1 Sol Ring',
      '1 Arcane Signet',
      '1 Command Tower',
      '1 Swords to Plowshares',
      '1 Elvish Mystic',
      '1 Llanowar Elves',
      '1 Elvish Visionary',
      '1 Beast Whisperer',
      '1 Elvish Champion',
    ].join('\n');

    const res = await request(app).post('/api/recommend').send({ list });

    expect(res.status).toBe(200);
    expect(res.body.notFound).toEqual([]);
    expect(res.body.totalParsed).toBe(10);
    expect(res.body.totalMatched).toBe(10);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.length).toBeGreaterThan(0);

    // Tymna the Weaver is legal, legendary, and in the submitted list itself
    // — a real Elf-heavy collection should surface her among the suggestions.
    const names = res.body.suggestions.flatMap((s: { cards: { name: string }[] }) =>
      s.cards.map((c) => c.name),
    );
    expect(names).toContain('Tymna the Weaver');

    // cardIndex + cite()-by-position dedup (cardIndex.ts): every card cited
    // by a suggestion's support arrays must resolve to a real index into it.
    for (const suggestion of res.body.suggestions) {
      for (const support of [
        ...suggestion.themeSupport,
        ...suggestion.kindredSupport,
        ...suggestion.keywordSupport,
      ]) {
        for (const idx of support.cards) {
          expect(res.body.cardIndex[idx]).toBeDefined();
        }
      }
    }

    // The list's own deck analysis, independent of any commander.
    expect(res.body.deck).toBeDefined();
  });

  it('reports unrecognized names as notFound rather than erroring', async () => {
    const res = await request(app)
      .post('/api/recommend')
      .send({ list: '1 Sol Ring\n1 Definitely Not A Real Card Name' });

    expect(res.status).toBe(200);
    expect(res.body.notFound).toContain('Definitely Not A Real Card Name');
    expect(res.body.totalMatched).toBe(1);
  });

  it('400s on a missing or empty list', async () => {
    const missing = await request(app).post('/api/recommend').send({});
    expect(missing.status).toBe(400);

    const empty = await request(app).post('/api/recommend').send({ list: '   ' });
    expect(empty.status).toBe(400);
  });
});
