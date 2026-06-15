// Verify voice-note plumbing: request schema (media fields) + graceful no-key STT.
// Real transcription needs OPENAI_API_KEY (founder adds it); pass an audio URL as
// argv[2] to do a live transcription smoke test once the key is set.
// Run from packages/agent-brain:  npx tsx ../../scripts/test-voice.ts
import '../packages/agent-brain/src/env.js';
import { requestSchema } from '../packages/agent-brain/src/routes/message.js';
import {
  transcribeVoiceNote,
  isTranscriptionConfigured,
} from '../packages/agent-brain/src/media/transcribe.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${name}`);
  cond ? pass++ : fail++;
}

async function main() {
  // ── schema: a normal text message ──
  const text = requestSchema.safeParse({ clientId: 'demo-clinic', from: '+972500000001', body: 'היי' });
  check('text message parses', text.success);

  // ── schema: a voice note (empty Body + media), as n8n forwards it ──
  const voice = requestSchema.safeParse({
    clientId: 'demo-clinic',
    from: '+972500000001',
    body: '',
    mediaUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC/Messages/MM/Media/ME',
    mediaContentType: 'audio/ogg',
  });
  check('voice note parses (empty body + mediaUrl)', voice.success);
  check(
    'mediaUrl/contentType preserved',
    voice.success &&
      voice.data.mediaUrl?.includes('Media/ME') === true &&
      voice.data.mediaContentType === 'audio/ogg',
  );

  // ── schema: empty mediaUrl string (text msg via n8n) normalizes to undefined ──
  const emptyMedia = requestSchema.safeParse({
    clientId: 'demo-clinic',
    from: '+972500000001',
    body: 'שלום',
    mediaUrl: '',
    mediaContentType: '',
  });
  check(
    "empty mediaUrl normalized to undefined",
    emptyMedia.success && emptyMedia.data.mediaUrl === undefined,
  );

  // ── schema: nothing to act on (no body, no media) is rejected ──
  const empty = requestSchema.safeParse({ clientId: 'demo-clinic', from: '+972500000001', body: '' });
  check('empty body + no media is rejected', !empty.success);

  // ── transcription degrades gracefully when not configured ──
  console.log(`\nOPENAI_API_KEY configured: ${isTranscriptionConfigured()}`);
  const sampleUrl = process.argv[2];
  if (isTranscriptionConfigured() && sampleUrl) {
    const t = await transcribeVoiceNote(sampleUrl);
    console.log('live transcript:', t);
    check('live transcription returned text', Boolean(t));
  } else {
    const t = await transcribeVoiceNote('https://example.com/whatever.ogg', 'audio/ogg');
    check('no key → returns null without throwing', t === null);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
