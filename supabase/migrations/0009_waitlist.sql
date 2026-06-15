-- ============================================================
-- 0009 — waitlist auto-fill: capture people whose wanted time was full,
-- and offer them a slot when one opens up.
-- ============================================================

create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(client_id) on delete cascade,
  phone text not null,
  name text,
  channel text not null default 'whatsapp',
  desired_date text,        -- 'today' / 'tomorrow' / 'YYYY-MM-DD' / null (flexible)
  note text,
  status text not null default 'open',  -- open | offered | booked | expired
  offered_at timestamptz,
  offered_slot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, phone)
);
create index if not exists waitlist_client_status_idx on public.waitlist (client_id, status, created_at);

alter table public.waitlist enable row level security;
drop policy if exists tenant_read on public.waitlist;
create policy tenant_read on public.waitlist
  for select to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()));

-- on/off toggle (shows up in Controls)
alter table public.client_settings add column if not exists waitlist_enabled boolean not null default true;
