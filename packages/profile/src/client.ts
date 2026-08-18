import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * Profile features are additive — the rest of the app works with zero
 * Supabase setup — so a missing/unfilled .env degrades to `null` here
 * rather than throwing at import time and breaking everything else.
 * Callers check `configured` (see `useAuth`) rather than assuming this
 * is non-null.
 */
export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
