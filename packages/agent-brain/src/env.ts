// env.ts — load environment before anything else imports it.
// Local: reads packages/agent-brain/.env (cwd) and the repo-root .env.supabase.
// Railway/production: those files are absent; real env vars are injected, and
// dotenv silently no-ops on a missing file.

import { config } from 'dotenv';
import { resolve } from 'node:path';

config(); // .env in the current working directory
config({ path: resolve(process.cwd(), '../../.env.supabase') }); // repo-root Supabase secrets (local only)
