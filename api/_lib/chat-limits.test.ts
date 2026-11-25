import { describe, it, expect } from 'vitest';
import {
  applyChatLimits,
  MAX_USER_MESSAGE_CHARS,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_MESSAGES,
  MAX_TOTAL_CHARS,
  MAX_MESSAGES_HARD,
} from './chat-limits';

const u = (content: string) => ({ role: 'user', content });
const a = (content: string) => ({ role: 'assistant', content });

describe('applyChatLimits', () => {
  it('rejects a missing or empty list', () => {
    expect(applyChatLimits(undefined)).toMatchObject({ ok: false, status: 400 });
    expect(applyChatLimits([])).toMatchObject({ ok: false, status: 400 });
    expect(applyChatLimits([{ role: 'user', content: [{ type: 'image' }] }])).toMatchObject({ ok: false, status: 400 });
  });

  it('passes a normal short conversation through unchanged', () => {
    const r = applyChatLimits([u('hi'), a('hello'), u('my TSH?')]);
    expect(r).toEqual({ ok: true, trimmed: false, messages: [u('hi'), a('hello'), u('my TSH?')] });
  });

  it('rejects a new message over the single-message cap', () => {
    const r = applyChatLimits([u('x'.repeat(MAX_USER_MESSAGE_CHARS + 1))]);
    expect(r).toMatchObject({ ok: false, status: 413 });
    expect(applyChatLimits([u('x'.repeat(MAX_USER_MESSAGE_CHARS))]).ok).toBe(true);
  });

  it('rejects absurd message counts outright', () => {
    const many = Array.from({ length: MAX_MESSAGES_HARD + 1 }, (_, i) => (i % 2 ? a('a') : u('q')));
    expect(applyChatLimits(many)).toMatchObject({ ok: false, status: 413 });
  });

  it('keeps only the latest MAX_MESSAGES turns, starting on a user turn, newest last', () => {
    const msgs = Array.from({ length: 100 }, (_, i) => (i % 2 ? a(`a${i}`) : u(`q${i}`)));
    const r = applyChatLimits(msgs);
    if (!r.ok) throw new Error('expected ok');
    expect(r.trimmed).toBe(true);
    expect(r.messages.length).toBeLessThanOrEqual(MAX_MESSAGES);
    expect(r.messages[0].role).toBe('user');
    expect(r.messages[r.messages.length - 1]).toEqual(a('a99'));
  });

  it('drops the oldest turns to fit the total character budget, never the new question', () => {
    const big = 'y'.repeat(15_000);
    const msgs = [u(big), a(big), u(big), a(big), u(big), a(big), u('latest question')];
    const r = applyChatLimits(msgs);
    if (!r.ok) throw new Error('expected ok');
    const total = r.messages.reduce((n, m) => n + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
    expect(r.messages[r.messages.length - 1]).toEqual(u('latest question'));
    expect(r.messages[0].role).toBe('user');
  });

  it('truncates an over-long older turn instead of dropping the whole history', () => {
    const r = applyChatLimits([u('q'), a('z'.repeat(MAX_HISTORY_MESSAGE_CHARS + 500)), u('follow-up')]);
    if (!r.ok) throw new Error('expected ok');
    expect(r.messages[1].content.length).toBe(MAX_HISTORY_MESSAGE_CHARS);
    expect(r.messages[2]).toEqual(u('follow-up'));
  });

  it('maps legacy system turns to user and drops unknown roles / non-string content', () => {
    const r = applyChatLimits([
      { role: 'system', content: 'ctx' },
      { role: 'tool', content: 'x' },
      { role: 'assistant', content: [{ type: 'image', source: {} }] },
      u('q'),
    ]);
    expect(r).toEqual({ ok: true, trimmed: true, messages: [u('ctx'), u('q')] });
  });
});
