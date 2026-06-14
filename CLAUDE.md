# Claude Code Context — Israeli AI Agent Business MVP

> Give this entire file to Claude Code at the start of every session.
> It is the single source of truth for what we're building, why, and how.

---

## What We're Building

A **done-for-you AI agent business** targeting Israeli SMBs. We build and manage AI agents that act as "digital employees" for business owners — handling WhatsApp inbound, appointment booking, follow-ups, reminders, and reporting. In Hebrew. Starting with private medical clinics.

The product we're building in this session is twofold:
1. **A fully working MVP agent** for a demo medical clinic — wired to real WhatsApp, real Google Calendar, real Claude API. Ready to hand to a first paying client.
2. **A reusable template** — structured so each new client is a new folder + config, not a new codebase.

Business model: ₪5,500–₪8,000/month flat fee per client. No setup fee charged separately — Month 1 is the setup month. We operate as a one-person agency using our own tools to manage all clients.

---

## Accounts Already Set Up

| Service | Status |
|---|---|
| Claude API (Anthropic) | ✅ Have API key |
| Twilio (WhatsApp Business API) | ✅ Have account |
| n8n | ❌ Need to set up |
| Google Calendar API | ❌ Need to set up credentials |
| Railway (hosting) | ❌ Need to set up |
| Agent Mail | ❌ Need to set up |
| Composio | ❌ Not using for now |

---

## Tech Stack Decision

**Architecture: Hybrid — n8n for orchestration, Node.js/TypeScript for the agent brain**

| Layer | Tool | Why |
|---|---|---|
| Orchestration / plumbing | n8n (Cloud) | Receives WhatsApp webhooks, handles scheduling, cron jobs, delays, CRM updates — visually. No per-execution fees on n8n Cloud. |
| Agent brain | Node.js + TypeScript (Express) | Manages Claude API calls, conversation history, client context loading, Hebrew intent logic, tool use. Lives on Railway. |
| AI model | Claude Sonnet 4.6 (Anthropic API) | Best Hebrew generation, business register aware, excellent tool use. |
| WhatsApp | Twilio WhatsApp Business API | Inbound + outbound messaging. Already have Twilio account. |
| Calendar | Google Calendar API | Appointment check + book. Credentials via OAuth service account. |
| Client context / memory | Markdown files (Obsidian-style vault) | One folder per client with business info, FAQs, team, tone, procedures. Agent reads these on every call. Dead simple to edit without code. |
| Conversation history | SQLite (local) / Upstash Redis (production) | Last N messages per phone number, per client. Gives agent short-term memory. |
| Logging | Google Sheets (per client) | Every message in/out logged. Client-visible. No database admin needed. |
| Agent email | Agent Mail (agentmail.dev) | Each agent gets their own email — for sending confirmations and alerting you when something breaks. |
| Hosting | Railway | Deploy agent-brain as a Node.js service. Auto-deploy from GitHub. ~$5/month. |

**n8n Cloud setup:** Start with the free trial at n8n.io/cloud. For production, the $20/month Starter plan has unlimited workflows and executions.

---

## Project Structure

