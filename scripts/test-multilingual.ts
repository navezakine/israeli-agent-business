// Verify the agent mirrors the patient's language (live chat).
// Run from packages/agent-brain:  npx tsx ../../scripts/test-multilingual.ts
import '../packages/agent-brain/src/env.js';
import { loadClientConfig, loadVault } from '../packages/agent-brain/src/context/loader.js';
import { applyClientOverrides } from '../packages/agent-brain/src/db/profile.js';
import { runAgent } from '../packages/agent-brain/src/claude/client.js';

const CASES: Array<{ lang: string; text: string }> = [
  { lang: 'Russian', text: 'Здравствуйте! Можно записаться на ботокс на этой неделе?' },
  { lang: 'Arabic', text: 'مرحبا، بدي احجز موعد لتنظيف بشرة. شو الاوقات المتاحة؟' },
  { lang: 'English', text: 'Hi! Do you have any availability for lip filler this week?' },
  { lang: 'Hebrew', text: 'היי, אפשר לקבוע תור לבוטוקס?' },
  { lang: 'French', text: 'Bonjour, est-ce que je peux prendre rendez-vous pour un soin du visage?' },
  { lang: 'Ambiguous', text: 'היי' },
];

function detectScript(s: string): string {
  if (/[֐-׿]/.test(s)) return 'Hebrew';
  if (/[؀-ۿ]/.test(s)) return 'Arabic';
  if (/[Ѐ-ӿ]/.test(s)) return 'Russian/Cyrillic';
  return 'Latin (English/French)';
}

async function main() {
  const config = await applyClientOverrides(loadClientConfig('demo-clinic'));
  const vault = loadVault('demo-clinic');
  console.log(`Model: ${process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'}\n`);

  for (const c of CASES) {
    const res = await runAgent({
      config,
      vault,
      history: [],
      userMessage: c.text,
      from: '+972500000099',
    });
    console.log(`-- patient (${c.lang}): ${c.text}`);
    console.log(`   reply script: ${detectScript(res.reply)}`);
    console.log(`   reply: ${res.reply}\n`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
