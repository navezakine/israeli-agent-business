// memory/history.ts — durable conversation history & bot state in Supabase.
// Replaces the old better-sqlite3 store (which wiped on every Railway redeploy).
// Every function is best-effort: if Supabase is unreachable, reads return empty
// and writes log + no-op, so the bot keeps replying (degraded, never crashing).

import { getSupabase } from '../db/supabase.js';
import type { ConversationMessage } from '../types.js';

const COLD_WINDOW_MS = 24 * 60 * 60 * 1000;

// ── conversation messages (bot memory + analytics) ───────────────
export async function appendMessage(
  m: ConversationMessage & { hitl?: boolean; channel?: string },
): Promise<void> {
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
    channel: m.channel ?? 'whatsapp',
  });
  if (error) console.error('[history] appendMessage', error.message);
}

export async function getRecentMessages(
  clientId: string,
  phoneNumber: string,
  limit = 10,
  channel?: string,
): Promise<ConversationMessage[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const since = new Date(Date.now() - COLD_WINDOW_MS).toISOString();
  let query = sb
    .from('messages')
    .select('phone, role, content, intent, action, created_at')
    .eq('client_id', clientId)
    .eq('phone', phoneNumber)
    .gte('created_at', since);
  if (channel) query = query.eq('channel', channel);
  const { data, error } = await query
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
  channel?: string; // 'whatsapp' | 'instagram' | 'facebook'
  recipient?: string; // who to reply to on that channel (phone / IGSID / PSID)
  accountExternalId?: string; // which Meta page/IG account to send from
}

export async function setPending(p: HitlPending): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('hitl_pending').upsert(
    {
      client_id: p.clientId,
      patient_phone: p.patientPhone,
      draft: p.draftReply,
      channel: p.channel ?? 'whatsapp',
      recipient: p.recipient ?? p.patientPhone,
      account_external_id: p.accountExternalId ?? null,
    },
    { onConflict: 'client_id' },
  );
  if (error) console.error('[history] setPending', error.message);
}

export async function getPending(clientId: string): Promise<HitlPending | undefined> {
  const sb = getSupabase();
  if (!sb) return undefined;
  const { data, error } = await sb
    .from('hitl_pending')
    .select('client_id, patient_phone, draft, channel, recipient, account_external_id')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) {
    console.error('[history] getPending', error.message);
    return undefined;
  }
  if (!data) return undefined;
  return {
    clientId: data.client_id,
    patientPhone: data.patient_phone,
    draftReply: data.draft,
    channel: data.channel ?? 'whatsapp',
    recipient: data.recipient ?? data.patient_phone,
    accountExternalId: data.account_external_id ?? undefined,
  };
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

// ── review-request dedup ─────────────────────────────────────────
export async function wasReviewRequested(clientId: string, eventId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb
    .from('review_requests')
    .select('event_id')
    .eq('client_id', clientId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) {
    console.error('[history] wasReviewRequested', error.message);
    return false;
  }
  return Boolean(data);
}

/** Has this contact been asked for a review within the last `sinceMs`? */
export async function recentReviewForPhone(
  clientId: string,
  phone: string,
  sinceMs: number,
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { data, error } = await sb
    .from('review_requests')
    .select('event_id')
    .eq('client_id', clientId)
    .eq('phone', phone)
    .gte('sent_at', since)
    .limit(1);
  if (error) {
    console.error('[history] recentReviewForPhone', error.message);
    return false;
  }
  return Boolean(data && data.length);
}

export async function markReviewRequested(
  clientId: string,
  eventId: string,
  phone: string,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('review_requests')
    .upsert(
      { client_id: clientId, event_id: eventId, phone },
      { onConflict: 'client_id,event_id', ignoreDuplicates: true },
    );
  if (error) console.error('[history] markReviewRequested', error.message);
}

// ── waitlist ─────────────────────────────────────────────────────
export interface WaitlistEntry {
  clientId: string;
  phone: string;
  name?: string | null;
  channel: string;
  desiredDate?: string | null;
  note?: string | null;
  status: string;
}

export async function addWaitlist(
  clientId: string,
  phone: string,
  name: string | null,
  desiredDate: string | null,
  note: string | null,
  channel = 'whatsapp',
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('waitlist').upsert(
    {
      client_id: clientId,
      phone,
      name,
      desired_date: desiredDate,
      note,
      channel,
      status: 'open',
      offered_at: null,
      offered_slot: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,phone' },
  );
  if (error) console.error('[history] addWaitlist', error.message);
}

export async function getOpenWaitlist(clientId: string): Promise<WaitlistEntry[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('waitlist')
    .select('phone, name, channel, desired_date, note, status')
    .eq('client_id', clientId)
    .eq('status', 'open')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[history] getOpenWaitlist', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    clientId,
    phone: r.phone as string,
    name: (r.name as string) ?? null,
    channel: (r.channel as string) ?? 'whatsapp',
    desiredDate: (r.desired_date as string) ?? null,
    note: (r.note as string) ?? null,
    status: r.status as string,
  }));
}

