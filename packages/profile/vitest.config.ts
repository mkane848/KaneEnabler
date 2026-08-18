/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import { baseTestConfig } from '@mtg/config/vitest.base.js';

export default defineConfig({
  test: {
    ...baseTestConfig,
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      ...baseTestConfig.coverage,
      // Only comboKey.ts is tested today — the Supabase-backed hooks
      // (useAuth, useCardPreferences, useComboPreferences) and rows.ts have
      // none yet. This floor reflects that honestly rather than hiding it;
      // see docs/handoff.md's Phase 6 note on this package.
      thresholds: { statements: 5, branches: 0, functions: 5, lines: 10 },
    },
  },
});
