/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import { baseTestConfig } from '@mtg/config/vitest.base.js';

export default defineConfig({
  test: {
    ...baseTestConfig,
    environment: 'node',
    coverage: {
      ...baseTestConfig.coverage,
      thresholds: { statements: 100, branches: 90, functions: 100, lines: 100 },
    },
  },
});
