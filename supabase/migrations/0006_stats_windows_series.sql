-- ============================================================
-- 0006 — parameterize dashboard_stats by window length (week/month/year)
-- and add dashboard_series() for the overview chart (appointments over time).
-- ============================================================

drop function if exists public.dashboard_stats(text, text);

create or replace function public.dashboard_stats(
  p_client_id text,
  p_days int default 30,
  p_tz text default 'Asia/Jerusalem'
)
returns json
language sql
security invoker
stable
as $$
  select json_build_object(
    'appointments', json_build_object(
      'cur',  (select count(*) from public.appointments a where a.client_id=p_client_id and a.booked_by='replai' and a.created_at >= now()-(p_days||' days')::interval),
      'prev', (select count(*) from public.appointments a where a.client_id=p_client_id and a.booked_by='replai' and a.created_at >= now()-(2*p_days||' days')::interval and a.created_at < now()-(p_days||' days')::interval)
    ),
    'leads_recovered', json_build_object(
      'cur',  (select count(*) from public.leads l where l.client_id=p_client_id and l.status='recovered' and l.recovered_at >= now()-(p_days||' days')::interval),
      'prev', (select count(*) from public.leads l where l.client_id=p_client_id and l.status='recovered' and l.recovered_at >= now()-(2*p_days||' days')::interval and l.recovered_at < now()-(p_days||' days')::interval)
    ),
    'conversations', json_build_object(
      'cur',  (select count(distinct phone) from public.messages m where m.client_id=p_client_id and m.role='user' and m.created_at >= now()-(p_days||' days')::interval),
      'prev', (select count(distinct phone) from public.messages m where m.client_id=p_client_id and m.role='user' and m.created_at >= now()-(2*p_days||' days')::interval and m.created_at < now()-(p_days||' days')::interval)
    ),
    'reminders', json_build_object(
      'cur',  (select count(*) from public.reminders_sent r where r.client_id=p_client_id and r.sent_at >= now()-(p_days||' days')::interval),
      'prev', (select count(*) from public.reminders_sent r where r.client_id=p_client_id and r.sent_at >= now()-(2*p_days||' days')::interval and r.sent_at < now()-(p_days||' days')::interval)
    ),
    'after_hours', json_build_object(
      'cur',  (select count(*) from public.messages m where m.client_id=p_client_id and m.role='assistant' and m.created_at >= now()-(p_days||' days')::interval
                and (extract(isodow from m.created_at at time zone p_tz)=6 or extract(hour from m.created_at at time zone p_tz)<9 or extract(hour from m.created_at at time zone p_tz)>=18)),
      'prev', (select count(*) from public.messages m where m.client_id=p_client_id and m.role='assistant' and m.created_at >= now()-(2*p_days||' days')::interval and m.created_at < now()-(p_days||' days')::interval
                and (extract(isodow from m.created_at at time zone p_tz)=6 or extract(hour from m.created_at at time zone p_tz)<9 or extract(hour from m.created_at at time zone p_tz)>=18))
    )
  );
$$;

grant execute on function public.dashboard_stats(text, int, text) to authenticated;

-- appointments booked per bucket (day or month), zero-filled, for the chart
create or replace function public.dashboard_series(
  p_client_id text,
  p_days int default 30,
  p_bucket text default 'day',
  p_tz text default 'Asia/Jerusalem'
)
returns json
language sql
security invoker
stable
as $$
  with buckets as (
    select gs as b
    from generate_series(
      date_trunc(p_bucket, (now() at time zone p_tz) - ((p_days - 1) || ' days')::interval),
      date_trunc(p_bucket, (now() at time zone p_tz)),
      ('1 ' || p_bucket)::interval
    ) gs
  ),
  appts as (
    select date_trunc(p_bucket, (a.created_at at time zone p_tz)) as b, count(*) n
    from public.appointments a
    where a.client_id = p_client_id and a.booked_by = 'replai'
      and a.created_at >= now() - (p_days || ' days')::interval
    group by 1
  )
  select coalesce(
    json_agg(json_build_object('t', to_char(b.b, 'YYYY-MM-DD'), 'v', coalesce(a.n, 0)) order by b.b),
    '[]'::json
  )
  from buckets b
  left join appts a on a.b = b.b;
$$;

grant execute on function public.dashboard_series(text, int, text, text) to authenticated;
