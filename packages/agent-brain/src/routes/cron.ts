// routes/cron.ts — scheduled jobs triggered by n8n (POST /cron/...)

import { Router } from 'express';
import { loadClientConfig, listClientIds } from '../context/loader.js';
import { runReminders } from '../reminders/reminders.js';

export const cronRouter = Router();

// Shared-secret gate: if CRON_SECRET is set, require a matching x-cron-secret header.
cronRouter.use((req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['x-cron-secret'] !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
});

// POST /cron/reminders  — send due appointment reminders for one or all clients.
cronRouter.post('/reminders', async (req, res) => {
  const clientId = (req.query.clientId as string) || (req.body?.clientId as string);
  const ids = clientId ? [clientId] : listClientIds();

  const results: Record<string, unknown> = {};
  for (const id of ids) {
    try {
      results[id] = await runReminders(loadClientConfig(id));
    } catch (err) {
      console.error('[cron/reminders]', id, err);
      results[id] = { error: 'failed' };
    }
  }
  res.json({ ran: ids, results });
});
