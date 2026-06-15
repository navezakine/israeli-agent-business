// Check that the system prompt includes the PAYMENT instruction when configured.
// Run from packages/agent-brain:  npx tsx ../../scripts/test-payment-prompt.ts
import '../packages/agent-brain/src/env.js';
import { loadClientConfig, loadVault } from '../packages/agent-brain/src/context/loader.js';
import { applyClientOverrides } from '../packages/agent-brain/src/db/profile.js';
import { buildSystemPrompt } from '../packages/agent-brain/src/claude/prompts.js';

async function main() {
  const config = await applyClientOverrides(loadClientConfig('demo-clinic'));
  const vault = loadVault('demo-clinic');
  const p = buildSystemPrompt(config, vault);
  const idx = p.indexOf('PAYMENT');
  console.log(
    'mode:',
    config.paymentMode,
    '| amount:',
    config.depositAmount,
    '| link:',
    config.paymentLink,
  );
  console.log('PAYMENT section present:', idx >= 0);
  if (idx >= 0) console.log('  >', p.slice(idx, idx + 220));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
