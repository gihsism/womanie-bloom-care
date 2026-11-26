// The end-of-answer `meta` event of /api/ai-doctor-chat: follow-up chips,
// the records of hers the answer used, and the stored reply's id. Checked
// here so a malformed event shows nothing instead of breaking the page.
import { sanitizeRecordRefs, type RecordRef } from './recordCitations';
import { MAX_FOLLOWUPS, MAX_FOLLOWUP_CHARS } from './chatFollowUps';

export interface ChatMeta {
  followUps: string[];
  records: RecordRef[];
  messageId: string | null;
}

/** Shape check for the server's end-of-answer `meta` event. */
export function parseChatMeta(value: unknown): ChatMeta | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const followUps = Array.isArray(v.followUps)
    ? v.followUps.filter((q): q is string => typeof q === 'string' && q.trim().length > 0 && q.length <= MAX_FOLLOWUP_CHARS).slice(0, MAX_FOLLOWUPS)
    : [];
  const messageId = typeof v.messageId === 'string' && /^[0-9a-f-]{36}$/i.test(v.messageId) ? v.messageId : null;
  return { followUps: followUps.length >= 2 ? followUps : [], records: sanitizeRecordRefs(v.records), messageId };
}
