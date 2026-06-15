-- ============================================================
-- 0007 — multi-channel support (Instagram + Facebook Messenger via Meta).
-- Adds a channel tag to messages, a secure per-clinic token store, and
-- cross-channel fields on hitl_pending so an approval (which arrives on
-- WhatsApp) can be routed back to the original IG/FB conversation.
-- ============================================================

-- tag each message with the channel it came through
alter table public.messages add column if not exists channel text not null default 'whatsapp';

-- per-clinic Meta account + access token (SECRET; bot-only via service role)
create table if not exists public.channel_accounts (
  id bigint generated always as identity primary key,
  client_id text not null references public.clients(client_id) on delete cascade,
  channel text not null,              -- 'facebook' | 'instagram'
  external_id text not null,          -- Page ID or IG account ID (the webhook recipient/account id)
  access_token text not null,         -- page/IG access token (secret)
  display_name text,
  created_at timestamptz not null default now(),
  unique (channel, external_id)
);
alter table public.channel_accounts enable row level security;
-- no client-facing policies on purpose: tokens are secrets, bot-only (service role bypasses RLS)

-- let HITL drafts remember which channel/conversation they belong to
alter table public.hitl_pending add column if not exists channel text not null default 'whatsapp';
alter table public.hitl_pending add column if not exists recipient text;             -- sender id to reply to (phone / IGSID / PSID)
alter table public.hitl_pending add column if not exists account_external_id text;   -- which page/IG account to send from
