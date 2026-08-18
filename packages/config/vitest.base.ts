import type { TestUserConfig } from 'vitest/config';

/**
 * Vitest 4's own coverage defaults exclude nothing (`coverageConfigDefaults.exclude`
 * is `[]`) — without this, the v8 provider can pull dependency code loaded from
 * `node_modules` into the report alongside actual source. `index.{ts,js}` is
 * every package's pure re-export barrel (no branches/statements of its own to
 * cover) except commander-recommender/server's, which is its Express bootstrap
 * (`app.listen(...)`) — neither is something a unit test threshold should judge.
 */
const COVERAGE_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.config.*',
  '**/*.d.ts',
  '**/test/**',
  '**/*.test.{ts,tsx,js,mjs}',
  '**/*.css',
  '**/index.{ts,js}',
];

export const baseTestConfig = {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html'],
    // Vitest only includes files actually loaded by a test by default — an
    // explicit `include` is what makes an untested file show up as 0%
    // instead of being silently omitted from the report (and the
    // percentage). `@mtg/profile` reported 100% before this was set,
    // covering only the one file (`comboKey.ts`) that had a test at all.
    include: ['src/**'],
    exclude: COVERAGE_EXCLUDE,
  },
} satisfies TestUserConfig;
