// Dry-run the waitlist engine against demo-clinic (no messages sent).
// Run from packages/agent-brain:  npx tsx ../../scripts/test-waitlist.ts
import '../packages/agent-brain/src/env.js';
import { loadClientConfig } from '../packages/agent-brain/src/context/loader.js';
import { applyClientOverrides } from '../packages/agent-brain/src/db/profile.js';
import { runWaitlist } from '../packages/agent-brain/src/reminders/waitlist.js';

async function main() {
  const config = await applyClientOverrides(loadClientConfig('demo-clinic'));
  const res = await runWaitlist(config, { dryRun: true });
  console.log(
    'checked:',
    res.checked,
    '| offered:',
    res.offered.length,
    '| skipped:',
    res.skipped.slice(0, 5),
  );
  for (const o of res.offered.slice(0, 3)) {
    console.log(`  ...${o.to.slice(-4)} (${o.name ?? '?'}) slot ${o.slot}:`);
    console.log(`    ${o.body}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
