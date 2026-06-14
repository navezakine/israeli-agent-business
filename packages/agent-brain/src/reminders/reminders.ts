// reminders/reminders.ts — appointment reminder engine
// Called by the /cron/reminders endpoint. For each upcoming calendar event, sends
// a Hebrew WhatsApp reminder at each configured lead time (config.reminderHours),
// deduped so each fires exactly once.

import type { ClientConfig } from '../types.js';
import { getUpcomingEvents } from '../calendar/google.js';
import * as whatsapp from '../twilio/whatsapp.js';
import { wasReminderSent, markReminderSent } from '../memory/history.js';

// How close to the target lead time a cron tick must be to fire (hours).
// Must be ≥ half the cron interval so the window is never skipped.
const WINDOW_HOURS = 0.75;

interface ReminderResult {
  checked: number;
  sent: Array<{ to: string; bucket: number; time: string }>;
  skipped: string[];
}

function parsePhone(description: string): string | null {
  const m = /WhatsApp:(\+?\d[\d]+)/.exec(description);
  return m ? m[1] : null;
}

function parseSummary(summary: string): { treatment: string; name: string } {
  const parts = summary.split(' — ');
  return { treatment: parts[0]?.trim() ?? 'התור', name: parts[1]?.trim() ?? '' };
}

function fmt(startISO: string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('he-IL', { ...opts, timeZone: tz }).format(new Date(startISO));
}

function buildMessage(
  bucket: number,
  config: ClientConfig,
  startISO: string,
  treatment: string,
  name: string,
): string {
  const tz = config.timezone;
  const time = fmt(startISO, tz, { hour: '2-digit', minute: '2-digit', hour12: false });
  const greeting = name ? `היי ${name}!` : 'היי!';
  const address = config.address ? ` הכתובת: ${config.address}.` : '';

  // The shortest lead time = day-of "see you soon" reminder.
  const isSameDay = bucket === Math.min(...config.reminderHours);
  if (isSameDay) {
    return `${greeting} תזכורת קצרה — מחכים לך היום בשעה ${time} 🗓️${address} נתראה!`;
  }
  const day = fmt(startISO, tz, { weekday: 'long', day: 'numeric', month: 'numeric' });
  return `${greeting} רק תזכורת לתור ${treatment} ב${day} בשעה ${time}.${address} מחכים לך 🗓️`;
}

export async function runReminders(config: ClientConfig): Promise<ReminderResult> {
  const result: ReminderResult = { checked: 0, sent: [], skipped: [] };
  if (!whatsapp.isConfigured()) {
    result.skipped.push('twilio-not-configured');
    return result;
  }

  const maxLead = Math.max(...config.reminderHours);
  const events = await getUpcomingEvents(config, maxLead + 1);
  result.checked = events.length;

  for (const ev of events) {
    const phone = parsePhone(ev.description);
    if (!phone) continue;
    const hoursUntil = (new Date(ev.startISO).getTime() - Date.now()) / 3_600_000;
    if (hoursUntil <= 0) continue;

    const { treatment, name } = parseSummary(ev.summary);
    for (const H of config.reminderHours) {
      const inWindow = hoursUntil >= H - WINDOW_HOURS && hoursUntil <= H + WINDOW_HOURS;
      if (!inWindow || (await wasReminderSent(config.clientId, ev.id, H))) continue;
      const body = buildMessage(H, config, ev.startISO, treatment, name);
      try {
        await whatsapp.sendWhatsApp(phone, body);
        await markReminderSent(config.clientId, ev.id, H);
        result.sent.push({ to: phone, bucket: H, time: ev.startISO });
      } catch (err) {
        console.error('[reminders] send failed', err);
        result.skipped.push(`${ev.id}:${H}:send-failed`);
      }
    }
  }
  return result;
}
