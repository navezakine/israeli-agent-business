// db/settings.ts — per-client toggles the dashboard flips and the bot obeys.
// Source of truth is the Supabase `client_settings` row; falls back to safe
// defaults (everything on, HITL off) if the row or DB is missing.

import { getSupabase } from './supabase.js';

export interface Toggles {
  botActive: boolean;
  autoReply: boolean;
  remindersEnabled: boolean;
  followupsEnabled: boolean;
  hitlEnabled: boolean;
  reminderHours: number[] | null; // null → use config.json default
}

const DEFAULTS: Toggles = {
  botActive: true,
  autoReply: true,
  remindersEnabled: true,
  followupsEnabled: true,
  hitlEnabled: false,
  reminderHours: null,
};

export async function getToggles(clientId: string): Promise<Toggles> {
  const sb = getSupabase();
  if (!sb) return DEFAULTS;
  const { data, error } = await sb
    .from('client_settings')
    .select('bot_active, auto_reply, reminders_enabled, followups_enabled, hitl_enabled, reminder_hours')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[settings] getToggles', error.message);
    return DEFAULTS;
  }
  return {
    botActive: data.bot_active,
    autoReply: data.auto_reply,
    remindersEnabled: data.reminders_enabled,
    followupsEnabled: data.followups_enabled,
    hitlEnabled: data.hitl_enabled,
    reminderHours: data.reminder_hours ?? null,
  };
}
