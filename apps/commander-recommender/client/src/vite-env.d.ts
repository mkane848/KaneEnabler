/// <reference types="vite/client" />

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