export async function markWaitlistOffered(
  clientId: string,
  phone: string,
  slot: string,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('waitlist')
    .update({ status: 'offered', offered_at: new Date().toISOString(), offered_slot: slot, updated_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('phone', phone);
  if (error) console.error('[history] markWaitlistOffered', error.message);
}

/** Re-open offers that were not taken within the timeout, so the slot can go to the next person. */
export async function revertStaleWaitlistOffers(clientId: string, olderThanMs: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const { error } = await sb
    .from('waitlist')
    .update({ status: 'open', offered_slot: null, updated_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('status', 'offered')
    .lt('offered_at', cutoff);
  if (error) console.error('[history] revertStaleWaitlistOffers', error.message);
}

export async function expireOldWaitlist(clientId: string, olderThanMs: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const { error } = await sb
    .from('waitlist')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .in('status', ['open', 'offered'])
    .lt('created_at', cutoff);
  if (error) console.error('[history] expireOldWaitlist', error.message);
}

/** When a waitlisted patient books, close their entry. */
export async function markWaitlistBooked(clientId: string, phone: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('waitlist')
    .update({ status: 'booked', updated_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('phone', phone)
    .in('status', ['open', 'offered']);
  if (error) console.error('[history] markWaitlistBooked', error.message);
}

// ── Human handoff ────────────────────────────────────────────
// While a patient has an OPEN handoff, the bot stays silent for them.

/** Open (or refresh) a handoff for a patient. Returns true if it was newly opened. */
export async function openHandoff(
  clientId: string,
  phone: string,
  reason: string,
  question: string | null = null,
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const existing = await getOpenHandoff(clientId, phone);
  if (existing) return false; // already handed off; don't duplicate
  const { error } = await sb
    .from('handoffs')
    .insert({ client_id: clientId, phone, reason, question, status: 'open' });
  if (error) {
    console.error('[history] openHandoff', error.message);
    return false;
  }
  return true;
}

/** All open handoffs for a clinic (used to route an owner's answer to a patient). */
export async function getOpenHandoffs(
  clientId: string,
): Promise<Array<{ phone: string; question: string | null }>> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('handoffs')
    .select('phone, question')
    .eq('client_id', clientId)
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[history] getOpenHandoffs', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    phone: r.phone as string,
    question: (r.question as string) ?? null,
  }));
}

/** Whether this patient currently has an open handoff. */
export async function getOpenHandoff(
  clientId: string,
  phone: string,
): Promise<{ phone: string; reason: string | null } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('handoffs')
    .select('phone, reason')
    .eq('client_id', clientId)
    .eq('phone', phone)
    .eq('status', 'open')
    .maybeSingle();
  if (error) {
    console.error('[history] getOpenHandoff', error.message);
    return null;
  }
  return data ? { phone: data.phone as string, reason: (data.reason as string) ?? null } : null;
}

/** Resolve an open handoff by exact phone. Returns true if one was resolved. */
export async function resolveHandoff(clientId: string, phone: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb
    .from('handoffs')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('phone', phone)
    .eq('status', 'open')
    .select('phone');
  if (error) {
    console.error('[history] resolveHandoff', error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Resolve an open handoff identified by the last 4 digits of the phone (what the
 * clinic types). If last4 is empty and exactly one handoff is open, resolve that
 * one. Returns the resolved phone, or null if nothing matched / ambiguous.
 */
export async function resolveHandoffByLast4(
  clientId: string,
  last4: string,
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('handoffs')
    .select('phone')
    .eq('client_id', clientId)
    .eq('status', 'open');
  if (error) {
    console.error('[history] resolveHandoffByLast4', error.message);
    return null;
  }
  const open = (data ?? []).map((r) => r.phone as string);
  let phone: string | null = null;
  if (last4) {
    const matches = open.filter((p) => p.replace(/\D/g, '').endsWith(last4));
    if (matches.length === 1) phone = matches[0];
  } else if (open.length === 1) {
    phone = open[0];
  }
  if (!phone) return null;
  return (await resolveHandoff(clientId, phone)) ? phone : null;
}

/** Housekeeping: auto-resolve handoffs older than maxAgeMs so the bot never stays stuck. */
export async function expireOldHandoffs(clientId: string, olderThanMs: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const { error } = await sb
    .from('handoffs')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('status', 'open')
    .lt('created_at', cutoff);
  if (error) console.error('[history] expireOldHandoffs', error.message);
}

// ── Self-improving FAQ ───────────────────────────────────────
// Owner answers to escalated questions become suggestions; once approved
// they are injected into the agent's knowledge base (see db/profile.ts).

/** Record a (question, answer) pair the owner provided, pending their approval. */
export async function createFaqSuggestion(
  clientId: string,
  question: string,
  answer: string,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('faq_suggestions')
    .insert({ client_id: clientId, question, answer, status: 'pending' });
  if (error) console.error('[history] createFaqSuggestion', error.message);
}

/** Approved Q&A pairs, injected into the system prompt at runtime. */
export async function getApprovedFaqs(
  clientId: string,
): Promise<Array<{ question: string; answer: string }>> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('faq_suggestions')
    .select('question, answer')
    .eq('client_id', clientId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[history] getApprovedFaqs', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ question: r.question as string, answer: r.answer as string }));
}

/**
 * Set the status of the most recent PENDING suggestion (what the owner approves
 * via WhatsApp with "הוסף" / dismisses with "דלג"). Returns the question text of
 * the affected suggestion, or null if there was no pending suggestion.
 */
export async function decideLatestFaqSuggestion(
  clientId: string,
  status: 'approved' | 'dismissed',
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('faq_suggestions')
    .select('id, question')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const { error: upErr } = await sb
    .from('faq_suggestions')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', data.id as number);
  if (upErr) {
    console.error('[history] decideLatestFaqSuggestion', upErr.message);
    return null;
  }
  return data.question as string;
}
