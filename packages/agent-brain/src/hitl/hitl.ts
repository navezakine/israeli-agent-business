// hitl/hitl.ts — human-in-the-loop helpers (prompt formatting + approval parsing)

export type HitlDecision =
  | { type: 'approve' }
  | { type: 'cancel' }
  | { type: 'override'; text: string };

const APPROVE = /^(✅|✓|אישור|אשר|מאושר|מאשר|ok|okay|כן|yes|y|v)$/i;
const CANCEL = /^(❌|✗|✖|ביטול|בטל|לא|cancel|no|n|x)$/i;

/** Interpret the approver's WhatsApp reply. */
export function interpretApproval(body: string): HitlDecision {
  const t = body.trim();
  if (APPROVE.test(t) || t.startsWith('✅')) return { type: 'approve' };
  if (CANCEL.test(t) || t.startsWith('❌')) return { type: 'cancel' };
  // Anything else is an edited override. Strip a leading ✏️ if present.
  const text = t.replace(/^✏️\s*/u, '').trim();
  return { type: 'override', text };
}

/** Build the approval prompt sent to the approver's WhatsApp. */
export function buildHitlPrompt(
  clientId: string,
  patientPhone: string,
  draft: string,
): string {
  return (
    `✋ *HITL: ${clientId}*\n` +
    `*To:* ${patientPhone}\n` +
    `*Message:* ${draft}\n\n` +
    `השב/י ✅ לאישור, ✏️ [טקסט חדש] לעריכה, ❌ לביטול`
  );
}

/** Normalize a phone for comparison (strip whatsapp: prefix and spaces). */
export function normalizePhone(p: string): string {
  return p.replace(/^whatsapp:/i, '').replace(/[\s-]/g, '').trim();
}
