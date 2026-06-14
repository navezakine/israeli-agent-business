// memory/history.ts — conversation history (SQLite via better-sqlite3)
// Stores every turn; returns the last N messages within a 24h window so a cold
// conversation (>24h silent) naturally starts fresh (spec key decision #6).

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConversationMessage } from '../types.js';

const DATA_DIR = resolve(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(resolve(DATA_DIR, 'history.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    clientId    TEXT NOT NULL,
    phoneNumber TEXT NOT NULL,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    intent      TEXT,
    actionTaken TEXT,
    timestamp   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lookup ON messages (clientId, phoneNumber, timestamp);
`);

const COLD_WINDOW_MS = 24 * 60 * 60 * 1000;

const insertStmt = db.prepare(`
  INSERT INTO messages (id, clientId, phoneNumber, role, content, intent, actionTaken, timestamp)
  VALUES (@id, @clientId, @phoneNumber, @role, @content, @intent, @actionTaken, @timestamp)
`);

export function appendMessage(m: ConversationMessage): void {
  insertStmt.run({
    id: randomUUID(),
    clientId: m.clientId,
    phoneNumber: m.phoneNumber,
    role: m.role,
    content: m.content,
    intent: m.intent ?? null,
    actionTaken: m.actionTaken ?? null,
    timestamp: Date.now(),
  });
}

const recentStmt = db.prepare(`
  SELECT * FROM messages
  WHERE clientId = ? AND phoneNumber = ? AND timestamp >= ?
  ORDER BY timestamp DESC
  LIMIT ?
`);

export function getRecentMessages(
  clientId: string,
  phoneNumber: string,
  limit = 10,
): ConversationMessage[] {
  const since = Date.now() - COLD_WINDOW_MS;
  const rows = recentStmt.all(clientId, phoneNumber, since, limit) as Array<{
    id: string;
    clientId: string;
    phoneNumber: string;
    role: 'user' | 'assistant';
    content: string;
    intent: string | null;
    actionTaken: string | null;
    timestamp: number;
  }>;
  return rows.reverse().map((r) => ({
    id: r.id,
    clientId: r.clientId,
    phoneNumber: r.phoneNumber,
    role: r.role,
    content: r.content,
    intent: r.intent ?? undefined,
    actionTaken: r.actionTaken ?? undefined,
    timestamp: new Date(r.timestamp),
  }));
}
