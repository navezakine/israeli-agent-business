// index.ts — Express app entry point

import './env.js'; // load .env + .env.supabase before anything reads process.env
import express from 'express';
import { messageRouter } from './routes/message.js';
import { cronRouter } from './routes/cron.js';
import { metaRouter } from './routes/meta.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6' });
});

app.use('/message', messageRouter);
app.use('/cron', cronRouter);
app.use('/webhook/meta', metaRouter);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`agent-brain listening on http://localhost:${PORT}`);
});
