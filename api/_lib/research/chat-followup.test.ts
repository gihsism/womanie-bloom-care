import { describe, expect, it, vi } from 'vitest';
vi.mock('./hybrid.js', () => ({ selectChatSourcesHybrid: vi.fn(async () => []) }));
import { selectChatEvidenceForTurn, type ChatEvidence } from './chat-prompt';

const ev = (n: number): ChatEvidence => ({
  researchItems: [],
  chatSources: Array.from({ length: n }, (_, i) => ({ n: i + 1, id: `x${i}`, pmid: String(i), title: 't', source: 's', year: 2020, evidenceLevel: 'study' as const, url: 'u' })),
  passages: [],
  block: `block${n}`,
});

describe('selectChatEvidenceForTurn', () => {
  it('a question that finds sources is searched once, unchanged', async () => {
    const select = vi.fn(async () => ev(3));
    const r = await selectChatEvidenceForTurn('And what about ibuprofen?', 'Is paracetamol safe?', 'pregnancy', select);
    expect(r.block).toBe('block3');
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith('And what about ibuprofen?', 'pregnancy');
  });

  it('a follow-up with no sources is searched again with the previous question', async () => {
    const select = vi.fn(async (q: string | null | undefined) => (q?.includes('coffee') ? ev(4) : ev(0)));
    const r = await selectChatEvidenceForTurn('How many cups a day exactly?', 'Is it safe to drink coffee while pregnant?', 'pregnancy', select);
    expect(r.block).toBe('block4');
    expect(select).toHaveBeenLastCalledWith('Is it safe to drink coffee while pregnant?\nHow many cups a day exactly?', 'pregnancy');
  });

  it('first question of a chat: no second search', async () => {
    const select = vi.fn(async () => ev(0));
    await selectChatEvidenceForTurn('Hello', undefined, null, select);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('keeps the first result when the retry also finds nothing', async () => {
    const select = vi.fn(async () => ev(0));
    const r = await selectChatEvidenceForTurn('Thanks!', 'Is coffee ok?', null, select);
    expect(select).toHaveBeenCalledTimes(2);
    expect(r.chatSources).toEqual([]);
  });
});
