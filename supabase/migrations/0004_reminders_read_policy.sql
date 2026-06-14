-- ============================================================
-- 0004 — let a clinic (and admin) READ its own reminders_sent rows,
-- so dashboard_stats() can count reminders. Rows hold only
-- client_id / google event id / bucket / sent_at — no patient content.
-- (hitl_pending stays bot-only: no client policy.)
-- ============================================================

drop policy if exists tenant_read on public.reminders_sent;
create policy tenant_read on public.reminders_sent
  for select to authenticated
  using (public.is_admin() or client_id in (select public.user_client_ids()));
