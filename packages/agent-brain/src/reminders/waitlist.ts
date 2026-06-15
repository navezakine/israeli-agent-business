// reminders/waitlist.ts — waitlist auto-fill.
// Triggered by /cron/run. For each waiting patient (FIFO), checks the calendar
// for an open slot on their desired day; if one is free, offers it to them.
// Catches any freed slot (cancelled by the clinic or via the bot) without diffing.

import type { ClientConfig } from '../types.js';
import * as whatsapp from '../twilio/whatsapp.js';
import { getAvailableSlots, isConfigured } from '../calendar/google.js';
import { canSendOutreach } from '../schedule.js';
import { loadTemplates, render } from '../templates.js';
import {
  getOpenWaitlist,
  markWaitlistOffered,
  revertStaleWaitlistOffers,
  expireOldWaitlist,
} from '../memory/history.js';

const OFFER_TIMEOUT_HOURS = 6; // re-open an offer not taken in time
const MAX_AGE_DAYS = 14; // expire stale waitlist entries

interface WaitlistResult {
  checked: number;
  offered: Array<{ to: string; name?: string | null; slot?: string; body?: string }>;
  skipped: string[];
}

function fmt(startISO: string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('he-IL', { ...opts, timeZone: tz }).format(new Date(startISO));
}
function buildOffer(
  template: string,
  name: string | null | undefined,
  startISO: string,
  tz: string,
): string {
  const time = fmt(startISO, tz, { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = fmt(startISO, tz, { weekday: 'long', day: 'numeric', month: 'numeric' });
  const greeting = name ? `היי ${name}!` : 'היי!';
  return render(template, { greeting, day, time });
}

export async function runWaitlist(
  config: ClientConfig,
  opts: { dryRun?: boolean } = {},
): Promise<WaitlistResult> {
  const result: WaitlistResult = { checked: 0, offered: [], skipped: [] };

  if (!isConfigured()) {
    result.skipped.push('calendar-not-configured');
    return result;
  }
  if (!opts.dryRun && !whatsapp.isConfigured()) {
    result.skipped.push('twilio-not-configured');
    return result;
  }

  if (!opts.dryRun) {
    await revertStaleWaitlistOffers(config.clientId, OFFER_TIMEOUT_HOURS * 3_600_000);
    await expireOldWaitlist(config.clientId, MAX_AGE_DAYS * 86_400_000);
  }

  if (!opts.dryRun && !canSendOutreach(config)) {
    result.skipped.push('closed-or-shabbat');
    return result;
  }

  const { waitlist_offer: template } = await loadTemplates(config.clientId, ['waitlist_offer']);
  const entries = await getOpenWaitlist(config.clientId);
  result.checked = entries.length;
  const offeredSlots = new Set<string>(); // don't offer the same slot to two people this run

  for (const e of entries) {
    if (!/^\+?\d{7,}$/.test(e.phone)) continue; // v1: WhatsApp/phone contacts only
    const days =
      e.desiredDate && e.desiredDate !== 'flexible' ? [e.desiredDate] : ['today', 'tomorrow'];

    let chosen: { time: string; dateTime: string } | null = null;
    for (const d of days) {
      try {
        const slots = await getAvailableSlots(config, d);
        const free = slots.find((s) => !offeredSlots.has(s.dateTime));
        if (free) {
          chosen = free;
          break;
        }
      } catch {
        // calendar lookup failed for this day; try next
      }
    }
    if (!chosen) continue;

    offeredSlots.add(chosen.dateTime);
    const body = buildOffer(template, e.name, chosen.dateTime, config.timezone);

    if (opts.dryRun) {
      result.offered.push({ to: e.phone, name: e.name, slot: chosen.dateTime, body });
      continue;
    }
    try {
      await whatsapp.sendWhatsApp(e.phone, body);
      await markWaitlistOffered(config.clientId, e.phone, chosen.dateTime);
      result.offered.push({ to: e.phone, slot: chosen.dateTime });
    } catch (err) {
      console.error('[waitlist] send failed', err);
      result.skipped.push(`${e.phone}:send-failed`);
    }
  }
  return result;
}
