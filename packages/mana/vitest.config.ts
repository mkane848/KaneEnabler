/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import { baseTestConfig } from '@mtg/config/vitest.base.js';

export default defineConfig({
  test: {
    ...baseTestConfig,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      ...baseTestConfig.coverage,
      // A floor at today's real numbers, not an aspiration — catches a
      // regression, doesn't block on hitting some target percentage.
      thresholds: { statements: 100, branches: 90, functions: 100, lines: 100 },
    },
  },
});