```
israeli-agent-business/
├── CLAUDE.md                          ← This file (copy here too)
├── packages/
│   └── agent-brain/                   ← Node.js/TS service (deployed to Railway)
│       ├── src/
│       │   ├── index.ts               ← Express app entry point
│       │   ├── routes/
│       │   │   └── message.ts         ← POST /message — called by n8n
│       │   ├── claude/
│       │   │   ├── client.ts          ← Anthropic SDK wrapper
│       │   │   ├── prompts.ts         ← System prompt builder
│       │   │   └── tools.ts           ← Claude tool definitions (book, check, escalate)
│       │   ├── context/
│       │   │   └── loader.ts          ← Reads client vault markdown files
│       │   ├── memory/
│       │   │   └── history.ts         ← Conversation history (SQLite)
│       │   ├── calendar/
│       │   │   └── google.ts          ← Google Calendar API wrapper
│       │   ├── twilio/
│       │   │   └── whatsapp.ts        ← Twilio send helper (used for proactive messages)
│       │   └── types.ts               ← Shared TypeScript types
│       ├── package.json
│       ├── tsconfig.json
│       └── .env.example
├── clients/
│   └── demo-clinic/                   ← First client (template for all future clients)
│       ├── vault/                     ← Agent's "second brain" — plain markdown
│       │   ├── business.md            ← Name, address, services, hours, pricing
│       │   ├── faqs.md                ← Top 30 FAQs with Hebrew answers
│       │   ├── team.md                ← Staff, roles, escalation path
│       │   ├── tone.md                ← Communication style guide
│       │   ├── procedures.md          ← Booking rules, cancellation policy
│       │   └── no-go.md               ← What the agent must NEVER say or do
│       └── config.json                ← Client config (WhatsApp number, calendar ID, etc.)
├── n8n/
│   └── workflows/                     ← Export JSON files from n8n (for version control)
│       ├── 01-whatsapp-inbound.json
│       ├── 02-appointment-reminders.json
│       └── 03-lead-followup.json
└── scripts/
    └── seed-demo-clinic.ts            ← Populate demo client vault with sample data
```

---

## Data Models

### `config.json` (per client)

```json
{
  "clientId": "demo-clinic",
  "agentName": "דנה",
  "agentEmail": "dana@agentmail.dev",
  "whatsappNumber": "+972XXXXXXXXX",
  "googleCalendarId": "clinic@gmail.com",
  "timezone": "Asia/Jerusalem",
  "language": "he",
  "hitlMode": true,
  "hitlApproverWhatsapp": "+972YOURMOBILE",
  "businessHours": {
    "sun": "09:00-18:00",
    "mon": "09:00-18:00",
    "tue": "09:00-18:00",
    "wed": "09:00-18:00",
    "thu": "09:00-18:00",
    "fri": "09:00-13:00",
    "sat": null
  },
  "slotDurationMinutes": 45,
  "reminderHours": [48, 2],
  "leadFollowUpHours": 24,
  "escalationKeywords": ["דחוף", "כאב חזק", "חירום", "בעיה חמורה"]
}
```

### Conversation History Record

```typescript
interface ConversationMessage {
  id: string;
  clientId: string;
  phoneNumber: string;  // E.164 format
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  intent?: string;      // 'booking' | 'faq' | 'complaint' | 'reschedule' | 'unknown'
  actionTaken?: string; // 'booked:2026-06-15T10:00' | 'escalated' | 'faq_answered'
}
```

### n8n → agent-brain API

**Request: `POST /message`**
```typescript
interface MessageRequest {
  clientId: string;         // 'demo-clinic'
  from: string;             // '+972501234567'
  body: string;             // Raw WhatsApp message text
  messageId: string;        // Twilio message SID
  timestamp: string;        // ISO8601
}
```

**Response:**
```typescript
interface MessageResponse {
  reply: string;            // Hebrew text to send back
  intent: string;           // Classified intent
  actionRequired?: {
    type: 'book_appointment' | 'send_reminder' | 'escalate_to_human' | 'collect_lead';
    payload: Record<string, unknown>;
  };
  hitlPending?: boolean;    // If HITL mode on, reply is queued not sent
}
```

---

## Claude API Integration

### System Prompt Structure

The system prompt is built dynamically per request by concatenating the client's vault files:

```
You are דנה, the digital assistant for [BUSINESS NAME].
You communicate in natural, informal Israeli Hebrew — conversational WhatsApp register, 
no nikud, code-switching to English for technical/business terms is normal and expected.

== BUSINESS INFO ==
[contents of business.md]

== FREQUENTLY ASKED QUESTIONS ==
[contents of faqs.md]

== TEAM & ESCALATION ==
[contents of team.md]

== COMMUNICATION STYLE ==
[contents of tone.md]

== BOOKING PROCEDURES ==
[contents of procedures.md]

== WHAT YOU MUST NEVER DO ==
[contents of no-go.md]

== CURRENT DATE & TIME ==
Sunday, June 15, 2026 — 10:32 (Israel time)

== BUSINESS HOURS TODAY ==
09:00–18:00 (Sunday)

== CONVERSATION SO FAR ==
[last 10 messages]

Respond ONLY in Hebrew unless the patient wrote in English.
Keep replies short — this is WhatsApp, not email.
If you need to book an appointment, use the check_availability and book_appointment tools.
If the situation is urgent or you're unsure, use the escalate_to_human tool.
```

