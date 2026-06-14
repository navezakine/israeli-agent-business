// routes/cron.ts — scheduled jobs triggered by n8n (POST /cron/...)

import { Router } from 'express';
import { loadClientConfig, listClientIds } from '../context/loader.js';
import { runReminders } from '../reminders/reminders.js';
import { runLeadFollowups } from '../reminders/leads.js';
import { notifyError } from '../alerts/alerts.js';

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

function targetClients(req: import('express').Request): string[] {
  const clientId = (req.query.clientId as string) || (req.body?.clientId as string);
  return clientId ? [clientId] : listClientIds();
}

// POST /cron/run — all scheduled jobs (reminders + lead follow-ups) for each client.
cronRouter.post('/run', async (req, res) => {
  const ids = targetClients(req);
  const results: Record<string, unknown> = {};
  for (const id of ids) {
    try {
      const config = loadClientConfig(id);
      results[id] = {
        reminders: await runReminders(config),
        leads: await runLeadFollowups(config),
      };
    } catch (err) {
      console.error('[cron/run]', id, err);
      await notifyError(`cron/${id}`, err);
      results[id] = { error: 'failed' };
    }
  }
  res.json({ ran: ids, results });
});

// POST /cron/reminders — reminders only (kept for backward compatibility).
cronRouter.post('/reminders', async (req, res) => {
  const ids = targetClients(req);
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
