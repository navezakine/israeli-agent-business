// routes/message.ts — POST /message (called by n8n)

import { Router } from 'express';
import { z } from 'zod';
import { loadClientConfig, loadVault } from '../context/loader.js';
import {
  getRecentMessages,
  appendMessage,
  setPending,
  getPending,
  clearPending,
  upsertLead,
  markBookedLead,
} from '../memory/history.js';
import { getToggles } from '../db/settings.js';
import { applyClientOverrides } from '../db/profile.js';
import type { ClientConfig, AgentResult } from '../types.js';
import { runAgent } from '../claude/client.js';
import * as whatsapp from '../twilio/whatsapp.js';
import { interpretApproval, buildHitlPrompt, normalizePhone } from '../hitl/hitl.js';
import { sendOnChannel } from '../meta/meta.js';
import { appendLogRow } from '../google/sheets.js';
import { notifyError } from '../alerts/alerts.js';
import type { MessageResponse } from '../types.js';

const requestSchema = z.object({
  clientId: z.string().min(1),
  from: z.string().min(1),
  body: z.string().min(1),
  messageId: z.string().optional(),
  timestamp: z.string().optional(),
});

// Words that signal booking interest even before any calendar tool fires.
const BOOKING_HINT = /תור|לקבוע|להזמין|פנוי|זמין|מתי יש/;

// Booking interest with no completed booking → track as a lead for follow-up.
// A completed booking resolves any existing lead (recovered if we'd nudged it).
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

// Best-effort interaction log to the client's Google Sheet (never blocks the reply).
async function logInteraction(
  config: ClientConfig,
  from: string,
  intent: string,
  action: string | undefined,
  hitl: boolean,
): Promise<void> {
  if (!config.logSheetId) return;
  try {
    await appendLogRow(config.logSheetId, [
      new Date().toISOString(),
      '…' + from.slice(-4),
      intent,
      action ?? '',
      hitl ? 'HITL' : '',
    ]);
  } catch (err) {
    console.error('[log] append failed', err);
  }
}

export const messageRouter = Router();

messageRouter.post('/', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid request', details: parsed.error.flatten() });
    return;
  }

  const { clientId, from, body } = parsed.data;

  try {
    const config = await applyClientOverrides(loadClientConfig(clientId));
    const vault = loadVault(clientId);
    const toggles = await getToggles(clientId);

    // ── Paused: master off OR auto-replies off ────────────────
    // Still record the inbound message (so counts/insights stay accurate),
    // but send nothing back to the patient.
    if (!toggles.botActive || !toggles.autoReply) {
      await appendMessage({ clientId, phoneNumber: from, role: 'user', content: body });
      res.json({ reply: '', intent: 'paused', botPaused: true });
      return;
    }

    // ── HITL branch (driven by the dashboard toggle) ──────────
    if (toggles.hitlEnabled) {
      const pending = await getPending(clientId);
      const fromApprover = normalizePhone(from) === normalizePhone(config.hitlApproverWhatsapp);

      // (a) Approver is responding to a pending draft → resolve it.
      if (fromApprover && pending) {
        const decision = interpretApproval(body);
        if (decision.type === 'cancel') {
          await clearPending(clientId);
          res.json({ reply: '❌ בוטל — לא נשלח ללקוח.', intent: 'hitl', hitlHandled: true });
          return;
        }
        const finalText =
          decision.type === 'override' && decision.text ? decision.text : pending.draftReply;
        let ack = `✅ נשלח ל-${pending.patientPhone}`;
        try {
          if (pending.channel && pending.channel !== 'whatsapp') {
            // draft came from Instagram/Facebook → send the approved reply back there
            const ok = await sendOnChannel(pending, finalText);
            if (!ok) throw new Error('meta send failed');
          } else {
            await whatsapp.sendWhatsApp(pending.recipient ?? pending.patientPhone, finalText);
          }
        } catch (err) {
          console.error('[hitl] send to patient failed', err);
          ack = '⚠️ ההודעה לא נשלחה (תקלת שליחה). נסה שוב.';
        }
        await clearPending(clientId);
        res.json({ reply: ack, intent: 'hitl', hitlHandled: true });
        return;
      }

      // (b) Normal patient message under HITL → draft, queue, notify approver.
      const history = await getRecentMessages(clientId, from);
      await appendMessage({ clientId, phoneNumber: from, role: 'user', content: body });
      const result = await runAgent({ config, vault, history, userMessage: body, from });
      await appendMessage({
        clientId,
        phoneNumber: from,
        role: 'assistant',
        content: result.reply,
        intent: result.intent,
        actionTaken: result.actionRequired?.type,
        hitl: true,
      });

      await trackLead(config, from, body, result);
      await setPending({
        clientId,
        patientPhone: from,
        draftReply: result.reply,
        intent: result.intent,
        actionTaken: result.actionRequired?.type,
      });
      try {
        await whatsapp.sendWhatsApp(
          config.hitlApproverWhatsapp,
          buildHitlPrompt(clientId, from, result.reply),
        );
      } catch (err) {
        console.error('[hitl] notify approver failed', err);
      }

      await logInteraction(config, from, result.intent, result.actionRequired?.type, true);
      // Empty reply → n8n sends nothing to the patient yet.
      res.json({ reply: '', intent: result.intent, hitlPending: true });
      return;
    }

    // ── Normal (non-HITL) path ────────────────────────────────
    const history = await getRecentMessages(clientId, from);
    await appendMessage({ clientId, phoneNumber: from, role: 'user', content: body });

    const result = await runAgent({ config, vault, history, userMessage: body, from });

    await appendMessage({
      clientId,
      phoneNumber: from,
      role: 'assistant',
      content: result.reply,
      intent: result.intent,
      actionTaken: result.actionRequired?.type,
    });

    await trackLead(config, from, body, result);
    await logInteraction(config, from, result.intent, result.actionRequired?.type, false);

    const response: MessageResponse = {
      reply: result.reply,
      intent: result.intent,
      actionRequired: result.actionRequired,
      hitlPending: false,
    };
    res.json(response);
  } catch (err) {
    console.error('[/message] error:', err);
    await notifyError(`message/${clientId}`, err);
    res.status(500).json({ error: 'internal error' });
  }
});