### Tool Definitions

```typescript
const tools = [
  {
    name: "check_availability",
    description: "Check available appointment slots in the clinic calendar",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format, or 'today', 'tomorrow', 'this week'" },
        preferredTime: { type: "string", description: "Preferred time range like 'morning', 'afternoon', or specific time '14:00'" }
      },
      required: ["date"]
    }
  },
  {
    name: "book_appointment",
    description: "Book an appointment slot for the patient",
    input_schema: {
      type: "object",
      properties: {
        patientName: { type: "string" },
        patientPhone: { type: "string" },
        dateTime: { type: "string", description: "ISO8601 datetime" },
        treatmentType: { type: "string" },
        notes: { type: "string" }
      },
      required: ["patientName", "patientPhone", "dateTime"]
    }
  },
  {
    name: "escalate_to_human",
    description: "Flag this conversation for immediate human review. Use for urgent medical situations, complaints, or anything you're not sure how to handle.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
        urgency: { type: "string", enum: ["low", "medium", "high"] }
      },
      required: ["reason", "urgency"]
    }
  }
]
```

---

## n8n Workflow Specifications

### Workflow 1: WhatsApp Inbound Handler

**Trigger:** Webhook (POST) — set this URL in Twilio's WhatsApp webhook configuration

**Flow:**
```
[Webhook: Twilio POST]
        ↓
[Parse body: extract From, Body, MessageSid]
        ↓
[HTTP Request: POST to agent-brain /message]
  → clientId (from Twilio number lookup), from, body, messageId, timestamp
        ↓
[IF: hitlPending = true]
  → [Send to HITL queue: WhatsApp message to you for approval]
[ELSE]
  → [Twilio: Send WhatsApp reply to patient]
        ↓
[IF: actionRequired.type = 'collect_lead']
  → [Wait 24h node] → [Check if appointment booked] → [Send follow-up]
        ↓
[Google Sheets: Log interaction row]
```

**Twilio webhook config:**
- Go to Twilio Console → WhatsApp → Sandbox (or production number)
- Set "When a message comes in" webhook to your n8n webhook URL
- Method: POST

**Important:** Twilio expects a response within 15 seconds. The HTTP Request node to agent-brain must be fast. Keep Claude API calls with streaming off and use `claude-sonnet-4-6` (fast) not Opus.

### Workflow 2: Appointment Reminders

**Trigger:** Cron — runs every day at 08:30 Israel time (cron: `30 8 * * *` UTC+3)

**Flow:**
```
[Cron: 08:30 daily]
        ↓
[Google Calendar: Get events for next 48 hours]
        ↓
[Filter: events with description containing "WhatsApp:+972"]
        ↓
[For each event:]
  → [Calculate: is appointment in 48h window? in 2h window?]
  → [Build Hebrew reminder message]
  → [Twilio: Send WhatsApp to patient phone]
  → [Google Sheets: Log reminder sent]
```

**Google Calendar event format** (set by booking tool):
```
Title: [TreatmentType] — [PatientName]
Description: WhatsApp:+972501234567 | Notes: ...
```

### Workflow 3: Lead Follow-Up

**Trigger:** Called by Workflow 1 via n8n webhook when `actionRequired.type = 'collect_lead'`

**Flow:**
```
[Webhook: triggered by Workflow 1]
        ↓
[Wait: 24 hours]
        ↓
[Google Calendar: Check if appointment exists for this phone number in last 24h]
        ↓
[IF: appointment found → stop, they booked]
[ELSE:]
  → [Build Hebrew follow-up message]
  → [Twilio: Send WhatsApp]
  → [Wait: 48 more hours]
  → [If still no appointment: send final follow-up, then stop]
```

---

## Full Automation Capabilities (What This Agent Can Do)

Build these incrementally — marked with priority order.

