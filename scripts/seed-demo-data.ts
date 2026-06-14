// Seed demo-clinic with a realistic ~60 days of activity for sales demos.
// Idempotent: clears only demo rows (markered) first, never real data.
// Run from packages/agent-brain:  npx tsx ../../scripts/seed-demo-data.ts
import '../packages/agent-brain/src/env.js';
import { getSupabase } from '../packages/agent-brain/src/db/supabase.js';

const CID = 'demo-clinic';
const sb = getSupabase();
if (!sb) {
  console.error('❌ Supabase not configured');
  process.exit(1);
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const daysAgo = (min: number, max: number) => new Date(Date.now() - rand(min, max) * 86_400_000);
function atHour(d: Date, hour: number) {
  const x = new Date(d);
  x.setHours(hour, Math.floor(rand(0, 60)), 0, 0);
  return x;
}

const NAMES = [
  'נועה לוי', 'דנה כהן', 'מאיה ישראלי', 'יעל פרץ', 'שירה אברהם', 'תמר ביטון',
  'רותם דהן', 'ליאת מזרחי', 'הילה אזולאי', 'גלית ששון', 'אורית בר', 'מיכל נחום',
];
const TREATMENTS = ['בוטוקס', 'חומצה היאלורונית', 'ניקוי עור עמוק', 'טיפול לייזר', 'פילינג', 'ייעוץ'];
const USER_MSGS = ['היי, אפשר לקבוע תור?', 'כמה עולה בוטוקס?', 'יש לכם זמן השבוע?', 'מה שעות הפעילות?', 'אפשר לדחות את התור שלי?'];
const ASST_MSGS = ['בשמחה! יש לי חלון מחר 🙂', 'המחיר מתחיל ב-₪900. רוצה לקבוע?', 'בטח, מצאתי לך זמן ביום ראשון 🗓️', 'אנחנו פתוחים א׳-ה׳ 9:00-18:00.', 'קבעתי לך, נתראה! ✅'];

// demo markers (so re-runs don't duplicate and real data is untouched)
const DEMO_PHONE = (i: number) => `+97259900${String(i).padStart(4, '0')}`;
const LEAD_PHONE = (i: number) => `+97259901${String(i).padStart(4, '0')}`;

async function clearDemo() {
  await sb!.from('messages').delete().eq('client_id', CID).like('phone', '+97259900%');
  await sb!.from('leads').delete().eq('client_id', CID).like('phone', '+9725990%');
  await sb!.from('appointments').delete().eq('client_id', CID).like('google_event_id', 'demo-%');
  await sb!.from('reminders_sent').delete().eq('client_id', CID).like('event_id', 'demo-%');
}

async function main() {
  await clearDemo();

  // ── conversations (messages) ──────────────────────────────
  const messages: Record<string, unknown>[] = [];
  const addConvo = (i: number, base: Date, afterHours: boolean) => {
    const phone = DEMO_PHONE(i);
    const userAt = base;
    let asstAt = new Date(userAt.getTime() + rand(1, 5) * 60_000);
    if (afterHours) asstAt = atHour(asstAt, Math.floor(rand(20, 23)));
    messages.push({ client_id: CID, phone, role: 'user', content: pick(USER_MSGS), created_at: userAt.toISOString() });
    messages.push({ client_id: CID, phone, role: 'assistant', content: pick(ASST_MSGS), intent: 'faq', created_at: asstAt.toISOString() });
  };
  let idx = 0;
  for (let i = 0; i < 40; i++) addConvo(idx++, daysAgo(0, 30), i < 15); // current: 40 convos, 15 after-hours
  for (let i = 0; i < 28; i++) addConvo(idx++, daysAgo(30, 60), i < 9); // previous: 28 convos
  {
    const { error } = await sb!.from('messages').insert(messages);
    if (error) console.error('messages insert error:', error.message);
  }

  // ── appointments (booked by Replai) ───────────────────────
  const appts: Record<string, unknown>[] = [];
  const addAppt = (n: number, createdDays: [number, number], startOffsetDays: [number, number]) => {
    const created = daysAgo(createdDays[0], createdDays[1]);
    const start = new Date(Date.now() + rand(startOffsetDays[0], startOffsetDays[1]) * 86_400_000);
    appts.push({
      client_id: CID,
      google_event_id: `demo-appt-${n}`,
      patient_phone: DEMO_PHONE(Math.floor(rand(0, 68))),
      title: `${pick(TREATMENTS)} — ${pick(NAMES)}`,
      start_at: atHour(start, Math.floor(rand(9, 18))).toISOString(),
      booked_by: 'replai',
      created_at: created.toISOString(),
    });
  };
  let an = 0;
  for (let i = 0; i < 22; i++) addAppt(an++, [0, 30], [-3, 25]); // current
  for (let i = 0; i < 16; i++) addAppt(an++, [30, 60], [-35, -5]); // previous (past)
  {
    const { error } = await sb!.from('appointments').insert(appts);
    if (error) console.error('appointments insert error:', error.message);
  }

  // ── leads (recovered / open / lost) ───────────────────────
  const leads: Record<string, unknown>[] = [];
  let ln = 0;
  for (let i = 0; i < 9; i++) {
    const at = daysAgo(0, 30);
    leads.push({ client_id: CID, phone: LEAD_PHONE(ln++), stage: 1, status: 'recovered', recovered_at: at.toISOString(), created_at: new Date(at.getTime() - 2 * 86_400_000).toISOString(), updated_at: at.toISOString() });
  }
  for (let i = 0; i < 6; i++) {
    const at = daysAgo(30, 60);
    leads.push({ client_id: CID, phone: LEAD_PHONE(ln++), stage: 1, status: 'recovered', recovered_at: at.toISOString(), created_at: new Date(at.getTime() - 2 * 86_400_000).toISOString(), updated_at: at.toISOString() });
  }
  for (let i = 0; i < 5; i++) leads.push({ client_id: CID, phone: LEAD_PHONE(ln++), stage: 0, status: 'open', due_at: new Date(Date.now() + rand(1, 3) * 86_400_000).toISOString(), created_at: daysAgo(0, 4).toISOString(), updated_at: new Date().toISOString() });
  for (let i = 0; i < 4; i++) leads.push({ client_id: CID, phone: LEAD_PHONE(ln++), stage: 2, status: 'lost', created_at: daysAgo(5, 40).toISOString(), updated_at: new Date().toISOString() });
  {
    const { error } = await sb!.from('leads').insert(leads);
    if (error) console.error('leads insert error:', error.message);
  }

  // ── reminders sent ────────────────────────────────────────
  const reminders: Record<string, unknown>[] = [];
  let rn = 0;
  for (let i = 0; i < 35; i++) reminders.push({ client_id: CID, event_id: `demo-rem-${rn++}`, bucket: pick([48, 2]), sent_at: daysAgo(0, 30).toISOString() });
  for (let i = 0; i < 25; i++) reminders.push({ client_id: CID, event_id: `demo-rem-${rn++}`, bucket: pick([48, 2]), sent_at: daysAgo(30, 60).toISOString() });
  {
    const { error } = await sb!.from('reminders_sent').insert(reminders);
    if (error) console.error('reminders insert error:', error.message);
  }

  console.log(`✅ Seeded demo-clinic: ${messages.length} messages, ${appts.length} appointments, ${leads.length} leads, ${reminders.length} reminders.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('❌', e?.message ?? e);
  process.exit(1);
});
