// media/transcribe.ts — speech-to-text for WhatsApp voice notes (OpenAI Whisper).
// Downloads the Twilio media (Twilio basic auth) and transcribes it via OpenAI's
// audio API. No `language` is sent, so OpenAI auto-detects it — this pairs with
// the multilingual reply behaviour (a Russian voice note → Russian transcript →
// Russian reply). Never throws: returns null when STT is unavailable or the
// audio can't be understood, so the caller can fall back gracefully.

const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe';
const MAX_BYTES = 25 * 1024 * 1024; // OpenAI upload limit

/** Whether an OpenAI key is configured (i.e. voice-note understanding is on). */
export function isTranscriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function extFor(contentType: string): string {
  if (contentType.includes('ogg') || contentType.includes('opus')) return 'ogg';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
  if (contentType.includes('mp4') || contentType.includes('m4a') || contentType.includes('aac'))
    return 'm4a';
  if (contentType.includes('wav')) return 'wav';
  if (contentType.includes('webm')) return 'webm';
  return 'ogg'; // WhatsApp voice notes are audio/ogg
}

async function downloadTwilioMedia(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? '';
  const token = process.env.TWILIO_AUTH_TOKEN ?? '';
  // Twilio media URLs require basic auth, then 307-redirect to a pre-signed URL
  // (Node strips the auth header on the cross-origin hop, which is fine).
  const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
  const resp = await fetch(url, { headers: { Authorization: auth } });
  if (!resp.ok) throw new Error(`media download failed: ${resp.status}`);
  const contentType = resp.headers.get('content-type') ?? 'audio/ogg';
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw new Error('media too large');
  if (buffer.byteLength === 0) throw new Error('empty media');
  return { buffer, contentType };
}

/**
 * Transcribe a voice note. Returns the transcript text, or null if transcription
 * is not configured or the audio could not be understood.
 */
export async function transcribeVoiceNote(
  mediaUrl: string,
  declaredContentType?: string,
): Promise<string | null> {
  if (!isTranscriptionConfigured()) return null;
  try {
    const { buffer, contentType } = await downloadTwilioMedia(mediaUrl);
    const type = (declaredContentType || contentType).split(';')[0].trim();
    const form = new FormData();
    form.append('file', new Blob([buffer], { type }), `voice.${extFor(type)}`);
    form.append('model', MODEL);
    form.append('response_format', 'text');

    const resp = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('[transcribe] OpenAI error', resp.status, detail.slice(0, 200));
      return null;
    }
    const text = (await resp.text()).trim();
    return text || null;
  } catch (err) {
    console.error('[transcribe] failed', err);
    return null;
  }
}
