// Read-only: show the most recent rows the bot wrote to Supabase.
// Usage: node scripts/recent-messages.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function loadEnv(file) {
  const out = {};
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[2]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
  return out;
}
const dbUrl = loadEnv(resolve(root, '.env.supabase')).SUPABASE_DB_URL;
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const m = await client.query(
    `select created_at, role, intent, left(content, 60) as content, right(phone,4) as last4
       from public.messages order by created_at desc limit 8`,
  );
  console.log('Recent messages (newest first):');
  for (const r of m.rows) {
    console.log(`  ${r.created_at.toISOString()}  ${r.role.padEnd(9)} …${r.last4}  ${r.intent ?? ''}  ${r.content}`);
  }
  if (!m.rows.length) console.log('  (none yet)');

  const a = await client.query('select count(*)::int as n from public.appointments');
  const l = await client.query("select status, count(*)::int as n from public.leads group by status");
  console.log(`\nAppointments logged: ${a.rows[0].n}`);
  console.log('Leads by status:', l.rows.map((r) => `${r.status}=${r.n}`).join(', ') || '(none)');
} catch (e) {
  console.error('❌', e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
