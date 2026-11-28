import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import BabyGrowthPrint, { printChartBox, PRINT_W } from './BabyGrowthPrint';
import { dailyRows } from '@/lib/babyStats';

const events = [
  { id: 'a', occurred_at: '2026-01-01T12:00:00.000Z', data: { weight_g: 3232 } },
  { id: 'b', occurred_at: '2026-01-29T12:00:00.000Z', data: { weight_g: 4300, length_cm: 54, head_cm: 37 } },
];

describe('BabyGrowthPrint', () => {
  it('draws the WHO charts that have points and lists every measurement with its percentile', () => {
    const { container, getByTestId } = render(<BabyGrowthPrint birthDate="2026-01-01" sex="female" events={events} />);
    for (const m of ['weight', 'length', 'head']) expect(getByTestId(`print-growth-${m}`).tagName.toLowerCase()).toBe('svg');
    // Five WHO curves + her line on the weight chart, curves labelled at the end.
    const weight = getByTestId('print-growth-weight');
    expect(weight.querySelectorAll('path')).toHaveLength(6);
    expect(weight.textContent).toContain('97th');
    expect(weight.getAttribute('viewBox')).toBe('0 0 640 210');
    const rows = getByTestId('print-growth-table').querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain('3.23 kg(50th)');
    expect(rows[0].textContent).toMatch(/54 cm\(\d+(st|nd|rd|th)\)/);
    expect(container.textContent).toContain('Latest: 4.3 kg at 4 weeks, around the');
    expect(container.textContent).not.toMatch(/\b(normal|small|big|low|high|too)\b/i);
  });

  it('without the sex: the table only, and how to get the charts', () => {
    const { container, queryByTestId } = render(<BabyGrowthPrint birthDate="2026-01-01" sex={null} events={events} />);
    expect(queryByTestId('print-growth-weight')).toBeNull();
    expect(container.textContent).toContain('3.23 kg');
    expect(container.textContent).not.toContain('(50th)');
    expect(container.textContent).toContain('need the baby’s sex');
  });

  it('nothing measured: nothing printed', () => {
    const { container } = render(<BabyGrowthPrint birthDate="2026-01-01" sex="female" events={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('dailyRows sleep', () => {
  it('adds sleep minutes per day, split at midnight', () => {
    const now = new Date(2026, 10, 25, 10, 0);
    const iso = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
    const rows = dailyRows([], [], now, 7, [
      { occurred_at: iso(24, 22), ended_at: iso(25, 1, 30), data: {} },
      { occurred_at: iso(23, 13), ended_at: iso(23, 14), data: {} },
      { occurred_at: iso(23, 15), ended_at: null, data: {} },
    ]);
    expect(rows.map(r => r.sleepMin)).toEqual([0, 0, 0, 0, 60, 120, 90]);
    expect(dailyRows([], [], now).every(r => r.sleepMin === 0)).toBe(true);
  });

  describe('axis labels legible at phone width and on paper', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('the viewBox follows the drawn width, so labels are 11 CSS px at any width', () => {
      expect(printChartBox(358)).toEqual({ w: 358, h: 190, font: 11 });
      expect(printChartBox(PRINT_W)).toEqual({ w: 640, h: 210, font: 11 });
      expect(printChartBox(0)).toEqual({ w: 640, h: 210, font: 11 });
      expect(printChartBox(120).w).toBe(300);
    });

    it('at 390 px the chart is drawn 1:1 (viewBox = its width); on print it goes back to 640 x 210, same curves', () => {
      vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 358, height: 0 } as DOMRect);
      const { getByTestId } = render(<BabyGrowthPrint birthDate="2026-01-01" sex="female" events={events} />);
      const weight = getByTestId('print-growth-weight');
      expect(weight.getAttribute('viewBox')).toBe('0 0 358 190');
      const labels = [...weight.querySelectorAll('text')];
      expect(labels.length).toBeGreaterThan(8);
      for (const t of labels) expect(Number(t.getAttribute('font-size'))).toBeGreaterThanOrEqual(10);
      expect(weight.querySelectorAll('path')).toHaveLength(6);
      fireEvent(window, new Event('beforeprint'));
      expect(weight.getAttribute('viewBox')).toBe('0 0 640 210');
      expect(weight.querySelectorAll('path')).toHaveLength(6);
      fireEvent(window, new Event('afterprint'));
      expect(weight.getAttribute('viewBox')).toBe('0 0 358 190');
    });
  });
});
