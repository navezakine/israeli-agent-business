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
  openHandoff,
  getOpenHandoff,
  getOpenHandoffs,
  resolveHandoff,
  resolveHandoffByLast4,
  createFaqSuggestion,
  decideLatestFaqSuggestion,
} from '../memory/history.js';
import { getToggles } from '../db/settings.js';
import { applyClientOverrides } from '../db/profile.js';
import type { ClientConfig, AgentResult } from '../types.js';
import { runAgent } from '../claude/client.js';
import { transcribeVoiceNote } from '../media/transcribe.js';
import * as whatsapp from '../twilio/whatsapp.js';
import { interpretApproval, buildHitlPrompt, normalizePhone } from '../hitl/hitl.js';
import { sendOnChannel } from '../meta/meta.js';
import { appendLogRow } from '../google/sheets.js';
import { notifyError } from '../alerts/alerts.js';
import type { MessageResponse } from '../types.js';

export const requestSchema = z
  .object({
    clientId: z.string().min(1),
    from: z.string().min(1),
    body: z.string().optional().default(''),
    // Voice notes / media (n8n forwards Twilio's MediaUrl0 + MediaContentType0).
    // Empty strings (text messages) are normalized to undefined.
    mediaUrl: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().url().optional(),
    ),
    mediaContentType: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().optional(),
    ),
    messageId: z.string().optional(),
    timestamp: z.string().optional(),
  })
  .refine((d) => (d.body && d.body.trim().length > 0) || d.mediaUrl, {
    message: 'either body or mediaUrl is required',
  });

// Words that signal booking interest even before any calendar tool fires.
const BOOKING_HINT = /תור|לקבוע|להזמין|פנוי|זמין|מתי יש/;

// Operator command (from the clinic's number) to end a human handoff so the bot
// resumes for that patient, e.g. "חזרה 1234" / "resume 1234" (1234 = last 4 digits).
const RESUME_CMD = /^(?:חזרה|resume|המשך|continue)\b\s*(\d{2,})?/i;

