// HITL test. Run server first (npm run dev), then: node test-hitl.mjs
// Sends as the founder's number (patient) then as the approver (same number).

const BASE = process.env.BASE ?? 'http://localhost:3000';
const from = process.env.FROM ?? '+972528747637';
const clientId = 'demo-clinic';

async function post(body) {
  const r = await fetch(`${BASE}/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, from, body, messageId: 'TEST' }),
  });
  return r.json();
}

console.log('1) PATIENT: "מה השעות שלכם?"');
console.log('   resp:', JSON.stringify(await post('מה השעות שלכם?')));
console.log('   → expect hitlPending:true, empty reply. Check WhatsApp for the ✋ HITL prompt.\n');

await new Promise((r) => setTimeout(r, 2000));

console.log('2) APPROVER: "✅"');
console.log('   resp:', JSON.stringify(await post('✅')));
console.log('   → expect hitlHandled:true + "נשלח". Check WhatsApp for the actual reply.');
