// db/supabase.ts — lazy Supabase client (service role; bypasses RLS).
// The bot writes/reads durable state here, replacing the old ephemeral SQLite.
// Created lazily so env vars (loaded in env.ts) are present before first use.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';

let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — persistence disabled');
    cached = null;
    return cached;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Railway runs Node 20 (no native WebSocket). We never use realtime, but
    // supabase-js needs a transport at construction — hand it the `ws` package.
    realtime: { transport: ws as unknown as never },
  });
  return cached;
}
