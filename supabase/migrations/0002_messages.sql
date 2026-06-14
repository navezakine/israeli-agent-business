-- ============================================================
-- 0002 — reshape `messages` so it serves BOTH the bot's conversation
-- memory (role + content + phone) AND dashboard analytics (counts).
-- No data yet, so we drop & recreate.
-- ============================================================

drop table if exists public.messages cascade;

create table public.messages (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(client_id) on delete cascade,
  phone text not null,                         -- E.164 (threading + callback)
  role text not null,                          -- 'user' | 'assistant'
  content text not null,
  intent text,
  action text,                                 -- e.g. 'book_appointment'
  hitl boolean not null default false,
  created_at timestamptz not null default now()
);

-- thread lookup (bot memory) + time-range scans (analytics)
create index messages_thread_idx on public.messages (client_id, phone, created_at);
create index messages_client_time_idx on public.messages (client_id, created_at);

alter table public.messages enable row level security;

drop policy if exists tenant_read on public.messages;
create policy tenant_read on public.messages
  for select to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()));
