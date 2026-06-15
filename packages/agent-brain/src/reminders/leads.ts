// reminders/leads.ts — lead follow-up engine
// For people who showed booking interest but didn't book: nudge 24h later, then
// a final nudge 48h after that. Skips anyone who has since booked.

import type { ClientConfig } from '../types.js';
import { hasUpcomingEventForPhone } from '../calendar/google.js';
import * as whatsapp from '../twilio/whatsapp.js';
import { canSendOutreach } from '../schedule.js';
import { getDueLeads, advanceLead, markBookedLead, markLeadLost } from '../memory/history.js';

const FINAL_DELAY_HOURS = 48;

interface LeadResult {
  due: number;
  sent: Array<{ to: string; stage: number }>;
  booked: string[];
  skipped: string[];
}

function firstNudge(config: ClientConfig): string {
  return `היי! 🙂 ראיתי שהתעניינת בתור אצלנו. רוצה שנמצא לך זמן מתאים? פשוט כתוב/כתבי לי מתי נוח ואשמח לעזור 🗓️`;
}

function finalNudge(config: ClientConfig): string {
  return `היי! עוד ניסיון אחרון מצידי 🙂 אם בא לך לקבוע תור — אני כאן. אם לא, הכל טוב, שיהיה יום מעולה!`;
}

export async function runLeadFollowups(config: ClientConfig): Promise<LeadResult> {
  const result: LeadResult = { due: 0, sent: [], booked: [], skipped: [] };
  if (!whatsapp.isConfigured()) {
    result.skipped.push('twilio-not-configured');
    return result;
  }
  // Only nudge during business hours, never on Shabbat (due leads stay due → retried later).
  if (!canSendOutreach(config)) {
    result.skipped.push('closed-or-shabbat');
    return result;
  }

  const now = Date.now();
  const leads = await getDueLeads(config.clientId, now);
  result.due = leads.length;

  for (const lead of leads) {
    // If they've since booked, resolve the lead (recovered if we'd nudged it).
    try {
      if (await hasUpcomingEventForPhone(config, lead.phone)) {
        await markBookedLead(config.clientId, lead.phone);
        result.booked.push(lead.phone);
        continue;
      }
    } catch (err) {
      console.error('[leads] calendar check failed', err);
    }

    try {
      if (lead.stage === 0) {
        await whatsapp.sendWhatsApp(lead.phone, firstNudge(config));
        await advanceLead(config.clientId, lead.phone, 1, now + FINAL_DELAY_HOURS * 3_600_000);
        result.sent.push({ to: lead.phone, stage: 0 });
      } else {
        await whatsapp.sendWhatsApp(lead.phone, finalNudge(config));
        await markLeadLost(config.clientId, lead.phone);
        result.sent.push({ to: lead.phone, stage: lead.stage });
      }
    } catch (err) {
      console.error('[leads] send failed', err);
      result.skipped.push(`${lead.phone}:send-failed`);
    }
  }
  return result;
}
