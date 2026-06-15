// claude/tools.ts — Claude tool definitions (schemas only)
// The executors live in claude/client.ts. In Step 3, check_availability and
// book_appointment will be backed by calendar/google.ts; escalate_to_human is
// already real (it just sets an actionRequired flag).

import type Anthropic from '@anthropic-ai/sdk';

export const tools: Anthropic.Messages.Tool[] = [
  {
    name: 'check_availability',
    description: 'Check available appointment slots in the clinic calendar.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: "Date in YYYY-MM-DD format, or 'today', 'tomorrow', 'this week'",
        },
        preferredTime: {
          type: 'string',
          description: "Preferred time range like 'morning', 'afternoon', or a specific time '14:00'",
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Book an appointment slot for the patient.',
    input_schema: {
      type: 'object',
      properties: {
        patientName: { type: 'string' },
        patientPhone: { type: 'string' },
        dateTime: { type: 'string', description: 'ISO8601 datetime' },
        treatmentType: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['patientName', 'patientPhone', 'dateTime'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      "Flag this conversation for immediate human review. Use for urgent medical situations, complaints, or anything you're not sure how to handle.",
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
        urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['reason', 'urgency'],
    },
  },
  {
    name: 'join_waitlist',
    description:
      'Add the patient to the waitlist when the day or time they want is full, or if they ask to be notified when a slot opens. The system will message them automatically the moment a matching slot frees up.',
    input_schema: {
      type: 'object',
      properties: {
        patientName: { type: 'string' },
        preferredDay: {
          type: 'string',
          description: "When they want it: 'today', 'tomorrow', a 'YYYY-MM-DD' date, or 'flexible'",
        },
        note: { type: 'string', description: 'Optional: treatment type or time preference' },
      },
      required: ['patientName'],
    },
  },
];
