-- ============================================================
-- 0010 — payment collection at booking (bring-your-own payment link).
-- Replai does not process payments; it sends the clinic's own link.
-- ============================================================

alter table public.clients add column if not exists payment_mode text not null default 'off'; -- 'deposit' | 'full' | 'off'
alter table public.clients add column if not exists deposit_amount int;                        -- ₪, for deposit mode
alter table public.clients add column if not exists payment_link text;                         -- primary link (card / payment page)
alter table public.clients add column if not exists payment_link_bit text;                     -- optional Bit link
