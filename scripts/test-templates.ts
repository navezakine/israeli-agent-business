// Verify message templates: defaults, render, and per-clinic override fallback.
// Run from packages/agent-brain:  npx tsx ../../scripts/test-templates.ts
import '../packages/agent-brain/src/env.js';
import { DEFAULT_TEMPLATES, render, loadTemplates } from '../packages/agent-brain/src/templates.js';
import { getSupabase } from '../packages/agent-brain/src/db/supabase.js';

const CID = 'demo-clinic';
let pass = 0, fail = 0;
const check = (n: string, c: boolean) => { console.log(`${c ? '✅' : '❌'} ${n}`); c ? pass++ : fail++; };

async function main() {
  const sb = getSupabase();
  await sb?.from('message_templates').delete().eq('client_id', CID).eq('template_key', 'reminder_advance');

  // render
  const out = render(DEFAULT_TEMPLATES.reminder_advance, {
    greeting: 'היי נועה!', treatment: 'בוטוקס', day: 'ראשון 14.6', time: '10:30', address: ' הכתובת: דיזנגוף 50.',
  });
  check('render fills placeholders', out.includes('היי נועה!') && out.includes('בוטוקס') && out.includes('10:30') && !out.includes('{'));
  console.log('   →', out);

  // defaults when no override
  let t = await loadTemplates(CID, ['reminder_advance', 'review_request']);
  check('falls back to defaults', t.reminder_advance === DEFAULT_TEMPLATES.reminder_advance);

  // override wins
  const custom = 'תזכורת אישית: נתראה ב{day} בשעה {time} 💅';
  await sb?.from('message_templates').insert({ client_id: CID, template_key: 'reminder_advance', body: custom });
  t = await loadTemplates(CID, ['reminder_advance', 'review_request']);
  check('override is used when present', t.reminder_advance === custom);
  check('other keys still default', t.review_request === DEFAULT_TEMPLATES.review_request);

  // cleanup
  await sb?.from('message_templates').delete().eq('client_id', CID).eq('template_key', 'reminder_advance');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
