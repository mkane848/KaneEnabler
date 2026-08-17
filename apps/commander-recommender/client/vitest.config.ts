/// <reference types="vitest/config" />
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Every test today is pure-logic (no component rendering), so the default
// 'node' environment is fine — jsdom only gets added if that changes.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
    },
  }),
);
