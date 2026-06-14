// memory/history.ts — durable conversation history & bot state in Supabase.
// Replaces the old better-sqlite3 store (which wiped on every Railway redeploy).
// Every function is best-effort: if Supabase is unreachable, reads return empty
// and writes log + no-op, so the bot keeps replying (degraded, never crashing).

import { getSupabase } from '../db/supabase.js';
import type { ConversationMessage } from '../types.js';

const COLD_WINDOW_MS = 24 * 60 * 60 * 1000;

// ── conversation messages (bot memory + analytics) ───────────────
export async function appendMessage(m: ConversationMessage & { hitl?: boolean }): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('messages').insert({
    client_id: m.clientId,
    phone: m.phoneNumber,
    role: m.role,
    content: m.content,
    intent: m.intent ?? null,
    action: m.actionTaken ?? null,
    hitl: m.hitl ?? false,
  });
  if (error) console.error('[history] appendMessage', error.message);
}

export async function getRecentMessages(
  clientId: string,
  phoneNumber: string,
  limit = 10,
): Promise<ConversationMessage[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const since = new Date(Date.now() - COLD_WINDOW_MS).toISOString();
  const { data, error } = await sb
    .from('messages')
    .select('phone, role, content, intent, action, created_at')
    .eq('client_id', clientId)
    .eq('phone', phoneNumber)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[history] getRecentMessages', error.message);
    return [];
  }
  return (data ?? [])
    .reverse()
    .map((r) => ({
      clientId,
      phoneNumber: r.phone as string,
      role: r.role as 'user' | 'assistant',
      content: r.content as string,
      intent: (r.intent as string) ?? undefined,
      actionTaken: (r.action as string) ?? undefined,
      timestamp: new Date(r.created_at as string),
    }));
}

// ── reminders dedup ──────────────────────────────────────────────
export async function wasReminderSent(
  clientId: string,
  eventId: string,
  bucket: number,
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb
    .from('reminders_sent')
    .select('event_id')
    .eq('client_id', clientId)
    .eq('event_id', eventId)
    .eq('bucket', bucket)
    .maybeSingle();
  if (error) {
    console.error('[history] wasReminderSent', error.message);
    return false;
  }
  return Boolean(data);
}

export async function markReminderSent(
  clientId: string,
  eventId: string,
  bucket: number,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('reminders_sent')
    .upsert(
      { client_id: clientId, event_id: eventId, bucket },
      { onConflict: 'client_id,event_id,bucket', ignoreDuplicates: true },
    );
  if (error) console.error('[history] markReminderSent', error.message);
}

// ── HITL pending draft (one per client) ──────────────────────────
export interface HitlPending {
  clientId: string;
  patientPhone: string;
  draftReply: string;
  intent?: string;
  actionTaken?: string;
}

export async function setPending(p: HitlPending): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('hitl_pending')
    .upsert(
      { client_id: p.clientId, patient_phone: p.patientPhone, draft: p.draftReply },
      { onConflict: 'client_id' },
    );
  if (error) console.error('[history] setPending', error.message);
}

export async function getPending(clientId: string): Promise<HitlPending | undefined> {
  const sb = getSupabase();
  if (!sb) return undefined;
  const { data, error } = await sb
    .from('hitl_pending')
    .select('client_id, patient_phone, draft')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) {
    console.error('[history] getPending', error.message);
    return undefined;
  }
  if (!data) return undefined;
  return { clientId: data.client_id, patientPhone: data.patient_phone, draftReply: data.draft };
}

export async function clearPending(clientId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('hitl_pending').delete().eq('client_id', clientId);
  if (error) console.error('[history] clearPending', error.message);
}

// ── leads (with recovered/lost lifecycle) ────────────────────────
export interface Lead {
  clientId: string;
  phone: string;
  stage: number;
  dueAt: number;
}

/** Record/refresh an open lead (booking interest, not yet booked). Resets stage. */
export async function upsertLead(clientId: string, phone: string, dueAt: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('leads').upsert(
    {
      client_id: clientId,
      phone,
      stage: 0,
      status: 'open',
      due_at: new Date(dueAt).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,phone' },
  );
  if (error) console.error('[history] upsertLead', error.message);
}

export async function clearLead(clientId: string, phone: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('leads').delete().eq('client_id', clientId).eq('phone', phone);
  if (error) console.error('[history] clearLead', error.message);
}

export async function advanceLead(
  clientId: string,
  phone: string,
  stage: number,
  dueAt: number,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('leads')
    .update({ stage, due_at: new Date(dueAt).toISOString(), updated_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('phone', phone);
  if (error) console.error('[history] advanceLead', error.message);
}

/** A lead booked. If we had already nudged it (stage ≥ 1), count it as RECOVERED;
 *  otherwise it booked on its own — just remove it. */
export async function markBookedLead(clientId: string, phone: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb
    .from('leads')
    .select('stage')
    .eq('client_id', clientId)
    .eq('phone', phone)
    .maybeSingle();
  if (error) {
    console.error('[history] markBookedLead lookup', error.message);
    return;
  }
  if (!data) return; // no lead tracked
  if ((data.stage as number) >= 1) {
    const { error: upErr } = await sb
      .from('leads')
      .update({ status: 'recovered', recovered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('phone', phone);
    if (upErr) console.error('[history] markBookedLead recover', upErr.message);
  } else {
    await clearLead(clientId, phone);
  }
}

/** Final nudge sent, no booking → close it out as lost. */
export async function markLeadLost(clientId: string, phone: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('leads')
    .update({ status: 'lost', updated_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('phone', phone);
  if (error) console.error('[history] markLeadLost', error.message);
}

/** Open leads whose follow-up is due (due_at <= now). */
export async function getDueLeads(clientId: string, now: number): Promise<Lead[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('leads')
    .select('phone, stage, due_at')
    .eq('client_id', clientId)
    .eq('status', 'open')
    .lte('due_at', new Date(now).toISOString());
  if (error) {
    console.error('[history] getDueLeads', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    clientId,
    phone: r.phone as string,
    stage: r.stage as number,
    dueAt: new Date(r.due_at as string).getTime(),
  }));
}
