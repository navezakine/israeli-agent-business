// schedule.ts — business-hours + Shabbat awareness, shared by the prompt builder
// (so the agent knows if the clinic is open) and the proactive engines (so we
// never send WhatsApp on Shabbat or outside hours). All functions take an
// optional `now` for testability; default is the real clock.

import type { ClientConfig } from './types.js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// Shabbat is approximated (not astronomical sunset): Friday from this hour
// through Saturday up to this hour, in the clinic's timezone.
const SHABBAT_START_FRI_HOUR = 15; // 15:00 Friday
const SHABBAT_END_SAT_HOUR = 20; // 20:00 Saturday

function localParts(timezone: string, now: Date): { dayKey: string; minutes: number; hour: number } {
  const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone })
    .format(now)
    .toLowerCase();
  const dayKey = DAY_KEYS.find((d) => short.startsWith(d)) ?? 'sun';
  const hour =
    Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(now)) % 24;
  const minute = Number(
    new Intl.DateTimeFormat('en-US', { minute: 'numeric', timeZone: timezone }).format(now),
  );
  return { dayKey, hour, minutes: hour * 60 + minute };
}

const toMin = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Parse "09:00-18:00" (or comma-separated ranges) into minute ranges. */
function parseRanges(s: string): { start: number; end: number }[] {
  return s
    .split(',')
    .map((part) => {
      const [a, b] = part.split('-');
      const start = toMin(a ?? '');
      const end = toMin(b ?? '');
      return start != null && end != null ? { start, end } : null;
    })
    .filter((r): r is { start: number; end: number } => r != null);
}

/** Is it currently Shabbat (Fri eve → Sat eve) in the clinic's timezone? */
export function isShabbatNow(timezone: string, now: Date = new Date()): boolean {
  const { dayKey, hour } = localParts(timezone, now);
  if (dayKey === 'fri') return hour >= SHABBAT_START_FRI_HOUR;
  if (dayKey === 'sat') return hour < SHABBAT_END_SAT_HOUR;
  return false;
}

/**
 * Is the clinic open right now per its configured business hours?
 * Returns null when no hours are configured at all (caller can fall back).
 */
export function isOpenNow(
  businessHours: Record<string, string | null> | undefined,
  timezone: string,
  now: Date = new Date(),
): boolean | null {
  if (!businessHours || Object.keys(businessHours).length === 0) return null;
  const { dayKey, minutes } = localParts(timezone, now);
  const today = businessHours[dayKey];
  if (!today) return false; // explicitly closed today (e.g. Saturday)
  const ranges = parseRanges(today);
  if (ranges.length === 0) return false;
  return ranges.some((r) => minutes >= r.start && minutes < r.end);
}

/**
 * May we send a proactive (non-urgent) WhatsApp right now? No on Shabbat, and
 * only while the clinic is open. Falls back to a 09:00-20:00 daytime window when
 * hours aren't configured.
 */
export function canSendOutreach(config: ClientConfig, now: Date = new Date()): boolean {
  if (isShabbatNow(config.timezone, now)) return false;
  const open = isOpenNow(config.businessHours, config.timezone, now);
  if (open === null) {
    const { hour } = localParts(config.timezone, now);
    return hour >= 9 && hour < 20;
  }
  return open;
}

/** Status used by the system prompt so the agent knows how to respond. */
export function clinicStatus(
  config: ClientConfig,
  now: Date = new Date(),
): { shabbat: boolean; openNow: boolean } {
  const shabbat = isShabbatNow(config.timezone, now);
  const open = isOpenNow(config.businessHours, config.timezone, now);
  return { shabbat, openNow: !shabbat && open === true };
}
