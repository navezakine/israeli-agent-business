// calendar/google.ts — Google Calendar API wrapper (service account)
//
// getAvailableSlots(): free slots within the day's business hours, excluding busy events.
// bookAppointment(): creates a calendar event whose description carries the patient's
//   WhatsApp number in the format the reminder workflow (Step 5) parses.

import { google } from 'googleapis';
import type { ClientConfig } from '../types.js';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export interface Slot {
  time: string; // 'HH:MM' (Israel local)
  dateTime: string; // full ISO8601 instant — what book_appointment should use
}

/** Whether Google credentials are present. If not, callers fall back to stub data. */
export function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

function getCalendarClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    // .env stores the key with literal \n — turn those into real newlines.
    key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
  return google.calendar({ version: 'v3', auth });
}

// ── timezone helpers ──────────────────────────────────────────
/** Offset (ms) of `timeZone` from UTC at the given instant. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const m: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') m[p.type] = Number(p.value);
  const asUTC = Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute, m.second);
  return asUTC - date.getTime();
}

/** Build the UTC instant for a wall-clock time (Y-M-D HH:MM) in `timeZone`. */
function zonedInstant(
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  const off = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - off);
}

/** Day key ('sun'..'sat') for a YYYY-MM-DD date in `timeZone`. */
function dayKeyFor(y: number, mo: number, d: number, timeZone: string): string {
  const noon = zonedInstant(y, mo, d, 12, 0, timeZone);
  const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone })
    .format(noon)
    .toLowerCase();
  return DAY_KEYS.find((k) => short.startsWith(k)) ?? 'sun';
}

/** Today's YYYY-MM-DD in `timeZone`. */
function todayParts(timeZone: string): { y: number; mo: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // en-CA → YYYY-MM-DD
  const [y, mo, d] = parts.split('-').map(Number);
  return { y, mo, d };
}

/** Resolve 'today' / 'tomorrow' / 'YYYY-MM-DD' to {y,mo,d}. */
export function resolveDate(input: string, timeZone: string): { y: number; mo: number; d: number } {
  const trimmed = input.trim().toLowerCase();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return { y: +iso[1], mo: +iso[2], d: +iso[3] };
  const t = todayParts(timeZone);
  if (trimmed === 'today' || trimmed === 'היום') return t;
  if (trimmed === 'tomorrow' || trimmed === 'מחר') {
    const next = new Date(zonedInstant(t.y, t.mo, t.d, 12, 0, timeZone).getTime() + 24 * 3600 * 1000);
    return {
      y: Number(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(next)),
      mo: Number(new Intl.DateTimeFormat('en-US', { timeZone, month: '2-digit' }).format(next)),
      d: Number(new Intl.DateTimeFormat('en-US', { timeZone, day: '2-digit' }).format(next)),
    };
  }
  return t; // fallback: today
}

// ── core API ──────────────────────────────────────────────────
export async function getAvailableSlots(
  config: ClientConfig,
  dateInput: string,
): Promise<Slot[]> {
  const tz = config.timezone;
  const { y, mo, d } = resolveDate(dateInput, tz);
  const dayKey = dayKeyFor(y, mo, d, tz);
  const hours = config.businessHours[dayKey];
  if (!hours) return []; // closed that day

  const [openStr, closeStr] = hours.split('-');
  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);
  const dur = config.slotDurationMinutes;

  const dayStart = zonedInstant(y, mo, d, openH, openM, tz);
  const dayEnd = zonedInstant(y, mo, d, closeH, closeM, tz);

  // Busy intervals from the calendar.
  const cal = getCalendarClient();
  const fb = await cal.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      timeZone: tz,
      items: [{ id: config.googleCalendarId }],
    },
  });
  const busy = fb.data.calendars?.[config.googleCalendarId]?.busy ?? [];

  const now = Date.now();
  const slots: Slot[] = [];
  for (
    let t = dayStart.getTime();
    t + dur * 60_000 <= dayEnd.getTime();
    t += dur * 60_000
  ) {
    const slotStart = t;
    const slotEnd = t + dur * 60_000;
    if (slotStart <= now) continue; // skip past times
    const overlaps = busy.some((b) => {
      const bs = new Date(b.start!).getTime();
      const be = new Date(b.end!).getTime();
      return slotStart < be && slotEnd > bs;
    });
    if (overlaps) continue;
    const time = new Intl.DateTimeFormat('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(new Date(slotStart));
    slots.push({ time, dateTime: new Date(slotStart).toISOString() });
  }
  return slots;
}

export interface BookingDetails {
  patientName: string;
  patientPhone: string;
  dateTime: string; // ISO8601
  treatmentType?: string;
  notes?: string;
}

export async function bookAppointment(
  config: ClientConfig,
  details: BookingDetails,
): Promise<{ eventId: string; htmlLink: string }> {
  const cal = getCalendarClient();
  const start = new Date(details.dateTime);
  const end = new Date(start.getTime() + config.slotDurationMinutes * 60_000);
  const summary = `${details.treatmentType ?? 'תור'} — ${details.patientName}`;
  const description = `WhatsApp:${details.patientPhone} | Notes: ${details.notes ?? ''}`;

  const res = await cal.events.insert({
    calendarId: config.googleCalendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: start.toISOString(), timeZone: config.timezone },
      end: { dateTime: end.toISOString(), timeZone: config.timezone },
    },
  });

  return { eventId: res.data.id ?? '', htmlLink: res.data.htmlLink ?? '' };
}