### Phase 1 — MVP (build first)
- **[P1] Inbound WhatsApp FAQ handler** — Answers the 30 most common questions in natural Hebrew. Pricing, hours, services, availability, directions, parking, insurance coverage, preparation instructions.
- **[P1] Appointment booking** — Checks Google Calendar availability, books slots, sends Hebrew confirmation with date/time/clinic address. Handles: "מתי יש לכם מקום?", "אפשר לקבוע תור ליום ראשון?"
- **[P1] 48h appointment reminder** — Proactive WhatsApp message 48h before appointment. Includes time, address, preparation instructions if relevant.
- **[P1] 2h appointment reminder** — Day-of reminder with "מחכים לך בעוד שעתיים" + clinic address.
- **[P1] Lead follow-up** — If someone asks about booking but doesn't book, follow up 24h later.

### Phase 2 — Week 2
- **[P2] Reschedule/cancellation handling** — Patient replies "אני צריך לדחות את התור" → agent offers alternative slots, updates calendar.
- **[P2] New patient intake** — First-time patient WhatsApp conversation: collects name, age, reason for visit, insurance type, stores in Google Sheets as patient record.
- **[P2] Waitlist management** — "אין לכם מקום ליום שלישי?" → agent adds to waitlist, notifies when slot opens.
- **[P2] Post-appointment follow-up** — 2 days after appointment: "היי [שם], איך הרגשת אחרי הטיפול? יש לנו מקום לביקור מעקב בשבוע הבא."
- **[P2] Review request** — 3 days post-appointment: friendly WhatsApp asking for Google review. Includes link. Only for satisfied patients (no complaints in conversation history).

### Phase 3 — Month 2
- **[P3] Recurring appointment reminders** — "הגיע הזמן לביקור השנתי שלך!" triggered 11.5 months after last appointment.
- **[P3] Insurance verification helper** — "קופת חולים שלי היא מאוחדת — האם אתם מקבלים?" → agent checks config file of accepted insurance plans, answers.
- **[P3] Payment follow-up** — After appointment: if patient has unpaid balance, send polite Hebrew payment reminder after 7 and 14 days.
- **[P3] Shift/availability change announcements** — If clinic closes early or has a cancellation slot, agent broadcasts to waitlist.
- **[P3] Referral tracking** — "מי המליץ לך עלינו?" → logged, referrer gets a thank-you message.
- **[P3] Weekly/monthly report to clinic owner** — Every Sunday at 8am: WhatsApp summary to the owner. Appointments this week, no-shows, new patients, reminders sent, leads that didn't convert.

### Additional Capabilities for Other Verticals (implement when expanding)
**Law firms:** Client intake via WhatsApp → qualify (area of law, urgency) → book consultation → send confirmation with required documents list → case status update bot → invoice reminder.

**Insurance agents:** Quote inquiry bot → collect details → book callback → policy renewal reminders (30 days before expiry) → COI generation and WhatsApp delivery → claim notification handler.

**Real estate:** Property inquiry → qualify buyer/renter → book viewing → viewing reminder → post-viewing follow-up → offer status updates.

**Importers/wholesalers:** Order status bot → inventory availability → price list distribution → payment reminder → new catalog notification to client list.

---

## Israeli Market Specifics — Critical for Every Prompt

### Hebrew Language Rules
- WhatsApp register: informal, conversational. Like texting a friend, not a formal letter.
- No nikud (vowel marks) — never include them in agent output.
- Code-switching is normal and expected: "נשלח לך confirmation בוואטסאפ", "אנחנו open בימי ראשון עד חמישי"
- Don't say "שלום" as a greeting — Israelis say "היי" on WhatsApp.
- Short messages. WhatsApp is not email. Max 3-4 lines per message.
- Use "את/אתה" based on gender if known; otherwise use gender-neutral phrasing or "אתם".
- Emojis are fine and normal in Israeli business WhatsApp.
- No formal closings like "בברכה" or "בכבוד רב" — just end the message.

### Business Day Context
- Israeli work week: Sunday–Thursday. Friday is short (until ~13:00 in most places). Saturday = Shabbat, closed.
- Always be aware of Jewish holidays when booking appointments (Rosh Hashana, Yom Kippur, Pesach, etc.)
- Israeli business culture: direct and efficient. Don't over-apologize. Get to the point.

