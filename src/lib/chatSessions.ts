// Ask AI keeps one long message stream per user on the server
// (chat_messages, no conversation id). To offer "Past chats" without a
// schema change, split that stream into chats on the client: a gap of
// more than CHAT_GAP_MS between two messages starts a new chat. Nothing
// is deleted or rewritten; this only groups what /api/chat/messages
// returns.

export const CHAT_GAP_MS = 3 * 60 * 60 * 1000; // 3 hours

export interface StoredChatMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string | null;
}

export interface PastChat {
  /** created_at of the chat's first message (stable key). */
  id: string;
  startedAt: Date | null;
  /** First question, trimmed to one line. */
  title: string;
  messages: StoredChatMessage[];
}

const TITLE_MAX = 60;

function chatTitle(messages: StoredChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user') ?? messages[0];
  const line = (first?.content ?? '').replace(/\s+/g, ' ').trim();
  if (!line) return 'Chat';
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

function time(m: StoredChatMessage): number | null {
  if (!m.created_at) return null;
  const t = new Date(m.created_at).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Group an oldest-first message list into chats, newest chat first.
 * Messages without a timestamp stay in the chat they follow.
 */
export function groupIntoChats(messages: StoredChatMessage[], gapMs = CHAT_GAP_MS): PastChat[] {
  const groups: StoredChatMessage[][] = [];
  let lastTime: number | null = null;
  for (const m of messages) {
    const t = time(m);
    const startNew =
      groups.length === 0 || (t !== null && lastTime !== null && t - lastTime > gapMs);
    if (startNew) groups.push([m]);
    else groups[groups.length - 1].push(m);
    if (t !== null) lastTime = t;
  }
  return groups
    .map((g, i) => {
      const firstTime = g.map(time).find((t) => t !== null) ?? null;
      return {
        id: g[0].created_at ?? `chat-${i}`,
        startedAt: firstTime === null ? null : new Date(firstTime),
        title: chatTitle(g),
        messages: g,
      };
    })
    .reverse();
}
