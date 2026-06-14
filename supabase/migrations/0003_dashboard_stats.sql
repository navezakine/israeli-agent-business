-- ============================================================
-- 0003 — dashboard_stats(): one call returns every overview metric
-- for the current 30-day window AND the prior 30 days (for trends).
-- security invoker → runs as the calling user, so RLS confines counts
-- to that user's own clinic. Founder (admin role) sees all.
-- ============================================================

create or replace function public.dashboard_stats(
  p_client_id text,
  p_tz text default 'Asia/Jerusalem'
)
returns json
language sql
security invoker
stable
as $$
  select json_build_object(
    'appointments', json_build_object(
      'cur',  (select count(*) from public.appointments a
                where a.client_id = p_client_id and a.booked_by = 'replai'
                  and a.created_at >= now() - interval '30 days'),
      'prev', (select count(*) from public.appointments a
                where a.client_id = p_client_id and a.booked_by = 'replai'
                  and a.created_at >= now() - interval '60 days'
                  and a.created_at <  now() - interval '30 days')
    ),
    'leads_recovered', json_build_object(
      'cur',  (select count(*) from public.leads l
                where l.client_id = p_client_id and l.status = 'recovered'
                  and l.recovered_at >= now() - interval '30 days'),
      'prev', (select count(*) from public.leads l
                where l.client_id = p_client_id and l.status = 'recovered'
                  and l.recovered_at >= now() - interval '60 days'
                  and l.recovered_at <  now() - interval '30 days')
    ),
    'conversations', json_build_object(
      'cur',  (select count(distinct phone) from public.messages m
                where m.client_id = p_client_id and m.role = 'user'
                  and m.created_at >= now() - interval '30 days'),
      'prev', (select count(distinct phone) from public.messages m
                where m.client_id = p_client_id and m.role = 'user'
                  and m.created_at >= now() - interval '60 days'
                  and m.created_at <  now() - interval '30 days')
    ),
    'reminders', json_build_object(
      'cur',  (select count(*) from public.reminders_sent r
                where r.client_id = p_client_id
                  and r.sent_at >= now() - interval '30 days'),
      'prev', (select count(*) from public.reminders_sent r
                where r.client_id = p_client_id
                  and r.sent_at >= now() - interval '60 days'
                  and r.sent_at <  now() - interval '30 days')
    ),
    'after_hours', json_build_object(
      'cur',  (select count(*) from public.messages m
                where m.client_id = p_client_id and m.role = 'assistant'
                  and m.created_at >= now() - interval '30 days'
                  and (extract(isodow from m.created_at at time zone p_tz) = 6
                       or extract(hour from m.created_at at time zone p_tz) < 9
                       or extract(hour from m.created_at at time zone p_tz) >= 18)),
      'prev', (select count(*) from public.messages m
                where m.client_id = p_client_id and m.role = 'assistant'
                  and m.created_at >= now() - interval '60 days'
                  and m.created_at <  now() - interval '30 days'
                  and (extract(isodow from m.created_at at time zone p_tz) = 6
                       or extract(hour from m.created_at at time zone p_tz) < 9
                       or extract(hour from m.created_at at time zone p_tz) >= 18))
    )
  );
$$;

grant execute on function public.dashboard_stats(text, text) to authenticated;
