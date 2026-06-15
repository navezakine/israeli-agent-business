// routes/cron.ts — scheduled jobs triggered by n8n (POST /cron/...)

import { Router } from 'express';
import { loadClientConfig, listClientIds } from '../context/loader.js';
import { getToggles } from '../db/settings.js';
import { applyClientOverrides } from '../db/profile.js';
import { runReminders } from '../reminders/reminders.js';
import { runLeadFollowups } from '../reminders/leads.js';
import { runReviewRequests } from '../reminders/reviews.js';
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

// POST /cron/run — all scheduled jobs (reminders + lead follow-ups) for each client,
// each gated by that client's dashboard toggles.
cronRouter.post('/run', async (req, res) => {
  const ids = targetClients(req);
  const results: Record<string, unknown> = {};
  for (const id of ids) {
    try {
      const config = await applyClientOverrides(loadClientConfig(id));
      const toggles = await getToggles(id);
      // Dashboard can override reminder lead times.
      if (toggles.reminderHours && toggles.reminderHours.length) {
        config.reminderHours = toggles.reminderHours;
      }
      results[id] = {
        reminders:
          toggles.botActive && toggles.remindersEnabled
            ? await runReminders(config)
            : { skipped: ['disabled'] },
        leads:
          toggles.botActive && toggles.followupsEnabled
            ? await runLeadFollowups(config)
            : { skipped: ['disabled'] },
        reviews:
          toggles.botActive && toggles.reviewsEnabled
            ? await runReviewRequests(config)
            : { skipped: ['disabled'] },
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
      const config = await applyClientOverrides(loadClientConfig(id));
      const toggles = await getToggles(id);
      if (toggles.reminderHours && toggles.reminderHours.length) {
        config.reminderHours = toggles.reminderHours;
      }
      results[id] =
        toggles.botActive && toggles.remindersEnabled
          ? await runReminders(config)
          : { skipped: ['disabled'] };
    } catch (err) {
      console.error('[cron/reminders]', id, err);
      results[id] = { error: 'failed' };
    }
  }
  res.json({ ran: ids, results });
});
