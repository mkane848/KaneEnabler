/// <reference types="vitest/config" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { baseTestConfig } from '@mtg/config/vitest.base.js';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      ...baseTestConfig,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      coverage: {
        ...baseTestConfig.coverage,
        // First test coverage this app has ever had (the profile page) —
        // Landing/RootLayout/main.tsx are untested, same "meaningful first
        // subset, not exhaustive" story as commander-recommender/client's
        // own floor (see that app's vitest.config.ts).
        thresholds: { statements: 25, branches: 25, functions: 25, lines: 25 },
      },
    },
  }),
);
