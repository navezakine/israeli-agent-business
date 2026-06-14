// db/profile.ts — overlay dashboard-editable profile fields (address,
// business hours) from Supabase onto the file-based config.json. Falls back
// silently to the config.json values if Supabase is missing or has no row.

import { getSupabase } from './supabase.js';
import type { ClientConfig } from '../types.js';

export async function applyClientOverrides(config: ClientConfig): Promise<ClientConfig> {
  const sb = getSupabase();
  if (!sb) return config;
  const { data, error } = await sb
    .from('clients')
    .select('address, business_hours')
    .eq('client_id', config.clientId)
    .maybeSingle();
  if (error || !data) return config;
  if (data.address != null) config.address = data.address;
  if (data.business_hours) config.businessHours = data.business_hours;
  return config;
}
