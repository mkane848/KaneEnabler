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
      // Every source file is tested now (useAuth, useCardPreferences,
      // useComboPreferences, rows, client, comboKey) — a regression floor a
      // little below the real current numbers (~95% statements/lines, ~92%
      // branches, 100% functions), not an aspirational target.
      thresholds: { statements: 90, branches: 85, functions: 95, lines: 95 },
    },
  },
});
