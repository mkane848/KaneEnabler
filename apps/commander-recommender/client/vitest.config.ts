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
        // Component coverage is a meaningful first subset (ResultFilters,
        // LikeDislikeButtons, CommanderCard), not exhaustive — see
        // docs/handoff.md's Phase 6 note. This floor is today's real number.
        thresholds: { statements: 35, branches: 35, functions: 35, lines: 35 },
      },
    },
  }),
);
