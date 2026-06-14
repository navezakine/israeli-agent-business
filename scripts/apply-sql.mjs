// One-off: apply a .sql file to Supabase Postgres using SUPABASE_DB_URL from .env.supabase.
// Usage: node scripts/apply-sql.mjs [path/to/file.sql]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  const out = {};
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { return out; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv(resolve(root, '.env.supabase'));
const dbUrl = env.SUPABASE_DB_URL || process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('❌ Missing SUPABASE_DB_URL in .env.supabase');
  process.exit(1);
}

const sqlFile = process.argv[2] || resolve(root, 'supabase/migrations/0001_init.sql');
const sql = readFileSync(sqlFile, 'utf8');

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('Connected. Applying:', sqlFile);
  await client.query(sql);

  const { rows: tables } = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name"
  );
  console.log('Public tables:', tables.map((r) => r.table_name).join(', '));

  const { rows: clients } = await client.query('select client_id, name from public.clients');
  console.log('Clients seeded:', JSON.stringify(clients));

  console.log('✅ Migration applied successfully.');
} catch (e) {
  console.error('❌ Failed:', e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