// Operator commands to approve / dismiss the latest pending self-improving-FAQ
// suggestion (e.g. after answering an escalated question through the bot).
const ADD_FAQ_CMD = /^(?:הוסף|תוסיף|להוסיף|add|כן)\b/i;
const SKIP_FAQ_CMD = /^(?:דלג|התעלם|skip|לא)\b/i;

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

  const { clientId, from, mediaUrl, mediaContentType } = parsed.data;
  let body = (parsed.data.body ?? '').trim();

  try {
    const config = await applyClientOverrides(loadClientConfig(clientId));
    const vault = loadVault(clientId);
    const toggles = await getToggles(clientId);
    const canReply = toggles.botActive && toggles.autoReply;
    const fromApprover = normalizePhone(from) === normalizePhone(config.hitlApproverWhatsapp);

    // ── Operator commands (from the clinic's number) ──────────
    if (fromApprover) {
      // (1) End a handoff and let the bot resume, e.g. "חזרה 1234".
      const m = RESUME_CMD.exec(body);
      if (m) {
        const resumed = await resolveHandoffByLast4(clientId, (m[1] ?? '').slice(-4));
        res.json({
          reply: resumed
            ? `✅ מעולה, Replai חוזר לטפל ב-${resumed}.`
            : 'לא מצאתי שיחה פתוחה שהועברה לטיפול אנושי. כדי לציין מטופל ספציפי: "חזרה" ואחריו 4 הספרות האחרונות של מספרו.',
          intent: 'handoff_resume',
        });
        return;
      }

      // (2) Approve / dismiss the latest self-improving-FAQ suggestion.
      if (ADD_FAQ_CMD.test(body)) {
        const q = await decideLatestFaqSuggestion(clientId, 'approved');
        res.json({
          reply: q
            ? `✅ נוסף למאגר הידע. מעכשיו Replai יידע לענות על "${q}".`
            : 'אין הצעה ממתינה להוספה כרגע.',
          intent: 'faq_decision',
        });
        return;
      }
      if (SKIP_FAQ_CMD.test(body)) {
        const q = await decideLatestFaqSuggestion(clientId, 'dismissed');
        res.json({
          reply: q ? 'סבבה, לא הוספתי את זה למאגר 👍' : 'אין הצעה ממתינה כרגע.',
          intent: 'faq_decision',
        });
        return;
      }

      // (3) Otherwise, if a conversation is handed off, treat this as the owner's
      // answer: relay it to the patient, close the handoff, and (if we captured
      // the original question) save it as a FAQ suggestion to learn from.
      const open = await getOpenHandoffs(clientId);
      if (open.length) {
        // Pick the target. With one open handoff the whole message is the answer;
        // with several, the owner prefixes the patient's last 4 digits.
        let target = open.length === 1 ? open[0] : undefined;
        let answer = body;
        if (!target) {
          const lead = body.match(/^\s*(\d{3,})[\s:,-]+([\s\S]+)$/);
          if (lead) {
            const last4 = lead[1].slice(-4);
            target = open.find((h) => h.phone.replace(/\D/g, '').endsWith(last4));
            if (target) answer = lead[2].trim();
          }
          if (!target) {
            res.json({
              reply: 'יש כמה שיחות פתוחות. ענה/י בפורמט: 4 ספרות אחרונות של המטופל, רווח, ואז התשובה.',
              intent: 'handoff_answer',
            });
            return;
          }
        }
        try {
          await whatsapp.sendWhatsApp(target.phone, answer);
        } catch (err) {
          console.error('[handoff] relay answer failed', err);
        }
        await appendMessage({
          clientId,
          phoneNumber: target.phone,
          role: 'assistant',
          content: answer,
          intent: 'human_answer',
        });
        await resolveHandoff(clientId, target.phone);
        if (target.question) {
          await createFaqSuggestion(clientId, target.question, answer);
          res.json({
            reply: `✅ נשלח ל-${target.phone}. רוצה שאוסיף את זה למאגר הידע כדי ש-Replai יענה על זה בעצמו בפעם הבאה? השב/י "הוסף" או "דלג".`,
            intent: 'handoff_answer',
          });
        } else {
          res.json({ reply: `✅ נשלח ל-${target.phone}.`, intent: 'handoff_answer' });
        }
        return;
      }
    }

    // ── Voice note / media → transcribe to text ───────────────
    // WhatsApp voice notes arrive as audio media with an empty Body. Transcribe
    // them (OpenAI Whisper, auto language detection) and treat the transcript as
    // the user's message. Non-audio media isn't supported yet.
    if (mediaUrl) {
      const isAudio = !mediaContentType || mediaContentType.startsWith('audio');
      if (isAudio) {
        const transcript = await transcribeVoiceNote(mediaUrl, mediaContentType);
        if (transcript) {
          body = transcript;
        } else {
          await appendMessage({ clientId, phoneNumber: from, role: 'user', content: '[הודעה קולית]' });
          const fallback =
            'היי! קיבלתי הודעה קולית אבל לא הצלחתי להבין אותה. אפשר לכתוב לי כאן בהודעה? 🙏';
          res.json(
            canReply
              ? { reply: fallback, intent: 'voice_unreadable' }
              : { reply: '', intent: 'voice_unreadable', botPaused: true },
          );
          return;
        }
      } else {
        // Photo / video / file → hand off to a human. Replai must NEVER interpret
        // a patient's image or give any medical advice, so the media is never sent
        // to Claude. We open a handoff (the bot stays silent for this patient until
        // the clinic resolves it), alert the clinic's human, and reply once.
        const kind = mediaContentType?.startsWith('image')
          ? 'תמונה'
          : mediaContentType?.startsWith('video')
            ? 'סרטון'
            : 'קובץ';
        await appendMessage({ clientId, phoneNumber: from, role: 'user', content: `[${kind}]` });
        const newlyOpened = await openHandoff(clientId, from, `patient sent ${kind}`);

        // Best-effort alert to the clinic's human (never blocks the patient reply).
        try {
          await whatsapp.sendWhatsApp(
            config.hitlApproverWhatsapp,
            `📸 מטופל (${from}) שלח ${kind}. Replai לא מנתח תמונות ולא נותן ייעוץ רפואי, אז השיחה הועברה אליך ו-Replai לא יענה לו/לה עד שתסיים/י. בסיום השב/י "חזרה ${from.slice(-4)}".`,
          );
        } catch (err) {
          console.error('[media] human handoff notify failed', err);
        }

        await logInteraction(config, from, 'escalation', 'escalate_to_human', false);

        // Reply to the patient only the first time (avoid repeating on every photo).
        const handoff = `קיבלנו את ה${kind} ששלחת 🙏 אני לא יכולה לבדוק תמונות וקבצים או לתת ייעוץ רפואי, אז העברתי אותך לצוות המרפאה והם יחזרו אליך בהקדם 😊`;
        res.json(
          canReply && newlyOpened
            ? {
                reply: handoff,
                intent: 'escalation',
                actionRequired: { type: 'escalate_to_human', payload: { reason: `patient sent ${kind}`, urgency: 'normal' } },
              }
            : { reply: '', intent: 'escalation', botPaused: !canReply },
        );
        return;
      }
    }

    // ── Handed off to a human → stay silent, forward to the clinic ──
    // Once a conversation is with a human, the bot does not auto-reply to that
    // patient until the clinic resolves it ("חזרה <last4>"). We still record the
    // message and forward it so the clinic sees the ongoing conversation.
    if (!fromApprover) {
      const open = await getOpenHandoff(clientId, from);
      if (open) {
        await appendMessage({ clientId, phoneNumber: from, role: 'user', content: body || '[מדיה]' });
        try {
          await whatsapp.sendWhatsApp(
            config.hitlApproverWhatsapp,
            `📨 מטופל (${from}) שכבר הועבר לטיפולך כתב: ${body || '[מדיה]'}`,
          );
        } catch (err) {
          console.error('[handoff] forward to human failed', err);
        }
        res.json({ reply: '', intent: 'handoff' });
        return;
      }
    }

    // ── Paused: master off OR auto-replies off ────────────────
    // Still record the inbound message (so counts/insights stay accurate),
    // but send nothing back to the patient.
    if (!canReply) {
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

    // ── Escalation → actively hand the conversation to a human ──
    // Ping the clinic's human, and make sure the patient never gets silence
    // (the model sometimes calls escalate_to_human without writing a reply).
    if (result.actionRequired?.type === 'escalate_to_human') {
      const reason = (result.actionRequired.payload as { reason?: string } | undefined)?.reason;
      await openHandoff(clientId, from, reason ?? 'escalation', body);
      try {
        await whatsapp.sendWhatsApp(
          config.hitlApproverWhatsapp,
          `🔔 מטופל (${from}) צריך מענה אנושי${reason ? ` (${reason})` : ''}. Replai העביר אליך את השיחה ולא יענה לו/לה עד שתסיים/י. בסיום השב/י "חזרה ${from.slice(-4)}".`,
        );
      } catch (err) {
        console.error('[escalate] human notify failed', err);
      }
      if (!result.reply) {
        result.reply = 'אני מעבירה אותך לצוות המרפאה והם יחזרו אליך בהקדם 🙏';
      }
    }

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
