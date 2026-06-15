// reminders/reviews.ts — automatic Google review requests after a completed appointment.
// Triggered by /cron/run. Sends one friendly WhatsApp message per finished
// appointment, daytime only, deduped, with a per-patient cooldown.

import type { ClientConfig } from '../types.js';
import * as whatsapp from '../twilio/whatsapp.js';
import { getSupabase } from '../db/supabase.js';
import {
  wasReviewRequested,
  recentReviewForPhone,
  markReviewRequested,
} from '../memory/history.js';

const REVIEW_DELAY_HOURS = 3; // wait this long after the appointment ends
const MAX_AGE_DAYS = 7; // never ask about visits older than this
const PER_PATIENT_DAYS = 30; // do not re-ask the same person within this window
const DAY_START = 9; // local send window (Asia/Jerusalem)
const DAY_END = 20;

interface ReviewResult {
  checked: number;
  sent: Array<{ to: string; name?: string | null; body?: string }>;
  skipped: string[];
}

function nameFromTitle(title: string | null): string | null {
  if (!title) return null;
  const parts = title.split(/\s[—·-]\s/);
  return parts.length > 1 ? parts.slice(1).join(' ').trim() : null;
}

function localHour(tz: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(
      new Date(),
    ),
  );
}

function buildMessage(name: string | null, url: string): string {
  const greet = name ? `היי ${name}!` : 'היי!';
  return `${greet} 🌸 תודה שהגעת אלינו. אם היה לך טוב, נשמח אם תדרג/י אותנו בגוגל בדקה אחת, זה עוזר לנו המון: ${url} תודה ושיהיה המשך יום מקסים 💛`;
}

export async function runReviewRequests(
  config: ClientConfig,
  opts: { dryRun?: boolean } = {},
): Promise<ReviewResult> {
  const result: ReviewResult = { checked: 0, sent: [], skipped: [] };

  if (!config.googleReviewUrl) {
    result.skipped.push('no-review-url');
    return result;
  }
  const sb = getSupabase();
  if (!sb) {
    result.skipped.push('no-db');
    return result;
  }
  if (!opts.dryRun && !whatsapp.isConfigured()) {
    result.skipped.push('twilio-not-configured');
    return result;
  }
  // daytime gate (skipped runs simply retry later; dedup prevents duplicates)
  const hour = localHour(config.timezone);
  if (!opts.dryRun && (hour < DAY_START || hour >= DAY_END)) {
    result.skipped.push('outside-hours');
    return result;
  }

  const now = Date.now();
  const slotMs = config.slotDurationMinutes * 60_000;
  const minStart = new Date(now - MAX_AGE_DAYS * 86_400_000).toISOString();
  // prefilter: appointments that started at least REVIEW_DELAY_HOURS ago, within the last week
  const { data, error } = await sb
    .from('appointments')
    .select('google_event_id, patient_phone, title, start_at')
    .eq('client_id', config.clientId)
    .gte('start_at', minStart)
    .lte('start_at', new Date(now - REVIEW_DELAY_HOURS * 3_600_000).toISOString())
    .order('start_at', { ascending: false })
    .limit(200);
  if (error) {
    result.skipped.push(`query-failed:${error.message}`);
    return result;
  }
  result.checked = (data ?? []).length;

  for (const a of data ?? []) {
    const eventId = a.google_event_id as string | null;
    const phone = a.patient_phone as string | null;
    const startAt = a.start_at as string | null;
    if (!eventId || !phone || !startAt) continue;

    // precise "ended + delay" check
    const dueAt = new Date(startAt).getTime() + slotMs + REVIEW_DELAY_HOURS * 3_600_000;
    if (now < dueAt) continue;

    // v1: only phone-based contacts (WhatsApp). IG/FB review requests come later.
    if (!/^\+?\d{7,}$/.test(phone)) continue;

    if (await wasReviewRequested(config.clientId, eventId)) continue;
    if (await recentReviewForPhone(config.clientId, phone, PER_PATIENT_DAYS * 86_400_000)) {
      result.skipped.push(`${phone}:recent`);
      continue;
    }

    const name = nameFromTitle(a.title as string | null);
    const body = buildMessage(name, config.googleReviewUrl);

    if (opts.dryRun) {
      result.sent.push({ to: phone, name, body });
      continue;
    }

    try {
      await whatsapp.sendWhatsApp(phone, body);
      await markReviewRequested(config.clientId, eventId, phone);
      result.sent.push({ to: phone });
    } catch (err) {
      console.error('[reviews] send failed', err);
      result.skipped.push(`${phone}:send-failed`);
    }
  }
  return result;
}
