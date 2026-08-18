/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import { baseTestConfig } from '@mtg/config/vitest.base.js';

export default defineConfig({
  test: {
    ...baseTestConfig,
    environment: 'node',
    // Defense in depth against a stale/concurrent `dist/` build (tsc mirrors
    // src/ into dist/, so an existing build could otherwise surface every
    // test twice — once from source, once compiled). tsconfig.build.json
    // excludes *.test.ts from the build itself, which is the real fix.
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      ...baseTestConfig.coverage,
      // db.ts, the Express routes, and the snapshot-cache helpers are
      // untested today (no request-level integration test exists yet — see
      // docs/handoff.md's Verification section). This floor is today's real
      // number, not a target.
      thresholds: { statements: 70, branches: 60, functions: 65, lines: 70 },
    },
  },
});
