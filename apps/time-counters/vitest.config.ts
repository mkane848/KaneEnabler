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
        thresholds: { statements: 65, branches: 55, functions: 55, lines: 70 },
      },
    },
  }),
);
