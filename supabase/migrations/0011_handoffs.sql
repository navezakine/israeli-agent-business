-- ============================================================
-- 0011 — human handoff: when a conversation is handed to a human
-- (patient sent a photo, or asked something medical / escalated),
-- the bot stays silent for that patient until the handoff is resolved.
-- ============================================================

create table if not exists public.handoffs (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(client_id) on delete cascade,
  phone text not null,
  reason text,
  status text not null default 'open',   -- open | resolved
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- at most one OPEN handoff per patient per clinic
create unique index if not exists handoffs_open_uniq
  on public.handoffs (client_id, phone) where status = 'open';
create index if not exists handoffs_client_status_idx
  on public.handoffs (client_id, status, created_at);

alter table public.handoffs enable row level security;
drop policy if exists tenant_read on public.handoffs;
create policy tenant_read on public.handoffs
  for select to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()));
