// claude/client.ts — Anthropic wrapper + agent loop (tool use)

import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools.js';
import { buildSystemPrompt } from './prompts.js';
import * as calendar from '../calendar/google.js';
import type {
  ActionRequired,
  AgentResult,
  ClientConfig,
  ConversationMessage,
  VaultFiles,
} from '../types.js';

// Model is env-configurable so we can run cheap during testing (claude-haiku-4-5)
// and switch to the better model (claude-sonnet-4-6) for production by changing CLAUDE_MODEL.
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;
const MAX_TURNS = 5; // safety bound on the tool-use loop

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

interface ToolOutcome {
  result: unknown; // returned to Claude as tool_result content
  action?: ActionRequired;
  intent?: string;
}

// ─────────────────────────────────────────────────────────────
// Tool executors.
// check_availability / book_appointment use Google Calendar when credentials
// are present; otherwise they fall back to stub data so demos still run without
// Google set up. escalate_to_human just sets an actionRequired flag.
// ─────────────────────────────────────────────────────────────
const STUB_SLOTS = ['10:00', '11:30', '14:00', '16:15'];

async function executeTool(
  block: Anthropic.Messages.ToolUseBlock,
  config: ClientConfig,
  from: string,
): Promise<ToolOutcome> {
  switch (block.name) {
    case 'check_availability': {
      const input = block.input as { date: string; preferredTime?: string };
      if (!calendar.isConfigured()) {
        return {
          intent: 'booking',
          result: { date: input.date, availableSlots: STUB_SLOTS, note: 'STUB — Google Calendar not configured' },
        };
      }
      try {
        const slots = await calendar.getAvailableSlots(config, input.date);
        return { intent: 'booking', result: { date: input.date, slots } };
      } catch (err) {
        console.error('[check_availability]', err);
        return { intent: 'booking', result: { error: 'calendar lookup failed' } };
      }
    }
    case 'book_appointment': {
      const input = block.input as {
        patientName: string;
        patientPhone: string;
        dateTime: string;
        treatmentType?: string;
        notes?: string;
      };
      // Reminders are sent over WhatsApp, so the WhatsApp contact for the event
      // is the conversation's `from` (E.164). Keep any patient-typed number as a note.
      const typed = input.patientPhone && input.patientPhone !== from ? `טלפון: ${input.patientPhone}` : '';
      const details = {
        patientName: input.patientName,
        patientPhone: from,
        dateTime: input.dateTime,
        treatmentType: input.treatmentType,
        notes: [input.notes, typed].filter(Boolean).join(' ').trim() || undefined,
      };
      if (!calendar.isConfigured()) {
        return {
          intent: 'booking',
          action: { type: 'book_appointment', payload: details },
          result: { booked: true, confirmation: details, note: 'STUB — not written to a real calendar' },
        };
      }
      try {
        const event = await calendar.bookAppointment(config, details);
        return {
          intent: 'booking',
          action: { type: 'book_appointment', payload: { ...details, ...event } },
          result: { booked: true, confirmation: details, eventId: event.eventId },
        };
      } catch (err) {
        console.error('[book_appointment]', err);
        return { intent: 'booking', result: { booked: false, error: 'booking failed' } };
      }
    }
    case 'escalate_to_human': {
      const input = block.input as { reason: string; urgency: string };
      return {
        intent: 'complaint',
        action: { type: 'escalate_to_human', payload: input },
        result: { escalated: true },
      };
    }
    default:
      return { result: { error: `unknown tool: ${block.name}` } };
  }
}

export async function runAgent(opts: {
  config: ClientConfig;
  vault: VaultFiles;
  history: ConversationMessage[];
  userMessage: string;
  from: string;
}): Promise<AgentResult> {
  const { config, vault, history, userMessage, from } = opts;
  const system = buildSystemPrompt(config, vault);

  const messages: Anthropic.Messages.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  let actionRequired: ActionRequired | undefined;
  let intent = 'faq';

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools,
      messages,
    });

    if (res.stop_reason === 'tool_use') {
      const toolUses = res.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );
      messages.push({ role: 'assistant', content: res.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const outcome = await executeTool(tu, config, from);
        if (outcome.action) actionRequired = outcome.action;
        if (outcome.intent) intent = outcome.intent;
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(outcome.result),
        });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Final text reply.
    const reply = res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { reply, intent, actionRequired };
  }

  // Loop bound hit — fail gracefully.
  return {
    reply: 'רגע, יש לי תקלה קטנה. נציג שלנו יחזור אליך בהקדם 🙏',
    intent: 'unknown',
    actionRequired,
  };
}
