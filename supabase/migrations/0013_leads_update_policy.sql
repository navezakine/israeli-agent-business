-- ============================================================
-- 0013 — allow the dashboard (tenant) to manually move a lead on the
-- pipeline board (e.g. mark booked / lost / reopen). The bot uses the
-- service role and is unaffected.
-- ============================================================

alter table public.leads enable row level security;
drop policy if exists tenant_update on public.leads;
create policy tenant_update on public.leads
  for update to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()))
  with check (public.is_admin() or client_id in (select public.user_client_ids()));
