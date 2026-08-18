// Consumed straight from source by a Vite app (no build step of its own —
// see the root CLAUDE.md on how packages/* work), so this package's own
// `tsc` needs its own ambient declaration for the env vars it reads in
// client.ts, the same way each app declares its own in vite-env.d.ts.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
