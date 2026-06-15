// meta/meta.ts — Instagram + Facebook Messenger via the Meta Graph API.
// Inbound arrives on the /webhook/meta route; this module resolves which clinic
// a page/IG account belongs to and sends outbound replies.

import { getSupabase } from '../db/supabase.js';
import type { HitlPending } from '../memory/history.js';

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';

export interface ChannelAccount {
  clientId: string;
  channel: string; // 'facebook' | 'instagram'
  externalId: string; // Page ID or IG account ID (the webhook recipient/account id)
  accessToken: string;
}

/** Resolve a connected Meta account by its external id (from the webhook). */
export async function getChannelAccount(externalId: string): Promise<ChannelAccount | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('channel_accounts')
    .select('client_id, channel, external_id, access_token')
    .eq('external_id', externalId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[meta] getChannelAccount', error.message);
    return null;
  }
  return {
    clientId: data.client_id,
    channel: data.channel,
    externalId: data.external_id,
    accessToken: data.access_token,
  };
}

/** Send a text message through a Meta page/IG account to a recipient (PSID/IGSID). */
export async function sendMetaMessage(
  externalId: string,
  accessToken: string,
  recipientId: string,
  text: string,
): Promise<boolean> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${externalId}/messages?access_token=${encodeURIComponent(
    accessToken,
  )}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[meta] send failed', res.status, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[meta] send threw', err);
    return false;
  }
}

/** Reply to a stored HITL draft on whatever Meta channel it originated from. */
export async function sendOnChannel(p: HitlPending, text: string): Promise<boolean> {
  if (!p.accountExternalId) return false;
  const account = await getChannelAccount(p.accountExternalId);
  if (!account) return false;
  return sendMetaMessage(
    account.externalId,
    account.accessToken,
    p.recipient ?? p.patientPhone,
    text,
  );
}
