/// <reference types="vite/client" />
// moduleResolution "bundler" doesn't map `node:`-prefixed specifiers (used by
// this app's test files, e.g. `node:assert`) to @types/node the way "node16"
// does elsewhere in this repo — this reference is what makes them resolve.
/// <reference types="node" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by vite.config.ts from the root package.json's version field. */
declare const __APP_VERSION__: string;

/** Injected by vite.config.ts: an ISO timestamp for the commit this build
 * came from (falls back to the literal build time outside a git checkout). */
declare const __APP_BUILD_DATE__: string;
