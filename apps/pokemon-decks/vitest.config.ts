/// <reference types="vitest/config" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { baseTestConfig } from '@mtg/config/vitest.base.js';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      ...baseTestConfig,
      // The snapshot scripts declare `@vitest-environment node` themselves.
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
      coverage: {
        ...baseTestConfig.coverage,
        include: ['src/**/*.{ts,tsx}', 'scripts/**/*.mjs'],
        exclude: [
          ...(baseTestConfig.coverage.exclude ?? []),
          'src/main.tsx',
          'scripts/build-snapshot.mjs',
        ],
        thresholds: { statements: 70, branches: 60, functions: 65, lines: 70 },
      },
    },
  }),
);
