import { describe, it, expect } from 'vitest';
import { groupIntoChats, CHAT_GAP_MS, type StoredChatMessage } from './chatSessions';

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
