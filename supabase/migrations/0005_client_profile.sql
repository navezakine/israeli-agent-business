-- ============================================================
-- 0005 — clinic-editable profile fields (business hours + address)
-- move into Supabase so the dashboard can self-edit them. The bot
-- reads these and overrides its config.json values.
-- ============================================================

alter table public.clients add column if not exists address text;
alter table public.clients add column if not exists business_hours jsonb;

-- seed demo-clinic with its current config.json values
update public.clients
set address = 'דיזנגוף 123 תל אביב, קומה 3',
    business_hours = '{"sun":"09:00-18:00","mon":"09:00-18:00","tue":"09:00-18:00","wed":"09:00-18:00","thu":"09:00-18:00","fri":"09:00-13:00","sat":null}'::jsonb
where client_id = 'demo-clinic' and address is null;

-- let a clinic (and admin) update its own profile row
drop policy if exists tenant_update on public.clients;
create policy tenant_update on public.clients
  for update to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()))
  with check (public.is_admin() or client_id in (select public.user_client_ids()));
