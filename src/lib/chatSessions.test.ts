import { describe, it, expect } from 'vitest';
import { groupIntoChats, newConversationId, CHAT_GAP_MS, type StoredChatMessage } from './chatSessions';

const at = (iso: string, role: 'user' | 'assistant', content: string): StoredChatMessage => ({ role, content, created_at: iso });

describe('groupIntoChats', () => {
  const stream = [
    at('2026-11-01T09:00:00Z', 'user', 'Is my TSH normal?'),
    at('2026-11-01T09:00:10Z', 'assistant', 'Your TSH is 2.1 ...'),
    at('2026-11-01T09:05:00Z', 'user', 'And my ferritin?'),
    at('2026-11-01T09:05:10Z', 'assistant', 'Ferritin ...'),
    at('2026-11-03T20:00:00Z', 'user', 'What should I prepare for my next appointment with the gynaecologist next week?'),
    at('2026-11-03T20:00:10Z', 'assistant', 'Bring ...'),
  ];

  it('splits on long gaps and lists the newest chat first', () => {
    const chats = groupIntoChats(stream);
    expect(chats).toHaveLength(2);
    expect(chats[0].messages).toHaveLength(2);
    expect(chats[1].messages).toHaveLength(4);
    expect(chats[1].title).toBe('Is my TSH normal?');
    expect(chats[1].startedAt?.toISOString()).toBe('2026-11-01T09:00:00.000Z');
  });

  it('keeps every message (nothing dropped)', () => {
    const chats = groupIntoChats(stream);
    expect(chats.flatMap((c) => c.messages)).toHaveLength(stream.length);
  });

  it('trims long titles to one short line', () => {
    const [newest] = groupIntoChats(stream);
    expect(newest.title.length).toBeLessThanOrEqual(60);
    expect(newest.title.endsWith('…')).toBe(true);
  });

  it('keeps messages within the gap together and handles missing timestamps', () => {
    const near = [
      at('2026-11-01T09:00:00Z', 'user', 'a'),
      { role: 'assistant' as const, content: 'b' },
      at(new Date(Date.parse('2026-11-01T09:00:00Z') + CHAT_GAP_MS - 1000).toISOString(), 'user', 'c'),
    ];
    expect(groupIntoChats(near)).toHaveLength(1);
    expect(groupIntoChats([])).toEqual([]);
  });
});

describe('groupIntoChats with conversation ids (migration 013)', () => {
  const inChat = (iso: string, role: 'user' | 'assistant', content: string, conversation_id: string): StoredChatMessage =>
    ({ role, content, created_at: iso, conversation_id });
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const C = '33333333-3333-4333-8333-333333333333';

  it('the QA case: three chats inside one hour stay three chats', () => {
    const msgs = [
      inChat('2026-11-20T10:00:00Z', 'user', 'Is my TSH normal?', A),
      inChat('2026-11-20T10:00:05Z', 'assistant', 'TSH ...', A),
      inChat('2026-11-20T10:10:00Z', 'user', 'What is AMH?', B),
      inChat('2026-11-20T10:10:05Z', 'assistant', 'AMH ...', B),
      inChat('2026-11-20T10:20:00Z', 'user', 'Prep for my visit', C),
      inChat('2026-11-20T10:20:05Z', 'assistant', 'Bring ...', C),
    ];
    const chats = groupIntoChats(msgs);
    expect(chats.map((c) => c.title)).toEqual(['Prep for my visit', 'What is AMH?', 'Is my TSH normal?']);
    expect(chats.map((c) => c.conversationId)).toEqual([C, B, A]);
    expect(chats.every((c) => c.messages.length === 2)).toBe(true);
    expect(chats[0].id).toBe(C);
  });

  it('mixed old (no id) and new rows: old rows keep the 3-hour rule, new rows group by id', () => {
    const msgs = [
      at('2026-11-01T09:00:00Z', 'user', 'old one'),
      at('2026-11-01T09:00:10Z', 'assistant', 'r1'),
      at('2026-11-01T20:00:00Z', 'user', 'old two'),
      at('2026-11-01T20:00:10Z', 'assistant', 'r2'),
      inChat('2026-11-20T10:00:00Z', 'user', 'new A', A),
      inChat('2026-11-20T10:00:05Z', 'assistant', 'ra', A),
      inChat('2026-11-20T10:05:00Z', 'user', 'new B', B),
      inChat('2026-11-20T10:05:05Z', 'assistant', 'rb', B),
    ];
    const chats = groupIntoChats(msgs);
    expect(chats.map((c) => c.title)).toEqual(['new B', 'new A', 'old two', 'old one']);
    expect(chats.map((c) => c.conversationId)).toEqual([B, A, null, null]);
    expect(chats[3].id).toBe('2026-11-01T09:00:00Z');
    expect(chats.flatMap((c) => c.messages)).toHaveLength(msgs.length);
  });

  it('continuing an old chat days later keeps it one chat and moves it to the top', () => {
    const msgs = [
      inChat('2026-11-01T09:00:00Z', 'user', 'first question', A),
      inChat('2026-11-01T09:00:05Z', 'assistant', 'r', A),
      inChat('2026-11-10T09:00:00Z', 'user', 'other chat', B),
      inChat('2026-11-10T09:00:05Z', 'assistant', 'r', B),
      inChat('2026-11-15T09:00:00Z', 'user', 'follow-up', A),
      inChat('2026-11-15T09:00:05Z', 'assistant', 'r', A),
    ];
    const chats = groupIntoChats(msgs);
    expect(chats).toHaveLength(2);
    expect(chats[0].conversationId).toBe(A);
    expect(chats[0].title).toBe('first question');
    expect(chats[0].messages.map((m) => m.content)).toEqual(['first question', 'r', 'follow-up', 'r']);
    expect(chats[0].startedAt?.toISOString()).toBe('2026-11-01T09:00:00.000Z');
  });

  it('newConversationId makes distinct UUIDs', () => {
    const a = newConversationId();
    const b = newConversationId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(a).not.toBe(b);
  });
});
