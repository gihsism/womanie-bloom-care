// Ask AI answer feedback on the page: every rating is kept in this
// browser first, then sent to POST /api/chat/feedback. Until migration 026
// is applied the server answers { stored: false }; the rating stays here
// marked unsent and is sent again the next time the chat opens.

import {
  FEEDBACK_REASON_LABELS,
  FEEDBACK_REASONS,
  MAX_FEEDBACK_COMMENT,
  type FeedbackReason,
} from '../../api/_lib/chat-feedback';

export { FEEDBACK_REASON_LABELS, FEEDBACK_REASONS, MAX_FEEDBACK_COMMENT, type FeedbackReason };

export interface LocalFeedback {
  answerKey: string;
  messageId: string | null;
  conversationId: string | null;
  model: string | null;
  rating: 1 | -1;
  reason: FeedbackReason | null;
  comment: string | null;
  at: string;
  synced: boolean;
}

export const FEEDBACK_STORE_CAP = 200;
const keyFor = (userId: string) => `womanie_chat_feedback_${userId}`;

export function readFeedback(userId: string): LocalFeedback[] {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((f) => f && typeof f.answerKey === 'string') : [];
  } catch {
    return [];
  }
}

function writeFeedback(userId: string, list: LocalFeedback[]): void {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(list.slice(-FEEDBACK_STORE_CAP)));
  } catch { /* storage full or blocked: the server copy (if any) is enough */ }
}

/** Add or replace her rating of one answer (newest last). */
export function upsertFeedback(list: LocalFeedback[], f: LocalFeedback): LocalFeedback[] {
  return [...list.filter((x) => x.answerKey !== f.answerKey), f].slice(-FEEDBACK_STORE_CAP);
}

export function newAnswerKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function send(f: LocalFeedback): Promise<boolean> {
  try {
    const resp = await fetch('/api/chat/feedback', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answerKey: f.answerKey,
        messageId: f.messageId,
        conversationId: f.conversationId,
        model: f.model,
        rating: f.rating,
        reason: f.reason,
        comment: f.comment,
      }),
    });
    if (resp.status === 400) return true; // never valid: do not retry forever
    if (!resp.ok) return false;
    const body = await resp.json().catch(() => ({}));
    return body?.stored === true;
  } catch {
    return false;
  }
}

/** Keep locally, then try the server. Never throws. */
export async function saveFeedback(userId: string, f: Omit<LocalFeedback, 'at' | 'synced'>): Promise<LocalFeedback> {
  const entry: LocalFeedback = { ...f, at: new Date().toISOString(), synced: false };
  writeFeedback(userId, upsertFeedback(readFeedback(userId), entry));
  const synced = await send(entry);
  if (synced) {
    writeFeedback(userId, readFeedback(userId).map((x) => (x.answerKey === entry.answerKey && x.at === entry.at ? { ...x, synced: true } : x)));
  }
  return { ...entry, synced };
}

/** Send ratings that did not reach the server yet (at most `max` per call). */
export async function flushPendingFeedback(userId: string, max = 20): Promise<number> {
  const pending = readFeedback(userId).filter((f) => !f.synced).slice(0, max);
  let sent = 0;
  for (const f of pending) {
    if (!(await send(f))) break; // server not ready: stop, try next time
    sent++;
    writeFeedback(userId, readFeedback(userId).map((x) => (x.answerKey === f.answerKey && x.at === f.at ? { ...x, synced: true } : x)));
  }
  return sent;
}
