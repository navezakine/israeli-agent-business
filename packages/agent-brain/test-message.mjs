// Local test harness for POST /message.
// Run the server first (`npm run dev`), then: `node test-message.mjs`

const BASE = process.env.BASE ?? 'http://localhost:3000';
const from = process.env.FROM ?? `+97250${Math.floor(1000000 + Math.random() * 8999999)}`;
const clientId = 'demo-clinic';

// End-to-end booking: should trigger check_availability AND book_appointment.
const script = [
  'היי',
  'אני רוצה לקבוע תור לבדיקת עור',
  'קוראים לי יואב כהן, הטלפון שלי 0521234567. אפשר מחר בבוקר? תקבע לי בבקשה את השעה הראשונה שפנויה',
];

console.log(`(testing as ${from})`);
for (const body of script) {
  const r = await fetch(`${BASE}/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, from, body, messageId: 'TEST', timestamp: new Date().toISOString() }),
  });
  const data = await r.json();
  console.log('\n──────────────────────────────');
  console.log('👤', body);
  console.log('🤖', data.reply);
  console.log(`   [intent=${data.intent} | action=${data.actionRequired?.type ?? '-'} | hitlPending=${data.hitlPending}]`);
}
console.log('\n✅ done');
