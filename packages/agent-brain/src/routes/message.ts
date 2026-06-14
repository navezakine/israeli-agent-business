// routes/message.ts — POST /message (called by n8n)

import { Router } from 'express';
import { z } from 'zod';
import { loadClientConfig, loadVault } from '../context/loader.js';
import { getRecentMessages, appendMessage } from '../memory/history.js';
import { runAgent } from '../claude/client.js';
import type { MessageResponse } from '../types.js';

const requestSchema = z.object({
  clientId: z.string().min(1),
  from: z.string().min(1),
  body: z.string().min(1),
  messageId: z.string().optional(),
  timestamp: z.string().optional(),
});

export const messageRouter = Router();

messageRouter.post('/', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid request', details: parsed.error.flatten() });
    return;
  }

  const { clientId, from, body } = parsed.data;

  try {
    const config = loadClientConfig(clientId);
    const vault = loadVault(clientId);

    // History excludes the current message (append it after we read history).
    const history = getRecentMessages(clientId, from);
    appendMessage({ clientId, phoneNumber: from, role: 'user', content: body });

    const result = await runAgent({ config, vault, history, userMessage: body, from });

    appendMessage({
      clientId,
      phoneNumber: from,
      role: 'assistant',
      content: result.reply,
      intent: result.intent,
      actionTaken: result.actionRequired?.type,
    });

    const response: MessageResponse = {
      reply: result.reply,
      intent: result.intent,
      actionRequired: result.actionRequired,
      hitlPending: config.hitlMode, // n8n queues for approval when true
    };
    res.json(response);
  } catch (err) {
    console.error('[/message] error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});
