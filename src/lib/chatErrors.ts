// What Ask AI shows when an answer does not arrive (timeout, rate limit,
// network loss, server error). Shown under the chat with Try again; her
// question stays on screen and goes back in the box.

export type ChatErrorKind = 'timeout' | 'rate-limit' | 'network' | 'server';

export interface ChatErrorState {
  kind: ChatErrorKind;
  /** The detail from streamChat (for a rate limit: the server's own wording). */
  message: string;
  /** Her question, re-sent by Try again. */
  question: string;
  /** Where her question sits in the chat; Try again replaces it from there. */
  userIdx: number;
}

const TITLES: Record<ChatErrorKind, string> = {
  timeout: 'Ask AI took too long to answer',
  'rate-limit': 'Ask AI needs a short break',
  network: 'Connection lost',
  server: 'Ask AI could not answer',
};

export function chatErrorText(kind: ChatErrorKind, message: string): { title: string; detail: string } {
  const detail = kind === 'timeout'
    ? 'This can happen when it is busy. Please try again.'
    : message.trim() || 'Please try again.';
  return { title: TITLES[kind] ?? TITLES.server, detail };
}
