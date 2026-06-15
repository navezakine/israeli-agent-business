-- ============================================================
-- 0012 — self-improving FAQ: when the agent escalates an unknown question
-- and the owner answers, capture (question, answer) as a suggestion. Once
-- approved, it is injected into the agent's knowledge base at runtime.
-- ============================================================

create table if not exists public.faq_suggestions (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(client_id) on delete cascade,
  question text not null,
  answer text not null,
  status text not null default 'pending',   -- pending | approved | dismissed
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists faq_suggestions_client_status_idx
  on public.faq_suggestions (client_id, status, created_at desc);

alter table public.faq_suggestions enable row level security;
-- dashboard reads + approves/dismisses (tenant); the bot uses the service role.
drop policy if exists tenant_read on public.faq_suggestions;
create policy tenant_read on public.faq_suggestions
  for select to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()));
drop policy if exists tenant_update on public.faq_suggestions;
create policy tenant_update on public.faq_suggestions
  for update to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()))
  with check (public.is_admin() or client_id in (select public.user_client_ids()));

-- remember the escalated question so we can pair it with the owner's answer
alter table public.handoffs add column if not exists question text;
