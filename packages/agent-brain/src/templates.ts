// templates.ts — editable outbound message templates.
// Each automatic message has a key, a built-in default, and an optional
// per-clinic override stored in Supabase (message_templates). Placeholders
// like {greeting} / {time} are filled in by the engines at send time.

import { getSupabase } from './db/supabase.js';

export type TemplateKey =
  | 'reminder_advance'
  | 'reminder_sameday'
  | 'review_request'
  | 'waitlist_offer'
  | 'lead_nudge1'
  | 'lead_nudge2';

// Defaults mirror the original hardcoded wording (em-dash removed per founder).
export const DEFAULT_TEMPLATES: Record<TemplateKey, string> = {
  reminder_advance:
    '{greeting} רק תזכורת לתור {treatment} ב{day} בשעה {time}.{address} מחכים לך 🗓️',
  reminder_sameday: '{greeting} תזכורת קצרה, מחכים לך היום בשעה {time} 🗓️{address} נתראה!',
  review_request:
    '{greeting} 🌸 תודה שהגעת אלינו. אם היה לך טוב, נשמח אם תדרג/י אותנו בגוגל בדקה אחת, זה עוזר לנו המון: {link} תודה ושיהיה המשך יום מקסים 💛',
  waitlist_offer:
    '{greeting} התפנה תור ב{day} בשעה {time} 🗓️ רוצה שאשמור לך אותו? כתבי "כן" ואסגור לך מיד, זה תפוס למי שמגיב/ה ראשון/ה.',
  lead_nudge1:
    'היי! 🙂 ראיתי שהתעניינת בתור אצלנו. רוצה שנמצא לך זמן מתאים? פשוט כתוב/כתבי לי מתי נוח ואשמח לעזור 🗓️',
  lead_nudge2:
    'היי! עוד ניסיון אחרון מצידי 🙂 אם בא לך לקבוע תור, אני כאן. אם לא, הכל טוב, שיהיה יום מעולה!',
};

/** Fill {placeholders}; unknown/empty tokens become ''. */
export function render(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/**
 * Load a clinic's templates (only the requested keys), each falling back to the
 * built-in default. One query per call, so engines load all keys they need once.
 */
export async function loadTemplates(
  clientId: string,
  keys: TemplateKey[],
): Promise<Record<TemplateKey, string>> {
  const out = {} as Record<TemplateKey, string>;
  for (const k of keys) out[k] = DEFAULT_TEMPLATES[k];
  const sb = getSupabase();
  if (!sb) return out;
  const { data, error } = await sb
    .from('message_templates')
    .select('template_key, body')
    .eq('client_id', clientId)
    .in('template_key', keys);
  if (error) {
    console.error('[templates] load', error.message);
    return out;
  }
  for (const row of data ?? []) {
    const key = row.template_key as TemplateKey;
    const body = (row.body as string)?.trim();
    if (key in out && body) out[key] = body;
  }
  return out;
}
