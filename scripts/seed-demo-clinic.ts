// scripts/seed-demo-clinic.ts — scaffold a new client from the demo-clinic template.
//
// Usage (from packages/agent-brain):
//   npm run seed -- <newClientId> ["Agent Name"]
//   npm run seed -- happy-teeth "רותם"        → creates clients/happy-teeth/
//   npm run seed -- happy-teeth --force        → overwrite if it already exists
//
// Copies demo-clinic's config.json + vault/ (already filled with realistic sample
// content) so a new client starts from a working example, then you edit the vault.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENTS_DIR = join(here, '..', 'clients');
const TEMPLATE = 'demo-clinic';

const args = process.argv.slice(2);
const force = args.includes('--force');
const positional = args.filter((a) => !a.startsWith('--'));
const newId = positional[0];
const agentName = positional[1];

if (!newId) {
  console.error('Usage: npm run seed -- <newClientId> ["Agent Name"] [--force]');
  process.exit(1);
}

const src = join(CLIENTS_DIR, TEMPLATE);
const dest = join(CLIENTS_DIR, newId);

if (!existsSync(src)) {
  console.error(`Template client "${TEMPLATE}" not found at ${src}`);
  process.exit(1);
}
if (existsSync(dest)) {
  if (!force) {
    console.error(`Client "${newId}" already exists. Use --force to overwrite.`);
    process.exit(1);
  }
  rmSync(dest, { recursive: true, force: true });
}

cpSync(src, dest, { recursive: true });

// Update config.json with the new clientId (and agentName if provided).
const configPath = join(dest, 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.clientId = newId;
if (agentName) config.agentName = agentName;
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

console.log(`✅ Created clients/${newId}/ from ${TEMPLATE}`);
console.log('Next steps:');
console.log(`  1. Edit clients/${newId}/vault/*.md with the real business content`);
console.log(`  2. Set whatsappNumber, googleCalendarId, hitlApproverWhatsapp in config.json`);
console.log(`  3. Add the WhatsApp number → "${newId}" mapping in clients/routing.json`);
