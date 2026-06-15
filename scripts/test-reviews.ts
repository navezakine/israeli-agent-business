// Dry-run the review-request engine against demo-clinic (no messages sent).
// Run from packages/agent-brain:  npx tsx ../../scripts/test-reviews.ts
import '../packages/agent-brain/src/env.js';
import { loadClientConfig } from '../packages/agent-brain/src/context/loader.js';
import { applyClientOverrides } from '../packages/agent-brain/src/db/profile.js';
import { runReviewRequests } from '../packages/agent-brain/src/reminders/reviews.js';

async function main() {
  const config = await applyClientOverrides(loadClientConfig('demo-clinic'));
  console.log(
    'reviewUrl:',
    config.googleReviewUrl,
    '| slotMin:',
    config.slotDurationMinutes,
    '| tz:',
    config.timezone,
  );

  const res = await runReviewRequests(config, { dryRun: true });
  console.log(
    'checked:',
    res.checked,
    '| wouldSend:',
    res.sent.length,
    '| skipped:',
    res.skipped.slice(0, 5),
  );
  console.log('samples:');
  for (const s of res.sent.slice(0, 3)) {
    console.log(`  ...${s.to.slice(-4)} (${s.name ?? 'no name'}): ${s.body}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
