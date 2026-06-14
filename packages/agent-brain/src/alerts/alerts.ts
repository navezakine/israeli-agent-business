// alerts/alerts.ts — operator error alerts.
// MVP channel: WhatsApp to the operator (ALERT_WHATSAPP, falling back to
// HITL_APPROVER_WHATSAPP). Can be swapped for email (Agent Mail) later.
// Throttled per-context so a recurring error can't spam.

import * as whatsapp from '../twilio/whatsapp.js';

const THROTTLE_MS = 5 * 60 * 1000;
const lastSent = new Map<string, number>();

export async function notifyError(context: string, err: unknown): Promise<void> {
  const to = process.env.ALERT_WHATSAPP || process.env.HITL_APPROVER_WHATSAPP;
  if (!to || !whatsapp.isConfigured()) return;

  const now = Date.now();
  if ((lastSent.get(context) ?? 0) > now - THROTTLE_MS) return;
  lastSent.set(context, now);

  const detail = err instanceof Error ? err.message : String(err);
  const body = `⚠️ Agent error — ${context}\n${detail}`.slice(0, 600);
  try {
    await whatsapp.sendWhatsApp(to, body);
  } catch (e) {
    console.error('[alerts] failed to send', e);
  }
}
