// Verify business-hours + Shabbat logic with crafted Israel-local times.
// Run from packages/agent-brain:  npx tsx ../../scripts/test-schedule.ts
import { isShabbatNow, isOpenNow, canSendOutreach } from '../packages/agent-brain/src/schedule.js';
import type { ClientConfig } from '../packages/agent-brain/src/types.js';

const config = {
  timezone: 'Asia/Jerusalem',
  businessHours: {
    sun: '09:00-18:00', mon: '09:00-18:00', tue: '09:00-18:00', wed: '09:00-18:00',
    thu: '09:00-18:00', fri: '09:00-13:00', sat: null,
  },
} as unknown as ClientConfig;

// 2026-06-14 Sun, 06-16 Tue, 06-19 Fri, 06-20 Sat. +03:00 = Israel (IDT).
const CASES: Array<{ d: string; label: string; shabbat: boolean; open: boolean; send: boolean }> = [
  { d: '2026-06-14T10:00:00+03:00', label: 'Sun 10:00', shabbat: false, open: true, send: true },
  { d: '2026-06-14T19:00:00+03:00', label: 'Sun 19:00 (after close)', shabbat: false, open: false, send: false },
  { d: '2026-06-16T09:30:00+03:00', label: 'Tue 09:30', shabbat: false, open: true, send: true },
  { d: '2026-06-19T11:00:00+03:00', label: 'Fri 11:00', shabbat: false, open: true, send: true },
  { d: '2026-06-19T14:00:00+03:00', label: 'Fri 14:00 (after close, pre-Shabbat)', shabbat: false, open: false, send: false },
  { d: '2026-06-19T17:00:00+03:00', label: 'Fri 17:00 (Shabbat)', shabbat: true, open: false, send: false },
  { d: '2026-06-20T12:00:00+03:00', label: 'Sat 12:00 (Shabbat)', shabbat: true, open: false, send: false },
  { d: '2026-06-20T21:00:00+03:00', label: 'Sat 21:00 (post-Shabbat, still closed)', shabbat: false, open: false, send: false },
];

let pass = 0, fail = 0;
for (const c of CASES) {
  const now = new Date(c.d);
  const sh = isShabbatNow(config.timezone, now);
  const op = isOpenNow(config.businessHours, config.timezone, now) === true;
  const sn = canSendOutreach(config, now);
  const ok = sh === c.shabbat && op === c.open && sn === c.send;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${c.label} — shabbat=${sh} open=${op} canSend=${sn}` +
    (ok ? '' : ` (expected shabbat=${c.shabbat} open=${c.open} send=${c.send})`));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
