/**
 * Tests for the Commander Spellbook adapter, run against a local stand-in for
 * their API. Run with: npm run test:spellbook
 *
 * Nothing here touches the real service. The point is to pin down the parts
 * we control — response normalisation, caching (so repeat clicks cost them
 * nothing), rate-limit handling, and timeouts — since the live call can't be
 * exercised from a sandbox without network access to them.
 *
 * The response shapes below are our best reading of their API. If the live
 * mapping turns out to differ, this is the file to correct first.
 */
import assert from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

interface MockState {
  requests: { body: unknown; userAgent?: string }[];
  handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;
}

const state: MockState = { requests: [], handler: () => {} };

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    state.requests.push({
      body: body ? JSON.parse(body) : null,
      userAgent: req.headers['user-agent'],
    });
    state.handler(req, res, body);
  });
});

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

let failures = 0;
function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ok   ${label}`))
    .catch((err) => {
      failures++;
      console.error(`  FAIL ${label}`);
      console.error(`       ${err instanceof Error ? err.message : String(err)}`);
    });
}

async function main() {
  // Port 0 lets the OS pick a free one, so this can't collide with whatever
  // else happens to be listening. The endpoint has to be set before the
  // module is imported, hence the dynamic import below.
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env.SPELLBOOK_ENDPOINT = `http://127.0.0.1:${port}/find-my-combos`;

  // The .js extension is required for a dynamic ESM import under
  // moduleResolution node16; tsx maps it back to the .ts source at runtime.
  const { findCombos, clearComboCache, SpellbookError } = await import('../src/services/spellbook.js');

  await check('normalises nested {card:{name}} / {feature:{name}} shapes', async () => {
    clearComboCache();
    state.requests = [];
    state.handler = (_req, res) =>
      json(res, 200, {
        results: {
          included: [
            {
              id: '1234-5678',
              uses: [{ card: { name: 'Basalt Monolith' } }, { card: { name: 'Rings of Brighthearth' } }],
              produces: [{ feature: { name: 'Infinite colorless mana' } }],
              description: 'Activate Basalt Monolith, respond with Rings.',
            },
          ],
          almostIncluded: [
            {
              id: '999',
              uses: [{ card: { name: 'Grimgrin, Corpse-Born' } }, { card: { name: 'Gravecrawler' } }, { card: { name: 'Phyrexian Altar' } }],
              produces: [{ feature: { name: 'Infinite death triggers' } }],
            },
          ],
        },
      });

    const result = await findCombos(['Grimgrin, Corpse-Born'], ['Gravecrawler', 'Basalt Monolith', 'Rings of Brighthearth']);
    assert.strictEqual(result.ready.length, 1);
    assert.deepStrictEqual(result.ready[0].cards, ['Basalt Monolith', 'Rings of Brighthearth']);
    assert.deepStrictEqual(result.ready[0].produces, ['Infinite colorless mana']);
    assert.strictEqual(result.ready[0].permalink, 'https://commanderspellbook.com/combo/1234-5678/');
    // Missing is computed against what we actually hold.
    assert.deepStrictEqual(result.almost[0].missing, ['Phyrexian Altar']);
  });

  await check('tolerates flat string shapes for cards and results', async () => {
    clearComboCache();
    state.handler = (_req, res) =>
      json(res, 200, {
        results: {
          included: [{ id: 7, cards: ['Thassa\'s Oracle', 'Demonic Consultation'], results: ['Win the game'] }],
          almostIncluded: [],
        },
      });

    const result = await findCombos(['Tymna'], ["Thassa's Oracle", 'Demonic Consultation']);
    assert.deepStrictEqual(result.ready[0].cards, ["Thassa's Oracle", 'Demonic Consultation']);
    assert.deepStrictEqual(result.ready[0].produces, ['Win the game']);
  });

  await check('sends an identifying User-Agent and the commander separately', async () => {
    clearComboCache();
    state.requests = [];
    state.handler = (_req, res) => json(res, 200, { results: { included: [], almostIncluded: [] } });

    await findCombos(['Grimgrin, Corpse-Born'], ['Gravecrawler']);
    const sent = state.requests[0];
    assert.match(sent.userAgent ?? '', /CommanderIHardlyKnowEr/);
    assert.deepStrictEqual(sent.body, {
      commanders: [{ card: 'Grimgrin, Corpse-Born' }],
      main: [{ card: 'Gravecrawler' }],
    });
  });

  await check('caches, so a repeat lookup does not hit them again', async () => {
    clearComboCache();
    state.requests = [];
    state.handler = (_req, res) => json(res, 200, { results: { included: [], almostIncluded: [] } });

    const first = await findCombos(['Grimgrin, Corpse-Born'], ['Gravecrawler']);
    const second = await findCombos(['Grimgrin, Corpse-Born'], ['Gravecrawler']);
    assert.strictEqual(first.cached, false);
    assert.strictEqual(second.cached, true);
    assert.strictEqual(state.requests.length, 1, 'expected exactly one upstream request');
  });

  await check('cache key ignores card order but respects contents', async () => {
    clearComboCache();
    state.requests = [];
    state.handler = (_req, res) => json(res, 200, { results: { included: [], almostIncluded: [] } });

    await findCombos(['Grimgrin'], ['A', 'B']);
    const reordered = await findCombos(['Grimgrin'], ['B', 'A']);
    assert.strictEqual(reordered.cached, true, 'reordered list should hit cache');
    const different = await findCombos(['Grimgrin'], ['A', 'C']);
    assert.strictEqual(different.cached, false, 'different list should miss cache');
    assert.strictEqual(state.requests.length, 2);
  });

  await check('surfaces 429 with Retry-After instead of retrying', async () => {
    clearComboCache();
    state.requests = [];
    state.handler = (_req, res) => {
      res.statusCode = 429;
      res.setHeader('Retry-After', '30');
      res.end('slow down');
    };

    await assert.rejects(
      () => findCombos(['Grimgrin'], ['Gravecrawler']),
      (err: unknown) => {
        assert.ok(err instanceof SpellbookError);
        assert.strictEqual(err.status, 429);
        assert.strictEqual(err.retryAfterSeconds, 30);
        return true;
      }
    );
    assert.strictEqual(state.requests.length, 1, 'must not retry a rate-limited request');
  });

  await check('includes the response body when they reject the call', async () => {
    clearComboCache();
    state.handler = (_req, res) => json(res, 400, { detail: 'commanders field is required' });

    await assert.rejects(
      () => findCombos(['Grimgrin'], ['Gravecrawler']),
      (err: unknown) => {
        assert.ok(err instanceof SpellbookError);
        assert.match(err.message, /commanders field is required/);
        return true;
      }
    );
  });

  await check('a failed lookup is not cached', async () => {
    clearComboCache();
    state.requests = [];
    state.handler = (_req, res) => json(res, 500, { detail: 'boom' });
    await assert.rejects(() => findCombos(['Grimgrin'], ['Gravecrawler']));

    state.handler = (_req, res) => json(res, 200, { results: { included: [], almostIncluded: [] } });
    const retry = await findCombos(['Grimgrin'], ['Gravecrawler']);
    assert.strictEqual(retry.cached, false);
    assert.strictEqual(state.requests.length, 2);
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (failures > 0) {
    console.error(`\n${failures} Spellbook adapter checks failed.`);
    process.exit(1);
  }
  console.log('\nAll Spellbook adapter checks passed.');
}

main();
