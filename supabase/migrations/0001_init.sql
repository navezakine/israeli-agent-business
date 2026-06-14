-- ============================================================
-- Replai dashboard — Phase 0 schema
-- Apply this whole file in the Supabase SQL editor (Run).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================

-- ---------- core: one row per clinic ----------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  client_id text unique not null,            -- matches agent-brain clientId, e.g. 'demo-clinic'
  name text not null,
  whatsapp_number text,                       -- E.164
  created_at timestamptz not null default now()
);

-- ---------- toggles the dashboard flips, the bot reads ----------
create table if not exists public.client_settings (
  client_id text primary key references public.clients(client_id) on delete cascade,
  bot_active boolean not null default true,
  auto_reply boolean not null default true,
  reminders_enabled boolean not null default true,
  followups_enabled boolean not null default true,
  hitl_enabled boolean not null default false,
  reminder_hours int[] not null default '{48,2}',
  updated_at timestamptz not null default now()
);

-- ---------- multi-tenant: which logged-in user belongs to which clinic ----------
create table if not exists public.client_users (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references public.clients(client_id) on delete cascade,
  role text not null default 'owner',         -- 'owner' (clinic) | 'admin' (you, sees all)
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- ---------- messages: powers 'conversations handled' + 'after-hours answered' ----------
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(client_id) on delete cascade,
  direction text not null,                    -- 'in' | 'out'
  phone_last4 text,                           -- privacy: store only last 4 digits
  intent text,
  action text,                                -- e.g. 'book_appointment'
  hitl boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_client_time_idx on public.messages (client_id, created_at);

-- ---------- appointments: powers the headline stat + the calendar ----------
create table if not exists public.appointments (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(client_id) on delete cascade,
  google_event_id text,
  patient_phone text,
  title text,
  start_at timestamptz,
  booked_by text not null default 'replai',   -- 'replai' | 'manual'
  created_at timestamptz not null default now(),
  unique (client_id, google_event_id)
);
create index if not exists appointments_client_start_idx on public.appointments (client_id, start_at);

-- ---------- leads: powers 'leads recovered' ----------
create table if not exists public.leads (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(client_id) on delete cascade,
  phone text not null,
  stage int not null default 0,
  status text not null default 'open',        -- 'open' | 'recovered' | 'lost'
  due_at timestamptz,
  recovered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, phone)
);
create index if not exists leads_client_status_idx on public.leads (client_id, status);

-- ---------- reminders dedup (replaces ephemeral SQLite) ----------
create table if not exists public.reminders_sent (
  client_id text not null references public.clients(client_id) on delete cascade,
  event_id text not null,
  bucket int not null,                        -- the reminderHours value, e.g. 48 or 2
  sent_at timestamptz not null default now(),
  primary key (client_id, event_id, bucket)
);

-- ---------- HITL pending draft (one per client, parity with current bot) ----------
create table if not exists public.hitl_pending (
  client_id text primary key references public.clients(client_id) on delete cascade,
  patient_phone text not null,
  draft text not null,
  created_at timestamptz not null default now()
);

-- ---------- 'request a change' button on the read-only knowledge base ----------
create table if not exists public.change_requests (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(client_id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  message text not null,
  status text not null default 'open',        -- 'open' | 'done'
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row-Level Security
-- The agent-brain uses the SERVICE ROLE key, which bypasses RLS
-- (so the bot writes freely). The dashboard uses each user's JWT,
-- so these policies confine a clinic to its own rows.
-- ============================================================

-- helper: client_ids the current user belongs to
create or replace function public.user_client_ids()
returns setof text
language sql security definer stable
set search_path = public
as $$ select client_id from public.client_users where user_id = auth.uid(); $$;

-- helper: is the current user an admin (you)?
create or replace function public.is_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$ select exists(select 1 from public.client_users where user_id = auth.uid() and role = 'admin'); $$;

grant execute on function public.user_client_ids() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- enable RLS everywhere
alter table public.clients          enable row level security;
alter table public.client_settings  enable row level security;
alter table public.client_users     enable row level security;
alter table public.messages         enable row level security;
alter table public.appointments     enable row level security;
alter table public.leads            enable row level security;
alter table public.reminders_sent   enable row level security;
alter table public.hitl_pending     enable row level security;
alter table public.change_requests  enable row level security;

-- read access: your clinics (or everything if admin)
drop policy if exists tenant_read on public.clients;
create policy tenant_read on public.clients
  for select to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()));

drop policy if exists tenant_read on public.client_settings;
create policy tenant_read on public.client_settings
  for select to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()));

-- clinics can flip their own toggles
drop policy if exists tenant_update on public.client_settings;
create policy tenant_update on public.client_settings
  for update to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()))
  with check (public.is_admin() or client_id in (select public.user_client_ids()));

drop policy if exists self_read on public.client_users;
create policy self_read on public.client_users
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists tenant_read on public.messages;
create policy tenant_read on public.messages
  for select to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()));

drop policy if exists tenant_read on public.appointments;
create policy tenant_read on public.appointments
  for select to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()));

drop policy if exists tenant_read on public.leads;
create policy tenant_read on public.leads
  for select to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()));

-- 'request a change': clinics insert + read their own
drop policy if exists tenant_insert on public.change_requests;
create policy tenant_insert on public.change_requests
  for insert to authenticated
  with check (public.is_admin() or client_id in (select public.user_client_ids()));

drop policy if exists tenant_read on public.change_requests;
create policy tenant_read on public.change_requests
  for select to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()));

-- (no client-facing policies on reminders_sent / hitl_pending: bot-only via service role)

-- ============================================================
-- Seed the demo clinic so we can test end-to-end immediately
-- ============================================================
insert into public.clients (client_id, name, whatsapp_number)
values ('demo-clinic', 'מרפאת עור ואסתטיקה תל אביב', '+972500000001')
on conflict (client_id) do nothing;

insert into public.client_settings (client_id, hitl_enabled)
values ('demo-clinic', true)
on conflict (client_id) do nothing;
