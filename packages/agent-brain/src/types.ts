// types.ts — shared TypeScript types

/** Per-client configuration, loaded from clients/[clientId]/config.json */
export interface ClientConfig {
  clientId: string;
  agentName: string;
  agentEmail: string;
  whatsappNumber: string;
  googleCalendarId: string;
  timezone: string;
  language: string;
  address?: string; // used in reminder messages
  logSheetId?: string; // Google Sheet ID for interaction logging (optional)
  hitlMode: boolean;
  hitlApproverWhatsapp: string;
  businessHours: Record<string, string | null>; // keys: sun, mon, ... sat
  slotDurationMinutes: number;
  reminderHours: number[];
  leadFollowUpHours: number;
  escalationKeywords: string[];
}

/** The client's vault markdown files, read into memory. */
export interface VaultFiles {
  business: string;
  faqs: string;
  team: string;
  tone: string;
  procedures: string;
  noGo: string;
}

export type Intent =
  | 'booking'
  | 'faq'
  | 'complaint'
  | 'reschedule'
  | 'unknown';

/** An action the agent decided to take, surfaced to n8n. */
export interface ActionRequired {
  type: 'book_appointment' | 'send_reminder' | 'escalate_to_human' | 'collect_lead';
  payload: Record<string, unknown>;
}

/** Request body for POST /message (sent by n8n). */
export interface MessageRequest {
  clientId: string;
  from: string;       // E.164, e.g. +972501234567
  body: string;       // raw WhatsApp text
  messageId?: string; // Twilio message SID
  timestamp?: string; // ISO8601
}

/** Response from POST /message. */
export interface MessageResponse {
  reply: string;
  intent: string;
  actionRequired?: ActionRequired;
  hitlPending?: boolean;  // draft queued for approval, nothing sent to patient yet
  hitlHandled?: boolean;  // this request was an approver decision
}

/** A stored conversation turn. */
export interface ConversationMessage {
  id?: string;
  clientId: string;
  phoneNumber: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  intent?: string;
  actionTaken?: string;
}

/** Result returned by the agent loop. */
export interface AgentResult {
  reply: string;
  intent: string;
  actionRequired?: ActionRequired;
}
