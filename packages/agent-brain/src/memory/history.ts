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

  CREATE TABLE IF NOT EXISTS reminders_sent (
    eventId TEXT NOT NULL,
    bucket  INTEGER NOT NULL,
    sentAt  INTEGER NOT NULL,
    PRIMARY KEY (eventId, bucket)
  );

  CREATE TABLE IF NOT EXISTS hitl_pending (
    clientId     TEXT PRIMARY KEY,
    patientPhone TEXT NOT NULL,
    draftReply   TEXT NOT NULL,
    intent       TEXT,
    actionTaken  TEXT,
    createdAt    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leads (
    clientId  TEXT NOT NULL,
    phone     TEXT NOT NULL,
    stage     INTEGER NOT NULL DEFAULT 0,
    dueAt     INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    PRIMARY KEY (clientId, phone)
  );
`);

/** Has the reminder for (eventId, bucket-hours) already gone out? */
export function wasReminderSent(eventId: string, bucket: number): boolean {
  const row = db
    .prepare('SELECT 1 FROM reminders_sent WHERE eventId = ? AND bucket = ?')
    .get(eventId, bucket);
  return Boolean(row);
}

/** Record that a reminder was sent (idempotent). */
export function markReminderSent(eventId: string, bucket: number): void {
  db.prepare(
    'INSERT OR IGNORE INTO reminders_sent (eventId, bucket, sentAt) VALUES (?, ?, ?)',
  ).run(eventId, bucket, Date.now());
}

export interface HitlPending {
  clientId: string;
  patientPhone: string;
  draftReply: string;
  intent?: string;
  actionTaken?: string;
}

/** Store (or replace) the pending HITL approval for a client. */
export function setPending(p: HitlPending): void {
  db.prepare(
    `INSERT INTO hitl_pending (clientId, patientPhone, draftReply, intent, actionTaken, createdAt)
     VALUES (@clientId, @patientPhone, @draftReply, @intent, @actionTaken, @createdAt)
     ON CONFLICT(clientId) DO UPDATE SET
       patientPhone = excluded.patientPhone,
       draftReply   = excluded.draftReply,
       intent       = excluded.intent,
       actionTaken  = excluded.actionTaken,
       createdAt    = excluded.createdAt`,
  ).run({
    clientId: p.clientId,
    patientPhone: p.patientPhone,
    draftReply: p.draftReply,
    intent: p.intent ?? null,
    actionTaken: p.actionTaken ?? null,
    createdAt: Date.now(),
  });
}

export function getPending(clientId: string): HitlPending | undefined {
  const row = db.prepare('SELECT * FROM hitl_pending WHERE clientId = ?').get(clientId) as
    | { clientId: string; patientPhone: string; draftReply: string; intent: string | null; actionTaken: string | null }
    | undefined;
  if (!row) return undefined;
  return {
    clientId: row.clientId,
    patientPhone: row.patientPhone,
    draftReply: row.draftReply,
    intent: row.intent ?? undefined,
    actionTaken: row.actionTaken ?? undefined,
  };
}

export function clearPending(clientId: string): void {
  db.prepare('DELETE FROM hitl_pending WHERE clientId = ?').run(clientId);
}

export interface Lead {
  clientId: string;
  phone: string;
  stage: number;
  dueAt: number;
}

/** Record/refresh a lead (booking interest, not yet booked). Resets stage. */
export function upsertLead(clientId: string, phone: string, dueAt: number): void {
  db.prepare(
    `INSERT INTO leads (clientId, phone, stage, dueAt, createdAt)
     VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(clientId, phone) DO UPDATE SET stage = 0, dueAt = excluded.dueAt`,
  ).run(clientId, phone, dueAt, Date.now());
}

export function clearLead(clientId: string, phone: string): void {
  db.prepare('DELETE FROM leads WHERE clientId = ? AND phone = ?').run(clientId, phone);
}

export function advanceLead(clientId: string, phone: string, stage: number, dueAt: number): void {
  db.prepare('UPDATE leads SET stage = ?, dueAt = ? WHERE clientId = ? AND phone = ?').run(
    stage,
    dueAt,
    clientId,
    phone,
  );
}

/** Leads whose follow-up is due (dueAt <= now). */
export function getDueLeads(clientId: string, now: number): Lead[] {
  const rows = db
    .prepare('SELECT clientId, phone, stage, dueAt FROM leads WHERE clientId = ? AND dueAt <= ?')
    .all(clientId, now) as Lead[];
  return rows;
}

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
