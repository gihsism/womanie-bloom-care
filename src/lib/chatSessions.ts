// "Past chats" on Ask AI. Since migration 013 every new turn carries a
// conversation_id (made in the browser when a chat starts), and messages
// with the same id are one chat, however far apart in time. Older rows
// have no id; those are still split on time: a gap of more than
// CHAT_GAP_MS between two of them starts a new chat. Nothing is deleted
// or rewritten; this only groups what /api/chat/messages returns.

export const CHAT_GAP_MS = 3 * 60 * 60 * 1000; // 3 hours

export interface StoredChatMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string | null;
  conversation_id?: string | null;
}

export interface PastChat<T extends StoredChatMessage = StoredChatMessage> {
  /** conversation_id, or (old chats) created_at of the first message. */
  id: string;
  /** Set for chats stored with an id; continuing the chat reuses it. */
  conversationId: string | null;
  startedAt: Date | null;
  /** First question, trimmed to one line. */
  title: string;
  messages: T[];
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

/** A fresh id for a new chat (UUID v4). */
export function newConversationId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Group an oldest-first message list into chats, newest chat first
 * (by its latest message). Messages with a conversation_id join that
 * chat; messages without one use the time-gap rule among themselves.
 * Messages without a timestamp stay in the chat they follow.
 */
export function groupIntoChats<T extends StoredChatMessage>(messages: T[], gapMs = CHAT_GAP_MS): PastChat<T>[] {
  type Group = { conversationId: string | null; messages: T[]; order: number; lastTime: number | null };
  const groups: Group[] = [];
  const byId = new Map<string, Group>();
  let legacy: Group | null = null; // the open time-gap chat, if any
  for (const m of messages) {
    const t = time(m);
    const cid = m.conversation_id || null;
    let g: Group | undefined;
    if (cid) {
      g = byId.get(cid);
      if (!g) {
        g = { conversationId: cid, messages: [], order: groups.length, lastTime: null };
        groups.push(g);
        byId.set(cid, g);
      }
    } else {
      const startNew =
        legacy === null || (t !== null && legacy.lastTime !== null && t - legacy.lastTime > gapMs);
      if (startNew) {
        legacy = { conversationId: null, messages: [], order: groups.length, lastTime: null };
        groups.push(legacy);
      }
      g = legacy!;
    }
    g.messages.push(m);
    if (t !== null) g.lastTime = t;
  }
  return groups
    .sort((a, b) => {
      const at = a.lastTime ?? -Infinity;
      const bt = b.lastTime ?? -Infinity;
      return at !== bt ? bt - at : b.order - a.order;
    })
    .map((g) => {
      const firstTime = g.messages.map(time).find((t) => t !== null) ?? null;
      return {
        id: g.conversationId ?? g.messages[0].created_at ?? `chat-${g.order}`,
        conversationId: g.conversationId,
        startedAt: firstTime === null ? null : new Date(firstTime),
        title: chatTitle(g.messages),
        messages: g.messages,
      };
    });
}
