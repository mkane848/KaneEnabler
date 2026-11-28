/**
 * Regression guard for docs/api-policy.md: every outbound request in the
 * workspace is issued from a file on the allowlist below, and every file that
 * talks to Scryfall or Commander Spellbook sends an identifying User-Agent.
 *
 * This is deliberately a static scan, not a runtime check. The policy's
 * riskiest failure is a refactor that quietly adds a new call site — a fetch
 * moved into a loader, a second helper that skips the shared headers — and a
 * runtime test only sees the paths it happens to exercise. A new entry here is
 * the moment to read the policy and, per AGENTS.md hard rule 1, confirm the
 * change with the repo owner.
 *
 * It lives in this package only because the server's Vitest runs in Node with
 * filesystem access; it scans the whole workspace.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

const SCANNED_DIRS = [
  'apps/commander-recommender/server/src',
  'apps/commander-recommender/server/scripts',
  'apps/commander-recommender/client/src',
  'apps/home/src',
  'apps/time-counters/src',
  'apps/time-counters/scripts',
  'apps/pokemon-decks/src',
  'apps/pokemon-decks/scripts',
  'packages',
  'scripts',
];

// No blanket `data` skip: generated data is JSON, which the walk ignores by
// extension anyway, and an app's own src/data/ is exactly where a fetch lives.
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo', '__fixtures__']);
const SOURCE_FILE = /\.(c|m)?(j|t)sx?$/;
const TEST_FILE = /\.test\.(c|m)?(j|t)sx?$/;

interface CallSite {
  why: string;
  /** Reaches a service we don't run, so it must identify itself. */
  thirdParty: boolean;
  /**
   * Set when the file forwards headers its callers supply instead of building
   * them: the User-Agent check then moves to every file that imports one of
   * these functions.
   */
  headersFromCallerOf?: string[];
}

/** Every file allowed to issue a request, and why. Paths are repo-relative. */
const ALLOWED_CALL_SITES: Record<string, CallSite> = {
  'packages/scryfall/src/bulkData.js': {
    why: 'The Scryfall bulk-data choke point; callers pass the shared headers in.',
    thirdParty: true,
    headersFromCallerOf: ['ensureOracleCardsSnapshot', 'fetchOracleCardsEntry', 'downloadBulkFile'],
  },
  'apps/commander-recommender/server/scripts/fetch-scryfall.ts': {
    why: 'Creature-type catalog + bulk download, with SCRYFALL_HEADERS from buildUserAgent.',
    thirdParty: true,
  },
  'apps/commander-recommender/server/src/services/spellbook.ts': {
    why: 'The only Commander Spellbook call; click-triggered, cached, with its own HEADERS.',
    thirdParty: true,
  },
  'packages/rules/scripts/ingest-cr.mjs': {
    why: 'Comprehensive Rules ingestion (Phase 3a), run by hand or monthly in cr-refresh.yml.',
    thirdParty: false,
  },
  'packages/api-client/src/wakeRetry.ts': {
    why: 'Our own recommender server, with the shared wake-retry budget.',
    thirdParty: false,
  },
  'apps/commander-recommender/client/src/api/client.ts': {
    why: 'Our own recommender server (health ping, /api/meta).',
    thirdParty: false,
  },
  'apps/pokemon-decks/scripts/build-snapshot.mjs': {
    why: "TCGdex's image manifest (assets.tcgdex.net/datas.json), once per monthly snapshot refresh.",
    thirdParty: true,
  },
  'apps/pokemon-decks/src/data/catalog.ts': {
    why: "The app's own vendored card snapshot (public/data/), served alongside it.",
    thirdParty: false,
  },
  'apps/time-counters/src/utils/cardCatalog.ts': {
    why: "The app's own static cards.json, served alongside it.",
    thirdParty: false,
  },
};

/**
 * Anything that issues an HTTP request. `(?<![\w$])fetch` keeps TanStack
 * Query's `refetch(` out while still catching `globalThis.fetch(`.
 */
const REQUEST_PATTERN =
  /(?<![\w$])fetch\s*\(|\bhttps?\.(get|request)\s*\(|new\s+XMLHttpRequest\b|\bsendBeacon\s*\(|\baxios\b/;
const THIRD_PARTY_HOSTS = /scryfall\.(com|io)|commanderspellbook\.com/i;
const USER_AGENT = /User-Agent|buildUserAgent/;

function walk(dir: string, out: string[]): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walk(full, out);
    } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

const sourceFiles = SCANNED_DIRS.flatMap((dir) => walk(path.join(REPO_ROOT, dir), []));
const sources = sourceFiles.map((file) => ({
  rel: path.relative(REPO_ROOT, file).split(path.sep).join('/'),
  code: stripComments(readFileSync(file, 'utf8')),
}));
const callSites = sources.filter(({ code }) => REQUEST_PATTERN.test(code));

describe('API policy: outbound request call sites', () => {
  it('scans a plausible number of files (guards against a broken REPO_ROOT)', () => {
    expect(sourceFiles.length).toBeGreaterThan(100);
  });

  it('issues requests only from allowlisted files', () => {
    const unexpected = callSites.map((c) => c.rel).filter((rel) => !(rel in ALLOWED_CALL_SITES));
    expect(
      unexpected,
      'New outbound call site. Read docs/api-policy.md, confirm with the repo owner (AGENTS.md ' +
        'hard rule 1), then add it to ALLOWED_CALL_SITES with the reason.',
    ).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    const found = new Set(callSites.map((c) => c.rel));
    expect(Object.keys(ALLOWED_CALL_SITES).filter((rel) => !found.has(rel))).toEqual([]);
  });

  it('sends a User-Agent from every file that calls a third party', () => {
    const missing = callSites
      .filter(({ rel }) => {
        const site = ALLOWED_CALL_SITES[rel];
        return site?.thirdParty && !site.headersFromCallerOf;
      })
      .filter(({ code }) => !USER_AGENT.test(code))
      .map((c) => c.rel);
    expect(missing).toEqual([]);
  });

  it('builds a User-Agent in every caller of a header-forwarding helper', () => {
    const forwarded = Object.entries(ALLOWED_CALL_SITES).flatMap(([rel, site]) =>
      (site.headersFromCallerOf ?? []).map((fn) => ({ rel, fn })),
    );
    const callers = sources.filter(
      ({ rel, code }) =>
        !(rel in ALLOWED_CALL_SITES) &&
        // A package's own index re-exports the helper without calling it.
        !rel.endsWith('/src/index.js') &&
        forwarded.some(({ fn }) => new RegExp(`\\b${fn}\\s*\\(`).test(code)),
    );
    // Proves the check below is looking at something.
    expect(callers.length).toBeGreaterThan(0);
    expect(callers.filter(({ code }) => !USER_AGENT.test(code)).map((c) => c.rel)).toEqual([]);
  });

  it('names Scryfall/Spellbook hosts only in third-party call sites', () => {
    const offenders = callSites
      .filter(({ code }) => THIRD_PARTY_HOSTS.test(code))
      .filter(({ rel }) => !ALLOWED_CALL_SITES[rel]?.thirdParty)
      .map((c) => c.rel);
    expect(offenders).toEqual([]);
  });
});
