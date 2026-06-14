// twilio/whatsapp.ts — Twilio send helper (proactive messages: reminders, follow-ups)

import twilio from 'twilio';

let client: ReturnType<typeof twilio> | null = null;
function getClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

/** Whether Twilio credentials + sender are present. */
export function isConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM,
  );
}

/** Send a WhatsApp message. `to` may be E.164 (+972…) or already `whatsapp:+972…`. */
export async function sendWhatsApp(to: string, body: string): Promise<string> {
  const from = process.env.TWILIO_WHATSAPP_FROM!; // e.g. whatsapp:+14155238886
  const toAddr = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const msg = await getClient().messages.create({ from, to: toAddr, body });
  return msg.sid;
}
