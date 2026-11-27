import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Records every life_events select with its filters.
const selects: [string, string, unknown][][] = [];

vi.mock('@/integrations/db/client', () => ({
  db: {
    from: () => {
      const filters: [string, string, unknown][] = [];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, 'eq', v]); return q; },
        order: () => q,
        limit: async () => { selects.push(filters); return { data: [], error: null }; },
      };
      return q;
    },
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user_1' } }) }));

import { useLifeEvents } from './useLifeEvents';

describe('useLifeEvents enabled option (Home baby hero)', () => {
  beforeEach(() => { selects.length = 0; });

  it('loads nothing while disabled, then exactly once for the baby', async () => {
    const { rerender } = renderHook(
      ({ babyId }: { babyId: string | null }) => useLifeEvents('feed', { babyId, enabled: Boolean(babyId) }),
      { initialProps: { babyId: null as string | null } },
    );
    await new Promise(r => setTimeout(r, 20));
    expect(selects).toHaveLength(0);

    rerender({ babyId: 'b1' });
    await waitFor(() => expect(selects).toHaveLength(1));
    expect(selects[0]).toContainEqual(['baby_id', 'eq', 'b1']);
  });

  it('still loads straight away by default', async () => {
    renderHook(() => useLifeEvents('med_dose'));
    await waitFor(() => expect(selects).toHaveLength(1));
  });
});
