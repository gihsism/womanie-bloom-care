// Size caps for /api/ai-doctor-chat. The page sends the whole visible
// conversation on every turn, so without caps one request could carry an
// arbitrarily long history (cost + latency on our Anthropic bill) or a
// single huge pasted message.
//
// Policy:
// - The newest message is what the user just typed: if it is longer than
//   MAX_USER_MESSAGE_CHARS the request is rejected (the page caps the box
//   at the same length, so a real user never sees this).
// - Absurd payloads (more than MAX_MESSAGES_HARD entries) are rejected.
// - Otherwise the HISTORY is trimmed, never the new question: only
//   user/assistant turns with string content are kept, an older turn is
//   cut to MAX_HISTORY_MESSAGE_CHARS, and the oldest turns are dropped
//   until at most MAX_MESSAGES turns and MAX_TOTAL_CHARS remain. The kept
//   window starts on a user turn (the model API requires that).

export const MAX_USER_MESSAGE_CHARS = 8_000;
export const MAX_HISTORY_MESSAGE_CHARS = 16_000; // a long assistant answer fits
export const MAX_MESSAGES = 40;
export const MAX_TOTAL_CHARS = 60_000;
export const MAX_MESSAGES_HARD = 500;

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatLimitResult =
  | { ok: true; messages: ChatTurn[]; trimmed: boolean }
  | { ok: false; status: number; error: string };

export function applyChatLimits(raw: unknown): ChatLimitResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, status: 400, error: 'Messages required' };
  }
  if (raw.length > MAX_MESSAGES_HARD) {
    return { ok: false, status: 413, error: 'Conversation too long. Please start a new chat.' };
  }

  // Legacy clients sent a synthetic 'system' turn; it was always treated as
  // a user turn. Anything else (other roles, non-string content such as
  // image/document blocks) is dropped.
  const turns: ChatTurn[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (typeof content !== 'string') continue;
    if (role === 'user' || role === 'system') turns.push({ role: 'user', content });
    else if (role === 'assistant') turns.push({ role: 'assistant', content });
  }
  if (turns.length === 0) return { ok: false, status: 400, error: 'Messages required' };

  const last = turns[turns.length - 1];
  if (last.role === 'user' && last.content.length > MAX_USER_MESSAGE_CHARS) {
    return {
      ok: false,
      status: 413,
      error: `Your message is too long (max ${MAX_USER_MESSAGE_CHARS.toLocaleString('en-US')} characters). Please shorten it.`,
    };
  }

  let trimmed = turns.length !== raw.length;
  const capped = turns.map((t, i) => {
    if (i === turns.length - 1 || t.content.length <= MAX_HISTORY_MESSAGE_CHARS) return t;
    trimmed = true;
    return { role: t.role, content: t.content.slice(0, MAX_HISTORY_MESSAGE_CHARS) };
  });

  // Walk back from the newest turn, keeping turns while within both caps.
  const kept: ChatTurn[] = [];
  let total = 0;
  for (let i = capped.length - 1; i >= 0; i--) {
    const t = capped[i];
    if (kept.length > 0 && (kept.length >= MAX_MESSAGES || total + t.content.length > MAX_TOTAL_CHARS)) break;
    kept.unshift(t);
    total += t.content.length;
  }
  if (kept.length !== capped.length) trimmed = true;
  // Start on a user turn; never drop the newest one.
  while (kept.length > 1 && kept[0].role !== 'user') {
    kept.shift();
    trimmed = true;
  }

  return { ok: true, messages: kept, trimmed };
}
