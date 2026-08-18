import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The root package.json's version is the single source of truth for the
// app's version (see CHANGELOG.md) — read it once at build time rather than
// hardcoding the number a second place in the About dialog, where it would
// inevitably drift from reality after the first missed bump.
const rootPackageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8'),
) as { version: string };

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// The commit HEAD was built from, as the About dialog's "last updated"
// timestamp. Every real deploy (Render, per DEPLOY.md) builds from a fresh
// checkout of whatever was just pushed to main, so this lands within
// seconds of the actual release — closer than anything hand-maintained,
// and with no extra step to forget. Falls back to the literal build time
// if `git` isn't available (a source tarball with no `.git`, say), so the
// dialog degrades to "somewhat approximate" rather than crashing the build.
function getBuildDate(): string {
  try {
    return execSync('git log -1 --format=%cI', { cwd: repoRoot }).toString().trim();
  } catch {
    return new Date().toISOString();
  }
}

export default defineConfig({
  plugins: [react()],
  // Unset (the default '/') for this app's own standalone deploy; the
  // combined-platform build (scripts/build-platform.mjs at the repo root)
  // sets this to '/recommender/' so assets and router.tsx's basepath
  // (read from import.meta.env.BASE_URL at runtime) resolve correctly when
  // served from a subpath alongside the other tools.
  base: process.env.VITE_BASE_PATH || '/',
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version),
    __APP_BUILD_DATE__: JSON.stringify(getBuildDate()),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
