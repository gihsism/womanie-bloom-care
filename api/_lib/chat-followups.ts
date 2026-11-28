// Follow-up chips under each Ask AI answer.
//
// Why a tail block from the model, not rules: the model already has the
// question, her records and the answer it just wrote, so 2-3 follow-ups
// cost it ~30 output tokens in the SAME response (no second call). Rules
// can only see the question; they cannot know the answer said "your
// ferritin is low" and offer "What foods raise ferritin?". The tail is
// made robust instead:
//   - the server strips it BEFORE the citation check and before saving,
//     so the safety checker and Past chats see exactly the answer text
//     they saw before this feature;
//   - the page hides it while the reply is still streaming
//     (visibleWhileStreaming), so a half-written tail never flashes;
//   - a missing, cut-off or malformed tail yields no chips and never
//     leaves marker text in the answer.
//
// Format (the last thing in the reply):
//   [[followups]]
//   - Question one?
//   - Question two?
//   [[/followups]]
//
// Pure module, shared by the server and the page (src/lib/chatFollowUps.ts).

export const FOLLOWUPS_OPEN = '[[followups]]';
export const FOLLOWUPS_CLOSE = '[[/followups]]';
export const MAX_FOLLOWUPS = 3;
export const MAX_FOLLOWUP_CHARS = 90;

/** Appended to the chat system prompt (after the research block). */
export const FOLLOWUPS_PROMPT = `

## Follow-up suggestions
After your answer, end the reply with this block and nothing after it:
${FOLLOWUPS_OPEN}
- <a short follow-up question she might ask next>
- <another one>
${FOLLOWUPS_CLOSE}
Give 2 or 3 questions, each under 12 words, written as HER question ("What foods raise my ferritin?"), in the language of her message. No citations, no doses, no numbers she has not mentioned. Keep them to the life stage she is in now, and never repeat a question she already asked in this chat. Do not mention this block in the answer.`;

export interface ParsedFollowUps {
  /** The answer with any tail (or stray marker) removed. */
  text: string;
  /** 0-3 cleaned follow-up questions; [] for a missing or malformed tail. */
  followUps: string[];
}

// A cut-off tail longer than this is not "just the tail": leave the text.
const MAX_TAIL_CHARS = 600;

function cleanQuestion(line: string): string | null {
  let s = line.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, '');
  s = s.replace(/\[\d+(?:\s*[,–-]\s*\d+)*\]/g, '') // no [n] citations
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < 4 || s.length > MAX_FOLLOWUP_CHARS) return null;
  if (s.includes('[[') || s.includes(']]') || /https?:\/\//i.test(s)) return null;
  if (!/\p{L}/u.test(s)) return null;
  return s;
}

/**
 * Split a finished reply into the visible answer and its follow-ups.
 * Never throws; for text without a tail it returns the text unchanged.
 */
export function parseFollowUps(raw: string): ParsedFollowUps {
  if (typeof raw !== 'string' || !raw) return { text: typeof raw === 'string' ? raw : '', followUps: [] };
  const open = raw.lastIndexOf(FOLLOWUPS_OPEN);
  if (open === -1) {
    // A stray closer alone: drop the marker, keep the words.
    return raw.includes(FOLLOWUPS_CLOSE)
      ? { text: raw.split(FOLLOWUPS_CLOSE).join('').trimEnd(), followUps: [] }
      : { text: raw, followUps: [] };
  }
  const before = raw.slice(0, open).trimEnd();
  const after = raw.slice(open + FOLLOWUPS_OPEN.length);
  const close = after.indexOf(FOLLOWUPS_CLOSE);

  if (close === -1) {
    // Cut off (max_tokens) or never closed. A short tail is dropped
    // without chips; a long one means the marker sat mid-answer, so only
    // the marker goes.
    if (after.length <= MAX_TAIL_CHARS) return { text: before, followUps: [] };
    return { text: (before + '\n\n' + after.trim()).trim(), followUps: [] };
  }

  const body = after.slice(0, close);
  const rest = after.slice(close + FOLLOWUPS_CLOSE.length);
  if (rest.trim()) {
    // Text after the block: it was not a tail. Keep everything but the markers.
    return { text: `${before}\n\n${rest.trim()}`.trim(), followUps: [] };
  }
  const seen = new Set<string>();
  const followUps: string[] = [];
  for (const line of body.split('\n')) {
    const q = cleanQuestion(line);
    if (!q) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    followUps.push(q);
    if (followUps.length === MAX_FOLLOWUPS) break;
  }
  // A single usable question is not enough to be worth chips.
  return { text: before, followUps: followUps.length >= 2 ? followUps : [] };
}

const sameQuestion = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Follow-ups minus any she has already asked in this chat (the chip would
 * just re-ask it). Fewer than 2 left = no chips, as in parseFollowUps.
 */
export function freshFollowUps(followUps: string[], askedBefore: Array<string | null | undefined>): string[] {
  const asked = new Set(askedBefore.filter((q): q is string => typeof q === 'string').map(sameQuestion));
  const fresh = followUps.filter((q) => !asked.has(sameQuestion(q)));
  return fresh.length >= 2 ? fresh : [];
}

/**
 * The part of a reply that is still streaming that may be shown: cut at
 * the tail marker, and hold back a trailing partial marker ("[[fol").
 */
export function visibleWhileStreaming(raw: string): string {
  if (!raw) return '';
  const open = raw.indexOf(FOLLOWUPS_OPEN);
  if (open !== -1) return raw.slice(0, open).trimEnd();
  for (let k = Math.min(FOLLOWUPS_OPEN.length - 1, raw.length); k > 0; k--) {
    if (FOLLOWUPS_OPEN.startsWith(raw.slice(-k))) return raw.slice(0, -k);
  }
  return raw;
}
