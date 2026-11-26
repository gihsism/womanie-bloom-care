// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseChatMeta } from './chatMeta';
import { flushPendingFeedback, readFeedback, saveFeedback, upsertFeedback, type LocalFeedback } from './chatFeedback';

const ID = '3f2b8c1e-9a4d-4e6f-8b21-7c5d9e0a1b2c';

describe('parseChatMeta (end-of-answer event)', () => {
  it('keeps valid follow-ups, record refs and the message id', () => {
    const meta = parseChatMeta({
      followUps: ['What foods raise my ferritin?', 'Should I retest?'],
      records: [{ kind: 'lab', id: 'l2', label: 'Ferritin', date: '2026-06-01', href: '/dashboard/medical-history?doc=docB' }],
      messageId: ID,
    });
    expect(meta).toEqual({
      followUps: ['What foods raise my ferritin?', 'Should I retest?'],
      records: [{ kind: 'lab', id: 'l2', label: 'Ferritin', date: '2026-06-01', href: '/dashboard/medical-history?doc=docB' }],
      messageId: ID,
    });
  });

  it('malformed parts degrade to nothing, never throw', () => {
    expect(parseChatMeta(null)).toBeNull();
    expect(parseChatMeta('x')).toBeNull();
    expect(parseChatMeta({ followUps: 'nope', records: [{ href: 'https://x' }], messageId: 'abc' }))
      .toEqual({ followUps: [], records: [], messageId: null });
    // One chip alone is not shown.
    expect(parseChatMeta({ followUps: ['Only one?'] })?.followUps).toEqual([]);
  });
});

describe('chat feedback, kept in the browser until the server stores it', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const base = { answerKey: ID, messageId: ID, conversationId: null, model: 'claude-haiku-5-5', rating: -1 as const, reason: 'unclear' as const, comment: null };

  it('re-rating an answer replaces the earlier rating', () => {
    const a: LocalFeedback = { ...base, at: '1', synced: false };
    const list = upsertFeedback(upsertFeedback([], a), { ...a, rating: 1, at: '2' });
    expect(list).toHaveLength(1);
    expect(list[0].rating).toBe(1);
  });

  it('migration not applied (stored:false): kept locally as unsent, sent on the next flush', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ stored: false }) });
    vi.stubGlobal('fetch', fetchMock);
    const saved = await saveFeedback('u1', base);
    expect(saved.synced).toBe(false);
    expect(readFeedback('u1')).toHaveLength(1);
    expect(readFeedback('u1')[0].synced).toBe(false);

    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ stored: true }) });
    expect(await flushPendingFeedback('u1')).toBe(1);
    expect(readFeedback('u1')[0].synced).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(Object.keys(body).sort()).toEqual(['answerKey', 'comment', 'conversationId', 'messageId', 'model', 'rating', 'reason']);
  });

  it('a network failure never throws and keeps the rating', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const saved = await saveFeedback('u2', base);
    expect(saved.synced).toBe(false);
    expect(readFeedback('u2')).toHaveLength(1);
  });
});
