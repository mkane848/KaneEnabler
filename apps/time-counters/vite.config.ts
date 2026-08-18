import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
);

export default defineConfig({
  plugins: [react()],
  // Unset (the default '/') for this app's own standalone deploy; the
  // combined-platform build (scripts/build-platform.mjs at the repo root)
  // sets this to '/time-counters/' so the app's assets and its own
  // `${import.meta.env.BASE_URL}cards.json` fetch resolve correctly when
  // served from a subpath alongside the other tools.
  base: process.env.VITE_BASE_PATH || '/',
  // Baked in at build time so the About modal can show a version without
  // shipping the rest of package.json (scripts, devDependencies) to the client.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
