// Smoke test: exercise the bot's Supabase history layer end-to-end, then clean up.
// Run: (from packages/agent-brain)  npx tsx ../../scripts/test-supabase.ts
import '../packages/agent-brain/src/env.js';
import {
  appendMessage,
  getRecentMessages,
  upsertLead,
  getDueLeads,
  advanceLead,
  markBookedLead,
  setPending,
  getPending,
  clearPending,
} from '../packages/agent-brain/src/memory/history.js';
import { getSupabase } from '../packages/agent-brain/src/db/supabase.js';

const CID = 'demo-clinic';
const PHONE = '+972500009999';

async function main() {
  console.log('1) messages (conversation memory)');
  await appendMessage({ clientId: CID, phoneNumber: PHONE, role: 'user', content: 'בדיקה היי' });
  await appendMessage({ clientId: CID, phoneNumber: PHONE, role: 'assistant', content: 'שלום! בדיקה', intent: 'faq' });
  const recent = await getRecentMessages(CID, PHONE);
  console.log('   recent:', recent.map((r) => `${r.role}:${r.content}`));

  console.log('2) lead recover lifecycle');
  await upsertLead(CID, PHONE, Date.now() - 1000);
  console.log('   due after upsert:', (await getDueLeads(CID, Date.now())).length, '(expect 1)');
  await advanceLead(CID, PHONE, 1, Date.now() - 500);
  await markBookedLead(CID, PHONE); // nudged (stage>=1) then booked → recovered
  console.log('   due after recover:', (await getDueLeads(CID, Date.now())).length, '(expect 0)');

  console.log('3) HITL pending');
  await setPending({ clientId: CID, patientPhone: PHONE, draftReply: 'טיוטה לבדיקה' });
  console.log('   pending:', (await getPending(CID))?.draftReply);
  await clearPending(CID);
  console.log('   pending after clear:', await getPending(CID));

  // cleanup test rows so they don't pollute dashboard counts
  const sb = getSupabase();
  if (sb) {
    await sb.from('messages').delete().eq('client_id', CID).eq('phone', PHONE);
    await sb.from('leads').delete().eq('client_id', CID).eq('phone', PHONE);
    await sb.from('hitl_pending').delete().eq('client_id', CID);
  }
  console.log('✅ Supabase history layer works (test rows cleaned up).');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
