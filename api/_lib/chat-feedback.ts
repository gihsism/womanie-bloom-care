// Ask AI answer feedback (👍/👎 + optional reason), shared by the server
// route (api/_routes/chat/feedback.ts) and the page.
//
// Only what she chose or typed is stored: the rating, one reason from a
// fixed list, and her optional comment (trimmed, max 500 chars). No answer
// text, no records, no name are added.

export const FEEDBACK_REASONS = ['wrong', 'not_personal', 'unclear', 'too_long', 'unsafe', 'other'] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const FEEDBACK_REASON_LABELS: Record<FeedbackReason, string> = {
  wrong: 'Wrong or outdated',
  not_personal: 'Ignored my records',
  unclear: 'Hard to understand',
  too_long: 'Too long',
  unsafe: 'Felt unsafe',
  other: 'Something else',
};

export const MAX_FEEDBACK_COMMENT = 500;

export interface ChatFeedback {
  answerKey: string;
  messageId: string | null;
  conversationId: string | null;
  model: string | null;
  rating: 1 | -1;
  reason: FeedbackReason | null;
  comment: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[\w-]{6,64}$/;
const MODEL_RE = /^[\w.-]{1,64}$/;

export function parseChatFeedback(body: unknown): { ok: true; feedback: ChatFeedback } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body required' };
  const b = body as Record<string, unknown>;
  if (b.rating !== 1 && b.rating !== -1) return { ok: false, error: 'rating must be 1 or -1' };
  if (typeof b.answerKey !== 'string' || !KEY_RE.test(b.answerKey)) return { ok: false, error: 'answerKey required' };
  const reason = b.reason == null || b.reason === '' ? null : b.reason;
  if (reason !== null && !(FEEDBACK_REASONS as readonly unknown[]).includes(reason)) {
    return { ok: false, error: 'Unknown reason' };
  }
  let comment: string | null = null;
  if (typeof b.comment === 'string') {
    // eslint-disable-next-line no-control-regex -- strip control characters she cannot have meant
    const t = b.comment.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
    comment = t ? t.slice(0, MAX_FEEDBACK_COMMENT) : null;
  }
  const uuid = (v: unknown) => (typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null);
  return {
    ok: true,
    feedback: {
      answerKey: b.answerKey,
      messageId: uuid(b.messageId),
      conversationId: uuid(b.conversationId),
      model: typeof b.model === 'string' && MODEL_RE.test(b.model) ? b.model : null,
      rating: b.rating,
      reason: reason as FeedbackReason | null,
      comment,
    },
  };
}

/** Postgres "undefined_table": migration 026 not applied yet. */
export function isMissingTableError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '42P01';
}
