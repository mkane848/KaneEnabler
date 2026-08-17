/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Defense in depth against a stale/concurrent `dist/` build (tsc mirrors
    // src/ into dist/, so an existing build could otherwise surface every
    // test twice — once from source, once compiled). tsconfig.build.json
    // excludes *.test.ts from the build itself, which is the real fix.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
