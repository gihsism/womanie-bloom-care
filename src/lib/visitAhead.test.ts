import { describe, it, expect } from 'vitest';
import { isVisitAhead, nextVisitAhead } from './visitAhead';

const NOW = Date.parse('2026-11-28T10:00:00Z');
const at = (min: number) => new Date(NOW + min * 60_000).toISOString();

describe('isVisitAhead', () => {
  it('a visit in progress is still ahead until its end; then it is past', () => {
    expect(isVisitAhead({ scheduled_at: at(-10), duration: 30 }, NOW)).toBe(true);
    expect(isVisitAhead({ scheduled_at: at(-31), duration: 30 }, NOW)).toBe(false);
    expect(isVisitAhead({ scheduled_at: at(-20) }, NOW)).toBe(true); // unknown length = 30 min
    expect(isVisitAhead({ scheduled_at: at(60) }, NOW)).toBe(true);
  });

  it('cancelled, completed and no-show visits are never ahead; a broken date neither', () => {
    for (const status of ['cancelled', 'Completed', 'no_show', 'no-show']) {
      expect(isVisitAhead({ scheduled_at: at(60), status }, NOW)).toBe(false);
    }
    expect(isVisitAhead({ scheduled_at: 'soon' }, NOW)).toBe(false);
  });

  it('nextVisitAhead picks the soonest one still ahead', () => {
    const list = [{ id: 'later', scheduled_at: at(3 * 1440) }, { id: 'now', scheduled_at: at(-5) }, { id: 'old', scheduled_at: at(-90) }];
    expect(nextVisitAhead(list, NOW)?.id).toBe('now');
    expect(nextVisitAhead([], NOW)).toBeNull();
  });
});
