#!/usr/bin/env node
// Builds the combined platform static site: apps/home at the root, with
// apps/commander-recommender/client and apps/time-counters built under
// their own subpaths (/recommender, /time-counters) and copied in
// alongside it. This is what kaneenabler-platform's Render buildCommand
// runs — see render.yaml's comment on that service for why a merged
// static site exists at all instead of the three separate ones.
//
// Each sub-app keeps building fine standalone (its own vite.config.ts
// defaults `base` to '/' unless VITE_BASE_PATH is set) — this script is
// the only thing that ever sets VITE_BASE_PATH, so nothing here changes
// how `pnpm --filter <app> run build` behaves outside this script.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outDir = new URL('../dist-platform/', import.meta.url);

function run(filter, script, env = {}) {
  execFileSync('pnpm', ['--filter', filter, 'run', script], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

run('mtg-platform-home', 'build');
cpSync(new URL('../apps/home/dist/', import.meta.url), outDir, { recursive: true });

// VITE_API_URL is already set in the environment by render.yaml's
// buildCommand (Render fills in ${SERVER_HOST} itself before this script
// ever runs) — passed through here, not re-derived.
run('mtg-recommender-client', 'build', { VITE_BASE_PATH: '/recommender/' });
cpSync(new URL('../apps/commander-recommender/client/dist/', import.meta.url), new URL('recommender/', outDir), {
  recursive: true,
});

// fetch-cards needs to run before build, same as this app's own `pnpm run
// build` (its prebuild script) — but that prebuild script only runs
// ensure-catalog (the small committed seed), not a live Scryfall fetch, so
// fetch-cards is called explicitly here to match render.yaml's own
// buildCommand for the standalone drwho-companion-edh service.
run('mtg-time-tracker', 'fetch-cards');
run('mtg-time-tracker', 'build', { VITE_BASE_PATH: '/time-counters/' });
cpSync(new URL('../apps/time-counters/dist/', import.meta.url), new URL('time-counters/', outDir), {
  recursive: true,
});
