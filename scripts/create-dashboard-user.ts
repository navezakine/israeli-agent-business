// Create/link (or delete) a dashboard login account via the Supabase admin API.
//   create: npx tsx ../../scripts/create-dashboard-user.ts <email> <password> [clientId] [role]
//   delete: DELETE=1 npx tsx ../../scripts/create-dashboard-user.ts <email>
// Run from packages/agent-brain (so @supabase/supabase-js resolves).
import '../packages/agent-brain/src/env.js';
import { getSupabase } from '../packages/agent-brain/src/db/supabase.js';

const [email, password, clientId = 'demo-clinic', role = 'admin'] = process.argv.slice(2);
const del = process.env.DELETE === '1';

const sb = getSupabase();
if (!sb) {
  console.error('❌ Supabase not configured');
  process.exit(1);
}

async function findUser(targetEmail: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await sb!.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === targetEmail.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
  }
}

async function main() {
  if (!email) {
    console.error('usage: <email> <password> [clientId] [role]   (or DELETE=1 <email>)');
    process.exit(1);
  }

  if (del) {
    const u = await findUser(email);
    if (u) {
      await sb!.auth.admin.deleteUser(u.id);
      console.log('🗑️  deleted', email);
    } else {
      console.log('not found:', email);
    }
    process.exit(0);
  }

  let user = await findUser(email);
  if (!user) {
    const { data, error } = await sb!.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log('✅ created user', email);
  } else {
    if (password) await sb!.auth.admin.updateUserById(user.id, { password });
    console.log('ℹ️  user already existed', email, '(password updated)');
  }

  const { error: linkErr } = await sb!
    .from('client_users')
    .upsert({ user_id: user!.id, client_id: clientId, role }, { onConflict: 'user_id,client_id' });
  if (linkErr) throw linkErr;
  console.log(`🔗 linked ${email} → ${clientId} (${role})`);
  process.exit(0);
}

main().catch((e) => {
  console.error('❌', e?.message ?? e);
  process.exit(1);
});