### Payment / Pricing
- Always quote in NIS (₪). Never in USD unless the client asks.
- Installments (תשלומים) are the norm, not the exception, for anything over ₪500.
- Israeli clients often negotiate. The agent should never negotiate pricing — escalate to human.

### Legal (Amendment 13 — Israeli Privacy Protection Law)
- Effective August 2025. The AI agent processing patient/client WhatsApp messages constitutes processing of personal data.
- Every client must sign a DPA (Data Processing Agreement) before you wire up their agent.
- Conversation logs stored in Google Sheets must be in Israel or EU data centers (Google Workspace defaults to EU for Israeli accounts).
- Never store patient health information in plaintext in the vault — keep medical context generic.
- Agent must not ask for ID numbers, passport numbers, or financial data via WhatsApp.

---

## Build Order — Follow This Sequence

### Step 0: Environment Setup (~20 min)
1. Create GitHub repo: `israeli-agent-business`
2. Create project structure as defined above
3. Initialize Node.js TypeScript project in `packages/agent-brain/`
4. Install dependencies: `@anthropic-ai/sdk`, `express`, `better-sqlite3`, `googleapis`, `twilio`, `dotenv`, `zod`
5. Create `.env.example` with all required variables
6. Sign up for n8n Cloud at n8n.io/cloud
7. Sign up for Railway at railway.app, create new project
8. Sign up for Agent Mail at agentmail.dev — create `dana@agentmail.dev`

### Step 1: Agent Brain — Core Service (~45 min)
1. Build Express server with `POST /message` endpoint
2. Build `context/loader.ts` — reads all markdown files from `clients/[clientId]/vault/` into a single string
3. Build `memory/history.ts` — SQLite-based conversation history (last 10 messages per phone number per client)
4. Build `claude/prompts.ts` — assembles system prompt from vault + current date/time + business hours
5. Build `claude/client.ts` — calls Claude Sonnet 4.6 with system prompt + history + tools
6. Test locally: POST to /message, confirm Hebrew response comes back

### Step 2: Demo Clinic Vault (~30 min)
1. Create `clients/demo-clinic/config.json` with placeholder values
2. Create all vault markdown files (see templates below in this file)
3. Seed with realistic Hebrew content for a Tel Aviv dermatology clinic
4. Test agent-brain with clinic context: does it answer Hebrew FAQs correctly?

### Step 3: Google Calendar Integration (~45 min)
1. Create Google Cloud project, enable Calendar API
2. Create service account, download credentials JSON
3. Share the clinic's Google Calendar with the service account email
4. Build `calendar/google.ts`: `getAvailableSlots(date)` and `bookAppointment(details)`
5. Wire up tools in Claude integration
6. Test: ask agent "מתי יש לכם מקום למחר?" → confirm it returns real slots and can book

### Step 4: WhatsApp Integration via Twilio (~30 min)
1. In Twilio Console: activate WhatsApp Sandbox (for testing)
2. Deploy agent-brain to Railway (auto-deploy from GitHub main branch)
3. Create n8n Workflow 1 (WhatsApp inbound handler)
4. Set Twilio webhook URL to n8n workflow webhook URL
5. Test: send Hebrew message to Twilio sandbox number → confirm reply arrives
6. Test booking flow end-to-end: message → booking in Google Calendar → confirmation WhatsApp

### Step 5: Reminder System (~30 min)
1. Create n8n Workflow 2 (cron + Google Calendar + Twilio)
2. Test by creating a test appointment 48h in the future
3. Manually trigger the workflow to confirm reminder sends

### Step 6: Lead Follow-Up (~20 min)
1. Create n8n Workflow 3 (triggered when agent returns `actionRequired: collect_lead`)
2. Test: send a message that expresses interest but doesn't book → confirm follow-up arrives 24h later (use n8n test mode to skip the wait)

