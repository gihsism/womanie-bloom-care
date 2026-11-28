import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LifeEvent } from '@/hooks/useLifeEvents';
import { FEED_ACTIVE_KEY, SLEEP_ACTIVE_KEY } from '@/lib/babyQuickFeed';

// Vaccines and growth come from the card's own useLifeEvents calls.
const lists: Record<string, LifeEvent[]> = { baby_vaccine: [], baby_growth: [] };
vi.mock('@/hooks/useLifeEvents', () => ({
  useLifeEvents: (kind: string) => ({ events: lists[kind] ?? [], loaded: true }),
}));
import BabyHomeCard from './BabyHomeCard';

const ev = (id: string, kind: LifeEvent['kind'], minsAgo: number, data: Record<string, unknown>, lenMin?: number): LifeEvent => {
  const t = Date.now() - minsAgo * 60000;
  return { id, kind, occurred_at: new Date(t).toISOString(), ended_at: lenMin ? new Date(t + lenMin * 60000).toISOString() : null, baby_id: 'b1', data };
};
const daysAgoYmd = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function setup(feedEvents: LifeEvent[], nappies: LifeEvent[] = []) {
  let events = [...feedEvents];
  const feeds = {
    get events() { return events; },
    add: vi.fn(async (e: { occurred_at: string; ended_at?: string | null; data?: Record<string, unknown> }) => {
      const saved: LifeEvent = { id: 'new', kind: 'feed', occurred_at: e.occurred_at, ended_at: e.ended_at ?? null, baby_id: 'b1', data: e.data ?? {} };
      events = [saved, ...events];
      return saved;
    }),
    remove: vi.fn(async (id: string) => { events = events.filter(x => x.id !== id); return true; }),
  };
  const ui = () => (
    <MemoryRouter>
      <BabyHomeCard babyId="b1" birthDate={daysAgoYmd(20)} sex="female" feeds={feeds} nappies={nappies} />
    </MemoryRouter>
  );
  const r = render(ui());
  return { feeds, rerender: () => r.rerender(ui()) };
}

describe('Home baby card', () => {
  beforeEach(() => { localStorage.clear(); lists.baby_vaccine = []; lists.baby_growth = []; });
  afterEach(() => { vi.useRealTimers(); });

  it('last feed, feeds and nappies today, next vaccine and weight; each line opens its Baby tab', async () => {
    lists.baby_growth = [ev('g1', 'baby_growth', 60 * 24, { weight_g: 3600 })];
    setup(
      [ev('f1', 'feed', 125, { method: 'bottle', ml: 90, milk: 'formula' }), ev('f2', 'feed', 300, { method: 'breast_l' }, 15)],
      [ev('n1', 'nappy', 30, { type: 'wet' }), ev('n2', 'nappy', 90, { type: 'both' })],
    );
    expect(screen.getByTestId('baby-home-last-feed')).toHaveTextContent('2h 05 ago · bottle 90 ml');
    expect(screen.getByTestId('baby-home-last-feed')).toHaveAttribute('href', '/dashboard/baby?tab=feed');
    expect(screen.getByTestId('baby-home-nappies')).toHaveTextContent('2 wet · 1 dirty');
    expect(screen.getByTestId('baby-home-nappies')).toHaveAttribute('href', '/dashboard/baby?tab=nappy');
    // Born 20 days ago, so the next visit is the 2-month one (RSV depends on the birth month).
    const vax = await screen.findByTestId('baby-home-vaccine');
    expect(vax).toHaveAttribute('href', '/dashboard/baby?tab=vax');
    expect(vax.textContent).toMatch(/due (now|\d+ \w{3})/);
    const w = await screen.findByTestId('baby-home-weight');
    expect(w).toHaveTextContent(/3\.6 kg · \d+(st|nd|rd|th) percentile/);
    expect(w).toHaveAttribute('href', '/dashboard/baby?tab=growth');
    expect(screen.queryByTestId('baby-home-timer')).toBeNull();
  });

  it('no feeds yet: "None yet" and no Log feed button (the page button opens the Feed tab)', () => {
    setup([]);
    expect(screen.getByTestId('baby-home-last-feed')).toHaveTextContent('None yet');
    expect(screen.getByTestId('baby-home-feeds')).toHaveTextContent('0');
    expect(screen.queryByTestId('home-feed-quick-log')).toBeNull();
  });

  it('Log feed repeats the last feed; Undo removes it', async () => {
    const { feeds, rerender } = setup([ev('f1', 'feed', 60, { method: 'breast_l' }, 12)]);
    const btn = screen.getByTestId('home-feed-quick-log');
    expect(btn).toHaveTextContent('Log feed: Right breast · 12 min');
    fireEvent.click(btn);
    await screen.findByText('Right breast · 12 min logged ✓');
    expect(feeds.add).toHaveBeenCalledWith(expect.objectContaining({ data: { method: 'breast_r' } }));
    rerender();
    expect(screen.getByTestId('baby-home-feeds')).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(feeds.remove).toHaveBeenCalledWith('new'));
    await screen.findByText('Removed.');
  });

  it('a running breastfeeding timer shows a live clock, opens the Feed tab, and hides Log feed', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    localStorage.setItem(FEED_ACTIVE_KEY('b1'), JSON.stringify({ side: 'breast_l', start: Date.now() - 65_000 }));
    setup([ev('f1', 'feed', 60, { method: 'bottle', ml: 90 })]);
    const t = screen.getByTestId('baby-home-timer');
    expect(t).toHaveTextContent('Feeding now · Left breast');
    expect(t).toHaveTextContent('1:05');
    expect(t).toHaveAttribute('href', '/dashboard/baby?tab=feed');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(t).toHaveTextContent('1:07');
    expect(screen.queryByTestId('home-feed-quick-log')).toBeNull();
  });

  it('a running sleep timer opens the Sleep tab', () => {
    localStorage.setItem(SLEEP_ACTIVE_KEY('b1'), String(Date.now() - 3_725_000));
    setup([]);
    const t = screen.getByTestId('baby-home-timer');
    expect(t).toHaveTextContent(/Asleep\s*1:02:0\d/);
    expect(t).toHaveAttribute('href', '/dashboard/baby?tab=sleep');
  });

  it('numbers only: no judgement words on the card', async () => {
    lists.baby_growth = [ev('g1', 'baby_growth', 60, { weight_g: 2500 })];
    setup([ev('f1', 'feed', 60 * 30, { method: 'bottle', ml: 20 })]);
    await screen.findByTestId('baby-home-weight');
    const text = screen.getByTestId('baby-home-card').textContent ?? '';
    expect(text).not.toMatch(/\b(good|great|well done|too (few|many|low|high|long)|only|behind|overdue|late|not enough|healthy|normal|low|small)\b/i);
  });

  it('is its own block under the hero, so the hero itself keeps no buttons', () => {
    const hero = readFileSync(resolve(__dirname, 'BabyBodyMap.tsx'), 'utf8');
    expect(hero).toMatch(/<\/section>\s*<BabyHomeCard\b/);
  });
});
