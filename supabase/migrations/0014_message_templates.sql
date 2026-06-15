-- ============================================================
-- 0014 — editable message templates: clinics can customize the wording of the
-- automatic outbound messages (reminders, review requests, waitlist, lead
-- nudges). One row per (client, template_key); falls back to built-in defaults
-- when absent. This is also the shape needed for WhatsApp Business API templates.
-- ============================================================

create table if not exists public.message_templates (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(client_id) on delete cascade,
  template_key text not null,    -- reminder_advance | reminder_sameday | review_request | waitlist_offer | lead_nudge1 | lead_nudge2
  body text not null,
  updated_at timestamptz not null default now(),
  unique (client_id, template_key)
);

alter table public.message_templates enable row level security;
-- dashboard reads + edits (tenant); the bot uses the service role.
drop policy if exists tenant_all on public.message_templates;
create policy tenant_all on public.message_templates
  for all to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()))
  with check (public.is_admin() or client_id in (select public.user_client_ids()));
