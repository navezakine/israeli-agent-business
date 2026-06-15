# Replai — Feature List (Master)

A living list of everything Replai can do. **This file is the canonical source** — it is kept current as features ship, and the Google Doc in the "Replai" Drive folder is regenerated from it on demand (e.g. when building the landing page or a promo video).

_Last updated: 15 June 2026_

**What Replai is:** a done-for-you AI assistant that answers a clinic's patients on WhatsApp (and soon Instagram & Facebook) 24/7 in their own language, books appointments, reduces no-shows, brings patients back, and always hands anything medical to a human — all managed from a simple owner dashboard.

---

## 🆕 Added recently — 15 June 2026

Use this section as the basis for the next landing-page update and promo video.

1. **Voice-note understanding** — Patients can send a WhatsApp voice message instead of typing. Replai listens, understands it, and replies just like a normal message, including booking. Auto-detects the language of the voice note.
2. **Multilingual replies** — Replai automatically detects each patient's language and answers in it: Hebrew, English, Russian, Arabic, French, and more. It keeps up even if the patient switches language mid-conversation.
3. **Automatic Google review requests** — A few hours after an appointment, Replai sends the patient a warm WhatsApp asking for a Google review with the clinic's review link. Smart timing (daytime only), never spammy, one request per patient with a cooldown. Grows the clinic's reputation on autopilot.
4. **Waitlist auto-fill** — When the clinic is fully booked, patients can join a waitlist. The moment a slot opens up (a cancellation, or a freed time), Replai instantly offers it to the next person in line — first to reply gets it. Turns cancellations into booked revenue.
5. **Payment / deposit collection at booking** — The clinic can require a deposit or full prepayment to confirm a booking. Replai sends the clinic's own payment link (Bit, card page, etc.) right in the chat and explains the slot is held until paid. No payment provider integration needed — the clinic just pastes its link in settings. Cuts no-shows.
6. **Patient CRM & timeline** — A full patient view in the dashboard: every patient with their complete history — messages, appointments, channels, and estimated value — all in one place.
7. **Patient reactivation list** — The dashboard surfaces past patients who haven't been back and have no upcoming appointment, sorted by how overdue they are. The clinic can filter by time since last visit, message them one-by-one with one tap, or export the whole list to Excel. Win-back made easy.
8. **Photo handoff + medical-safety guardrail** — Replai never gives medical advice. If a patient sends a photo, video, or file (e.g. a skin concern), Replai does not analyze it — it instantly hands the conversation to a human: it alerts the clinic on WhatsApp and **goes silent for that patient** until the clinic resolves it (the clinic texts back `חזרה <last 4 digits>` to let the bot resume; auto-resolves after 24h as a safety net). The same rule applies to medical questions in text (symptoms, results, "is this normal?"): Replai declines to advise and escalates to a person. While handed off, the patient's messages are forwarded to the clinic so they see the full conversation. A real safety + trust selling point.
9. **Self-improving FAQ** — When Replai escalates a question it didn't know and the owner answers (right through WhatsApp during the handoff), Replai sends the answer to the patient *and* offers to remember it. The owner approves with one tap in the dashboard or by replying `הוסף` on WhatsApp, and from then on Replai answers that question itself. The knowledge base gets smarter with every escalation, with zero extra work.
10. **Lead pipeline board** — A visual board in the dashboard showing every lead across four stages — New, Contacted, Booked, Lost — with the recovered leads (the ones Replai brought back) front and center, including a running count and estimated value. The clinic can open any lead in WhatsApp with one tap, or manually move it (mark booked / lost / reopen). Turns the lead follow-up engine into something the owner can see and act on.

**Also built today (pending activation):**
- **Instagram & Facebook messaging** — Replai answers Instagram DMs and Facebook Messenger with the same brain as WhatsApp. Code is complete and deployed; waiting on Meta account verification before it can go live.

---

## Everything else (already in Replai)

### Conversation & booking
- **24/7 WhatsApp AI assistant** — answers patients instantly, day and night, in natural, informal Israeli Hebrew (and now any language, see above).
- **Smart FAQ answering** — gives accurate answers about prices, hours, treatments, and policies, pulled from the clinic's own knowledge base.
- **Live appointment booking** — checks real availability in the clinic's Google Calendar and books the appointment inside the conversation.
- **Escalation to a human** — urgent, sensitive, complaint, or unclear messages (and anything medical, see above) are handed to the clinic's human instead of the bot guessing.

### Automations & growth
- **Appointment reminders** — automatic WhatsApp reminders before each appointment (e.g. 48 hours ahead, plus a same-day "see you today"). Reduces no-shows.
- **Lead recovery & follow-up** — if someone shows interest but doesn't book, Replai follows up automatically (a friendly nudge, then a final one) and tracks them as a lead.
- _(Google reviews, waitlist auto-fill, payments, and reactivation also live here — see "Added recently" above.)_

### Owner dashboard & control
- **Private owner dashboard** — a clean web app for the clinic: overview, patients, calendar, controls, and settings.
- **Insights & ROI metrics** — appointments booked, leads recovered, conversations handled, reminders sent, after-hours messages answered, plus estimated revenue and time saved.
- **One-switch controls** — turn the bot, auto-replies, human-approval mode, and each automation on or off from the dashboard.
- **Human approval mode (HITL)** — optional: the owner reviews, edits, or cancels every reply from their own WhatsApp before it is sent.
- **Business settings** — edit business details, working hours, reminder timing, Google review link, and payment options.

### Platform & reliability
- **Multi-clinic ready** — secure multi-tenant backend; each clinic's data is fully isolated.
- **Activity log** — a privacy-safe record of every interaction to a Google Sheet (no full phone numbers, no message content).
- **Operator error alerts** — an instant WhatsApp alert to the operator if anything breaks.
- **Marketing landing page** — a Hebrew, SEO-optimized website for the product.

---

## Maintenance notes
- When a new feature ships, add it here and move the dated "Added recently" label to the newest batch.
- The customer-facing features above become the basis for landing-page sections and a promo video.
- Some features (activity log, multi-tenant, error alerts) are operator/platform features — not things to advertise to patients.
- To refresh the Drive doc from this file, regenerate "Replai — Feature List (Master)" in the Drive "Replai" folder.
