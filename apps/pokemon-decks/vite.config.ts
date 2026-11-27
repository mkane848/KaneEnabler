import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
);

export default defineConfig({
  plugins: [react()],
  // '/' for a standalone run; the combined platform build
  // (scripts/build-platform.mjs at the repo root) sets '/pokemon/'. The card
  // snapshot is fetched through import.meta.env.BASE_URL for the same reason.
  base: process.env.VITE_BASE_PATH || '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