### Step 7: HITL Mode (~20 min)
1. Add HITL gate in Workflow 1: if `config.hitlMode = true`, send pending message to you via WhatsApp for approval before sending to patient
2. Format: "✋ *HITL: demo-clinic*\n*To:* +972...\n*Message:* [reply]\n\nReply ✅ to approve, ✏️ [new text] to override, ❌ to cancel"
3. Create Workflow 4: listens for your approval reply, sends the approved message

### Step 8: Logging (~15 min)
1. Add Google Sheets logging to Workflow 1 (new row per interaction: timestamp, phone, inbound message, outbound reply, intent, action taken)
2. Create the sheet in the clinic's Google account — client can see their own log

### Step 9: Agent Mail Alerts (~15 min)
1. In agent-brain: catch all unhandled errors, send email from `dana@agentmail.dev` to your email with error details
2. Subject format: "⚠️ Agent error — demo-clinic — [error type]"

---

## Vault Templates (Copy & Fill Per Client)

### `vault/business.md`
```markdown
# Business Information

**Name:** [Clinic Name]
**Type:** [Dermatology / Dental / Physiotherapy / etc.]
**Address:** [Full address, including floor/entrance details]
**Phone:** [Main phone — not WhatsApp]
**Email:** [clinic@email.com]
**WhatsApp:** [The number this agent operates on]
**Website:** [if exists]

## Services & Pricing
- [Service 1]: ₪[price] per session, [duration] minutes
- [Service 2]: ₪[price]
[etc.]

## Hours
- Sunday–Thursday: 09:00–18:00
- Friday: 09:00–13:00
- Saturday: Closed

## Location Notes
[Parking info, entrance instructions, floor number, etc.]

## Insurance / Health Plans Accepted
[List of קופות חולים / insurance plans accepted, if any]

## Payment Methods
[Cash, credit card, bit, Paybox, installments, etc.]
```

### `vault/faqs.md`
```markdown
# Frequently Asked Questions

Fill this with the 30 most common questions this business gets on WhatsApp.
Write both the question AND the exact Hebrew answer the agent should give.

**Q: מה השעות שלכם?**
A: אנחנו פתוחים ראשון עד חמישי 9:00–18:00, ושישי עד 13:00 🕘

**Q: איפה אתם נמצאים?**
A: אנחנו ב[address]. יש חניה בחינם [details]. [Additional notes]

**Q: כמה עולה טיפול ב[service]?**
A: טיפול [service] עולה ₪[price]. הטיפול אורך בערך [duration] דקות.

**Q: האם אתם מקבלים קופת חולים?**
A: [Answer based on what they accept]

[Continue with 25+ more Q&A pairs]
```

### `vault/tone.md`
```markdown
# Communication Style

## Register
- Informal, warm, helpful — like a knowledgeable friend
- Hebrew is the default. Switch to English only if the patient writes in English.
- Keep messages short. Max 3-4 lines. This is WhatsApp, not a letter.
- Use emojis sparingly but naturally: ✅ 🗓️ 📍 👋
- Never use nikud (vowel marks)
- Code-switching is fine and normal: "appointment", "OK", "confirmation" can stay in English

## Tone Words
DO: direct, warm, efficient, helpful, clear
DON'T: overly formal, apologetic, robotic, verbose, medical-jargon-heavy

## Greeting
Use "היי" not "שלום". Add patient name when known: "היי דנה!"

## Closing
No formal closing needed. Just end the message naturally.

## Escalation phrasing
When escalating: "רגע אחד, אעביר אותך לצוות שלנו — הם יחזרו אליך תוך [X] דקות. 🙏"
```

### `vault/procedures.md`
```markdown
# Booking Procedures

## Appointment Slots
- Duration: [X] minutes per appointment
- Available hours: [see business hours in business.md]
- Booking lead time: minimum [X] hours in advance
- Maximum advance booking: [X] weeks

## Cancellation Policy
- Free cancellation up to [X] hours before appointment
- Late cancellation: [policy — e.g., "נבקש הודעה 24 שעות מראש"]

## New Patient Process
Before booking a new patient's first appointment, collect:
1. Full name
2. Age or date of birth
3. Reason for visit (general — not detailed medical history)
4. Health fund (קופת חולים) if relevant

## What to Ask During Booking
1. "מה שמך המלא?"
2. "לאיזה טיפול את/ה מעוניין/ת?"
3. "יש לך העדפה לתאריך או שעה מסוימת?"

## Confirmation Message Format
After booking:
"מעולה [שם]! קבעתי לך תור ל[טיפול] ב-[תאריך] בשעה [שעה]. הכתובת שלנו: [address]. נשלח לך תזכורת יום לפני 🗓️"
```

