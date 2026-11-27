import { describe, it, expect } from 'vitest';
import { changesSinceLastReport } from './reportChanges';
import type { ExtractedItem } from './health-trends';

const lab = (doc: string, title: string, value: string, status: string, date: string, unit = 'ng/mL'): ExtractedItem => ({
  title, value, unit, status, data_type: 'lab_result', date_recorded: date, document_id: doc,
});

describe('changesSinceLastReport', () => {
  const rows = [
    // earlier reports
    lab('d1', 'Ferritin', '60', 'normal', '2026-01-10'),
    lab('d2', 'Ferritin', '40', 'normal', '2026-06-01'),
    lab('d2', 'TSH', '5.9', 'abnormal', '2026-06-01', 'mIU/L'),
    lab('d1', 'Vitamin D', '20', 'normal', '2026-01-10'),
    lab('d2', 'Vitamin D', '30', 'normal', '2026-06-01'),
    lab('d2', 'Prolactin', '200', 'normal', '2026-06-01'),
    // this report
    lab('d3', 'Ferritin', '12', 'abnormal', '2026-11-01'),
    lab('d3', 'TSH', '2.1', 'normal', '2026-11-01', 'mIU/L'),
    lab('d3', 'Vitamin D', '45', 'normal', '2026-11-01'),
    lab('d3', 'Prolactin', '205', 'normal', '2026-11-01'),
    lab('d3', 'AMH', '2.0', 'normal', '2026-11-01'),
  ];

  it('sorts this report into newly outside, back in range and steady runs', () => {
    const c = changesSinceLastReport('d3', rows)!;
    expect(c.compared).toBe(4); // AMH has no earlier reading
    expect(c.newlyOut).toEqual([{ title: 'Ferritin', value: '12 ng/mL', detail: 'was 40 ng/mL on 1 Jun 2026 (within range)' }]);
    expect(c.backInRange).toEqual([{ title: 'TSH', value: '2.1 mIU/L', detail: 'was 5.9 mIU/L on 1 Jun 2026 (outside range)' }]);
    expect(c.steady.map(s => s.title)).toEqual(['Vitamin D']);
    expect(c.steady[0].detail).toMatch(/^Gone up at each of your last 3 tests: 20 \(10 Jan 2026\)/);
  });

  it('an older report uploaded late is compared with the reports before it, not newer ones', () => {
    const c = changesSinceLastReport('d2', rows)!;
    expect(c.compared).toBe(2); // Ferritin and Vitamin D were on d1
    expect(c.newlyOut).toEqual([]);
    expect(c.backInRange).toEqual([]);
  });

  it('null for a first report or a report with no lab values', () => {
    expect(changesSinceLastReport('d1', rows)).toBeNull();
    expect(changesSinceLastReport('nope', rows)).toBeNull();
  });

  it('uses the friendly name when given', () => {
    const c = changesSinceLastReport('d3', rows, t => `${t}!`)!;
    expect(c.newlyOut[0].title).toBe('Ferritin!');
  });
});
