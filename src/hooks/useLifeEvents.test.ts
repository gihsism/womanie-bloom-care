// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Records every insert; `failNext` makes the next N inserts fail.
const inserted: Record<string, unknown>[] = [];
let failNext = 0;

vi.mock('@/integrations/db/client', () => ({
  db: {
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: async () => {
          if (failNext > 0) { failNext--; return { data: null, error: { message: 'boom' } }; }
          inserted.push(row);
          return { data: [{ id: `id-${inserted.length}`, ...row }], error: null };
        },
      }),
    }),
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user_1' } }) }));

import { importLocalOnce } from './useLifeEvents';

type Old = { startedAt: number; endedAt: number | null };
const toEvent = (c: Old) => c.endedAt === null ? null : {
  occurred_at: new Date(c.startedAt).toISOString(),
  ended_at: new Date(c.endedAt).toISOString(),
};

describe('importLocalOnce (device history -> account)', () => {
  beforeEach(() => {
    localStorage.clear();
    inserted.length = 0;
    failNext = 0;
  });

  it('moves every finished entry into the account, skipping unfinished ones', async () => {
    localStorage.setItem('k', JSON.stringify([
      { startedAt: 1_000, endedAt: 61_000 },
      { startedAt: 300_000, endedAt: null },
      { startedAt: 600_000, endedAt: 660_000 },
    ]));
    const moved = await importLocalOnce<Old, Record<string, never>>('user_1', 'k', 'contraction', toEvent);
    expect(moved).toBe(2);
    expect(inserted.map(r => r.kind)).toEqual(['contraction', 'contraction']);
    expect(inserted.every(r => r.user_id === 'user_1')).toBe(true);
  });

  it('runs only once per device', async () => {
    localStorage.setItem('k', JSON.stringify([{ startedAt: 1_000, endedAt: 2_000 }]));
    await importLocalOnce<Old, Record<string, never>>('user_1', 'k', 'contraction', toEvent);
    const second = await importLocalOnce<Old, Record<string, never>>('user_1', 'k', 'contraction', toEvent);
    expect(second).toBe(0);
    expect(inserted).toHaveLength(1);
  });

  it('keeps the device copy and retries next time if any save failed', async () => {
    localStorage.setItem('k', JSON.stringify([{ startedAt: 1_000, endedAt: 2_000 }]));
    failNext = 1;
    expect(await importLocalOnce<Old, Record<string, never>>('user_1', 'k', 'contraction', toEvent)).toBe(0);
    expect(localStorage.getItem('k')).not.toBeNull();
    expect(await importLocalOnce<Old, Record<string, never>>('user_1', 'k', 'contraction', toEvent)).toBe(1);
  });

  it('never deletes the original device data', async () => {
    localStorage.setItem('k', JSON.stringify([{ startedAt: 1_000, endedAt: 2_000 }]));
    await importLocalOnce<Old, Record<string, never>>('user_1', 'k', 'contraction', toEvent);
    expect(JSON.parse(localStorage.getItem('k') as string)).toHaveLength(1);
  });
});