### `vault/no-go.md`
```markdown
# Absolute Limits — What the Agent Must Never Do

- Never provide specific medical advice or diagnoses
- Never quote prices that differ from what's in business.md
- Never book appointments outside of business hours
- Never share another patient's information
- Never promise outcomes from treatments
- Never discuss negative reviews about the clinic
- Never engage with rude or abusive messages — escalate immediately
- Never ask for ID numbers, credit card numbers, or passwords
- Never make promises about insurance coverage without checking the list in business.md
- If unsure about ANYTHING — escalate to human, don't guess
```

---

## Environment Variables

```bash
# .env (agent-brain service on Railway)

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  # Sandbox number, or production number

# Google Calendar
GOOGLE_SERVICE_ACCOUNT_EMAIL=agent@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."

# Agent Mail
AGENTMAIL_API_KEY=...
AGENT_EMAIL_FROM=dana@agentmail.dev

# Service config
PORT=3000
NODE_ENV=production
CLIENTS_DIR=./clients  # Path to clients/ folder

# HITL config (your WhatsApp number for approvals)
HITL_APPROVER_WHATSAPP=+972YOURMOBILENUMBER

# Optional: Redis for production conversation history
REDIS_URL=redis://...
```

---

## Key Decisions & Constraints

1. **Speed is critical.** Twilio webhook times out after 15 seconds. Agent-brain must respond in <10s. Use `claude-sonnet-4-6`, not Opus. Keep vault files under ~3,000 tokens total per client.

2. **One agent-brain service, multiple clients.** The service runs once on Railway. Client is identified by the Twilio "To" number in the webhook. The service loads the correct `clients/[clientId]/vault/` based on a phone-number → clientId mapping in a config file.

3. **Multi-client routing config:** Create a `clients/routing.json` file:
   ```json
   {
     "+972501234567": "demo-clinic",
     "+972509876543": "law-firm-abc"
   }
   ```

4. **HITL mode is ON by default** for new clients. Set `hitlMode: false` in config only after 2+ weeks of clean operation.

5. **No Composio for now.** Direct Google Calendar API via service account. When you expand to Fireberry, HubSpot, etc., integrate via their REST APIs or revisit Composio.

6. **Conversation history = last 10 messages.** Don't send the full history to Claude — it's expensive and usually irrelevant. If a conversation goes cold for 24h+, treat the next message as a new conversation.

7. **Hebrew only in the vault and prompts.** All vault file content should be in Hebrew. The system prompt instructs Claude to respond in Hebrew by default.

8. **Never log health information.** Google Sheets log rows contain: timestamp, phone (last 4 digits only for privacy), intent, action taken. Not the full message content. Full conversation stored in SQLite locally only.

---

## Testing the MVP

### Manual test script (run in sequence)
1. Send "היי" → should get warm greeting + offer to help
2. Send "מה השעות שלכם?" → should answer from business.md
3. Send "כמה עולה טיפול?" → should quote correct price
4. Send "אני רוצה לקבוע תור" → should ask for name, preferred date/time
5. Send name + date preference → should check Google Calendar and offer real slots
6. Confirm a slot → should create Google Calendar event + send confirmation
7. Check Google Calendar — event should be there
8. Wait for (or manually trigger) reminder workflow → should receive reminder WhatsApp
9. Reply "אני צריך לדחות" → should offer alternative slots
10. Send "יש לי כאב חזק ודחוף" (escalation keyword) → should escalate, not answer

### Expected metrics after 1 week live
- Response time: <30 seconds (Twilio → n8n → agent-brain → reply)
- FAQ answer accuracy: >90% of standard questions answered without escalation
- Booking success rate: >70% of booking intents successfully completed end-to-end
- No-show reduction: baseline vs. Week 4 comparison
