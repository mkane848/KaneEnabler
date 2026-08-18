import { afterEach, describe, expect, it, vi } from 'vitest';

// `supabase` is computed once, at module evaluation time, from
// import.meta.env — so exercising both branches means re-importing the
// module fresh under each env, not just calling an exported function.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('supabase client', () => {
  it('is null when VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY are unset', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    const { supabase } = await import('./client');
    expect(supabase).toBeNull();
  });

  it('is null when only one of the two vars is set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    const { supabase } = await import('./client');
    expect(supabase).toBeNull();
  });

  it('is a real client when both vars are set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    const { supabase } = await import('./client');
    expect(supabase).not.toBeNull();
    expect(supabase!.from).toBeInstanceOf(Function);
  });
});
