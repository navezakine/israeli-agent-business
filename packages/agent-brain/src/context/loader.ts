// context/loader.ts — reads client config + vault markdown files

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ClientConfig, VaultFiles } from '../types.js';

/** Root of the clients/ folder. Resolved relative to the process cwd (the
 *  agent-brain package dir when running `npm run dev`). Override with CLIENTS_DIR. */
const CLIENTS_DIR = resolve(process.cwd(), process.env.CLIENTS_DIR ?? '../../clients');

export function clientsDir(): string {
  return CLIENTS_DIR;
}

export function loadClientConfig(clientId: string): ClientConfig {
  const path = join(CLIENTS_DIR, clientId, 'config.json');
  return JSON.parse(readFileSync(path, 'utf8')) as ClientConfig;
}

export function loadVault(clientId: string): VaultFiles {
  const dir = join(CLIENTS_DIR, clientId, 'vault');
  const read = (file: string) => readFileSync(join(dir, file), 'utf8');
  return {
    business: read('business.md'),
    faqs: read('faqs.md'),
    team: read('team.md'),
    tone: read('tone.md'),
    procedures: read('procedures.md'),
    noGo: read('no-go.md'),
  };
}

/** Maps a WhatsApp "to" number → clientId, using clients/routing.json.
 *  Used by n8n's multi-client routing. Returns undefined if not mapped. */
export function resolveClientId(toNumber: string): string | undefined {
  try {
    const routing = JSON.parse(
      readFileSync(join(CLIENTS_DIR, 'routing.json'), 'utf8'),
    ) as Record<string, string>;
    return routing[toNumber];
  } catch {
    return undefined;
  }
}
