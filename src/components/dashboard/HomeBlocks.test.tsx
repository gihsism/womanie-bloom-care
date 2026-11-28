import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TodayList } from './HomeBlocks';
import { recentWarningSign } from '@/lib/ivfJourney';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, label: `Row ${i + 1}`, target: '/dashboard' }));

describe('TodayList', () => {
  it('shows the first 3 rows and an "N more" link that opens the rest', () => {
    const go = vi.fn();
    render(<TodayList items={rows(5)} go={go} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '2 more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Row 5' }));
    expect(go).toHaveBeenCalledWith('/dashboard');
  });

  it('no "more" link for 3 rows or fewer; the calm line when empty', () => {
    const { rerender } = render(<TodayList items={rows(3)} go={() => {}} />);
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull();
    rerender(<TodayList items={[]} go={() => {}} />);
    expect(screen.getByText('Nothing needs you today')).toBeInTheDocument();
  });
});

describe('recentWarningSign (IVF two-week wait)', () => {
  const now = new Date('2026-11-23T09:00:00Z');
  const entry = (hoursAgo: number, symptoms: string[]) => ({ occurred_at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(), data: { symptoms } });

  it('a warning sign in the last 48 h counts; ordinary symptoms and older entries do not', () => {
    expect(recentWarningSign([entry(3, ['Bloating', 'Strong tummy pain'])], now)).toBe(true);
    expect(recentWarningSign([entry(47, ['Heavy bleeding'])], now)).toBe(true);
    expect(recentWarningSign([entry(49, ['Heavy bleeding'])], now)).toBe(false);
    expect(recentWarningSign([entry(1, ['Bloating', 'Cramping', 'Spotting'])], now)).toBe(false);
    expect(recentWarningSign([{ occurred_at: 'nonsense', data: { symptoms: ['Short of breath'] } }], now)).toBe(false);
  });
});
