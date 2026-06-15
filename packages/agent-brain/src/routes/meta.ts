// routes/meta.ts — Meta webhook for Instagram DMs + Facebook Messenger.
// GET  /webhook/meta  → webhook verification handshake.
// POST /webhook/meta  → inbound messages; routed through the same agent brain.

import { Router } from 'express';
import { loadClientConfig, loadVault } from '../context/loader.js';
import { applyClientOverrides } from '../db/profile.js';
import { getToggles } from '../db/settings.js';
import {
  getRecentMessages,
  appendMessage,
  setPending,
  upsertLead,
  markBookedLead,
} from '../memory/history.js';
import { getChannelAccount, sendMetaMessage } from '../meta/meta.js';
import { runAgent } from '../claude/client.js';
import * as whatsapp from '../twilio/whatsapp.js';
import { buildHitlPrompt } from '../hitl/hitl.js';
import { notifyError } from '../alerts/alerts.js';
import type { ClientConfig, AgentResult } from '../types.js';

export const metaRouter = Router();

const BOOKING_HINT = /תור|לקבוע|להזמין|פנוי|זמין|מתי יש/;

async function trackLead(
  config: ClientConfig,
  from: string,
  body: string,
  result: AgentResult,
): Promise<void> {
  if (result.actionRequired?.type === 'book_appointment') {
    await markBookedLead(config.clientId, from);
  } else if (result.intent === 'booking' || BOOKING_HINT.test(body)) {
    await upsertLead(config.clientId, from, Date.now() + config.leadFollowUpHours * 3_600_000);
  }
}

// ── webhook verification (Meta calls this once when you subscribe) ──
metaRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === process.env.META_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

// ── inbound messages ──
metaRouter.post('/', async (req, res) => {
  // Meta requires a fast 200; acknowledge first, then process.
  res.sendStatus(200);
  try {
    const body = req.body;
    if (!body || !Array.isArray(body.entry)) return;
    for (const entry of body.entry) {
      const events = entry.messaging || entry.standby || [];
      for (const ev of events) {
        const msg = ev.message;
        if (!msg || msg.is_echo) continue; // ignore echoes/our own sends
        const senderId = ev.sender?.id;
        const accountId = ev.recipient?.id || entry.id; // the page/IG account that received it
        const text = msg.text;
        if (!senderId || !accountId || !text) continue; // text-only for now
        await handleMetaInbound(String(accountId), String(senderId), String(text)).catch((e) =>
          console.error('[meta] inbound handler', e),
        );
      }
    }
  } catch (err) {
    console.error('[meta webhook] error', err);
  }
});

async function handleMetaInbound(accountExternalId: string, senderId: string, text: string) {
  const account = await getChannelAccount(accountExternalId);
  if (!account) {
    console.warn('[meta] no connected clinic for account', accountExternalId);
    return;
  }
  const { clientId, channel } = account;
  try {
    const config = await applyClientOverrides(loadClientConfig(clientId));
    const vault = loadVault(clientId);
    const toggles = await getToggles(clientId);

    // history BEFORE recording the current message, then record inbound
    const history = await getRecentMessages(clientId, senderId, 10, channel);
    await appendMessage({ clientId, phoneNumber: senderId, role: 'user', content: text, channel });

    // paused: inbound is logged, nothing is sent back
    if (!toggles.botActive || !toggles.autoReply) return;

    const result = await runAgent({ config, vault, history, userMessage: text, from: senderId });

    await appendMessage({
      clientId,
      phoneNumber: senderId,
      role: 'assistant',
      content: result.reply,
      intent: result.intent,
      actionTaken: result.actionRequired?.type,
      channel,
      hitl: toggles.hitlEnabled,
    });

    await trackLead(config, senderId, text, result);

    if (toggles.hitlEnabled) {
      // queue for approval; the approver replies on WhatsApp, and the approval
      // is routed back to this Meta conversation (see routes/message.ts).
      await setPending({
        clientId,
        patientPhone: senderId,
        draftReply: result.reply,
        intent: result.intent,
        actionTaken: result.actionRequired?.type,
        channel,
        recipient: senderId,
        accountExternalId,
      });
      try {
        await whatsapp.sendWhatsApp(
          config.hitlApproverWhatsapp,
          buildHitlPrompt(clientId, senderId, result.reply),
        );
      } catch (err) {
        console.error('[meta] notify approver failed', err);
      }
      return;
    }

    await sendMetaMessage(account.externalId, account.accessToken, senderId, result.reply);
  } catch (err) {
    console.error('[meta] processing error', err);
    await notifyError(`meta/${clientId}`, err);
  }
}
