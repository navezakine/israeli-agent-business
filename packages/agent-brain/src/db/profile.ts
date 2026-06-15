// db/profile.ts — overlay dashboard-editable profile fields (address,
// business hours) from Supabase onto the file-based config.json. Falls back
// silently to the config.json values if Supabase is missing or has no row.

import { getSupabase } from './supabase.js';
import { getApprovedFaqs } from '../memory/history.js';
import type { ClientConfig } from '../types.js';

export async function applyClientOverrides(config: ClientConfig): Promise<ClientConfig> {
  const sb = getSupabase();
  if (!sb) return config;
  const { data, error } = await sb
    .from('clients')
    .select(
      'address, business_hours, google_review_url, payment_mode, deposit_amount, payment_link, payment_link_bit',
    )
    .eq('client_id', config.clientId)
    .maybeSingle();
  if (!error && data) {
    if (data.address != null) config.address = data.address;
    if (data.business_hours) config.businessHours = data.business_hours;
    if (data.google_review_url != null) config.googleReviewUrl = data.google_review_url;
    if (data.payment_mode != null) config.paymentMode = data.payment_mode;
    if (data.deposit_amount != null) config.depositAmount = data.deposit_amount;
    if (data.payment_link != null) config.paymentLink = data.payment_link;
    if (data.payment_link_bit != null) config.paymentLinkBit = data.payment_link_bit;
  }

  // Self-improving FAQ: fold any approved Q&A pairs into the knowledge base.
  const approved = await getApprovedFaqs(config.clientId);
  if (approved.length) {
    config.extraFaqs = approved.map((f) => `ש: ${f.question}\nת: ${f.answer}`).join('\n\n');
  }
  return config;
}
