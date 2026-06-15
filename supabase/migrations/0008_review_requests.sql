-- ============================================================
-- 0008 — automatic Google review requests after a completed appointment.
-- ============================================================

-- the clinic's Google "write a review" link (editable from the dashboard)
alter table public.clients add column if not exists google_review_url text;

-- on/off toggle (shows up in Controls)
alter table public.client_settings add column if not exists reviews_enabled boolean not null default true;

-- dedup: one review request per appointment, and supports the per-patient cap
create table if not exists public.review_requests (
  client_id text not null references public.clients(client_id) on delete cascade,
  event_id text not null,
  phone text,
  sent_at timestamptz not null default now(),
  primary key (client_id, event_id)
);
create index if not exists review_requests_phone_idx on public.review_requests (client_id, phone, sent_at);
alter table public.review_requests enable row level security;
-- bot-only via service role; no client-facing policy needed
