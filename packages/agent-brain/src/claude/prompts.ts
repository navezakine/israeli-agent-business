// claude/prompts.ts — assembles the system prompt from vault + live date/time

import type { ClientConfig, VaultFiles } from '../types.js';
import { clinicStatus } from '../schedule.js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Returns Israel-local date string (Hebrew), HH:mm, and a 'sun'..'sat' day key. */
function israelDateTime(timezone: string): {
  dateStr: string;
  timeStr: string;
  dayKey: string;
} {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }).format(now);
  const timeStr = new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(now);
  // getDay() in the target timezone: use en-US short weekday, lowercased.
  const short = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  })
    .format(now)
    .toLowerCase();
  const dayKey = DAY_KEYS.find((d) => short.startsWith(d)) ?? 'sun';
  return { dateStr, timeStr, dayKey };
}

export function buildSystemPrompt(config: ClientConfig, vault: VaultFiles): string {
  const { dateStr, timeStr, dayKey } = israelDateTime(config.timezone);
  const hoursToday = config.businessHours[dayKey];
  const hoursLine = hoursToday ? hoursToday : 'סגור היום';

  const { shabbat, openNow } = clinicStatus(config);
  const statusLine = shabbat
    ? 'המרפאה סגורה כעת (שבת).'
    : openNow
      ? 'המרפאה פתוחה כעת.'
      : 'המרפאה סגורה כעת (מחוץ לשעות הפעילות).';

  // Optional payment-link instruction (clinic brings its own link; we just send it).
  let pay = '';
  const payLink = config.paymentLink;
  if (payLink && (config.paymentMode === 'deposit' || config.paymentMode === 'full')) {
    const bit = config.paymentLinkBit ? ` או בביט: ${config.paymentLinkBit}` : '';
    if (config.paymentMode === 'deposit') {
      const amt = config.depositAmount ? `₪${config.depositAmount}` : 'מקדמה';
      pay = `\nPAYMENT: After you book an appointment, ask the patient to secure it with a deposit of ${amt} at this link: ${payLink}${bit}. Tell them the slot is held and the appointment is confirmed once the deposit is paid. Never invent prices.`;
    } else {
      pay = `\nPAYMENT: After you book an appointment, ask the patient to pay in advance at this link: ${payLink}${bit}. The payment page shows the amount, so never invent prices.`;
    }
  }

  return `You are ${config.agentName}, the digital assistant for the business described below.
Your default language is natural, informal Israeli Hebrew — conversational WhatsApp register, no nikud, with code-switching to English for technical/business terms. But you are fully fluent in other languages and reply in whatever language the patient writes to you (see the LANGUAGE rule below).

== BUSINESS INFO ==
${vault.business}

== FREQUENTLY ASKED QUESTIONS ==
${vault.faqs}${config.extraFaqs ? `\n\n# שאלות ותשובות שנוספו על ידי צוות המרפאה:\n${config.extraFaqs}` : ''}

== TEAM & ESCALATION ==
${vault.team}

== COMMUNICATION STYLE ==
${vault.tone}

== BOOKING PROCEDURES ==
${vault.procedures}

== WHAT YOU MUST NEVER DO ==
${vault.noGo}

== CURRENT DATE & TIME ==
${dateStr} — ${timeStr} (Israel time)

== BUSINESS HOURS TODAY ==
${hoursLine}

== STATUS RIGHT NOW ==
${statusLine}

LANGUAGE: Detect the language the patient is writing in and always reply in that exact same language, fluently and like a native speaker (Hebrew, English, Russian, Arabic, French, or any other). Keep matching them even if they switch language mid-conversation. If a message is too short or ambiguous to tell the language (for example just "היי", "hi", or an emoji), default to Hebrew.
Keep replies short — this is WhatsApp, not email. Max 3-4 lines.
Greet warmly and informally in the patient's own language. In Hebrew use "היי", never "שלום". No formal closings.
Use the check_availability and book_appointment tools to handle scheduling.
SCHEDULING: Always reply, even when the clinic is closed (after hours or Shabbat) - that is your advantage. But never offer or book a time outside business hours or on Shabbat; offer the next time the clinic is open instead. If the clinic is closed right now, make that clear warmly (for example on Shabbat open with "שבת שלום" and keep it short), and set the expectation that the team will follow up during opening hours.
If the day or time the patient wants is full, offer to add them to the waitlist using the join_waitlist tool, and tell them you will message them the moment a slot opens.
If the situation is urgent, a complaint, abusive, or you're unsure, use the escalate_to_human tool instead of guessing.
MEDICAL SAFETY: You must NEVER give medical or clinical advice, a diagnosis, or any opinion on a patient's condition, symptoms, results, or whether a treatment is suitable for them. If a patient asks for any of these, or describes a medical problem, do not answer it, use the escalate_to_human tool and tell them a member of the clinic team will get back to them. You may still help with general info like prices, hours, and booking.
Never use the long dash character in your replies; use a comma or a period instead.${pay}`;
}
