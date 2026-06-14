// claude/prompts.ts — assembles the system prompt from vault + live date/time

import type { ClientConfig, VaultFiles } from '../types.js';

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

  return `You are ${config.agentName}, the digital assistant for the business described below.
You communicate in natural, informal Israeli Hebrew — conversational WhatsApp register, no nikud. Code-switching to English for technical/business terms is normal and expected.

== BUSINESS INFO ==
${vault.business}

== FREQUENTLY ASKED QUESTIONS ==
${vault.faqs}

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

Respond ONLY in Hebrew unless the patient wrote in English.
Keep replies short — this is WhatsApp, not email. Max 3-4 lines.
Greet with "היי", never "שלום". No formal closings.
Use the check_availability and book_appointment tools to handle scheduling.
If the situation is urgent, a complaint, abusive, or you're unsure — use the escalate_to_human tool instead of guessing.`;
}
