import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase powers accounts (Google, email + password, phone + password) and
 * cloud storage. Values come from build-time env vars (set as GitHub repo
 * secrets/variables). The anon key is public by design — data is protected by
 * Row Level Security in supabase/schema.sql, so each user can only ever read
 * or write their own row.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudEnabled = Boolean(url && key);

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null;
