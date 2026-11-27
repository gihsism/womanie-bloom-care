import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReportChanges from './ReportChanges';
import type { ExtractedItem } from '@/lib/health-trends';

const lab = (doc: string, title: string, value: string, status: string, date: string): ExtractedItem => ({
  title, value, unit: 'ng/mL', status, data_type: 'lab_result', date_recorded: date, document_id: doc,
});

describe('ReportChanges (Records, on an analysed report)', () => {
  it('lists what moved since the previous report', () => {
    render(<ReportChanges documentId="d2" rows={[
      lab('d1', 'Ferritin', '40', 'normal', '2026-06-01'),
      lab('d2', 'Ferritin', '12', 'abnormal', '2026-11-01'),
    ]} />);
    expect(screen.getByText('What changed since your last report')).toBeInTheDocument();
    expect(screen.getByText('Newly outside the range')).toBeInTheDocument();
    expect(screen.getByText('was 40 ng/mL on 1 Jun 2026 (within range)')).toBeInTheDocument();
  });

  it('says so when nothing moved', () => {
    render(<ReportChanges documentId="d2" rows={[
      lab('d1', 'Ferritin', '40', 'normal', '2026-06-01'),
      lab('d2', 'Ferritin', '42', 'normal', '2026-11-01'),
    ]} />);
    expect(screen.getByText(/1 test compared with your earlier reports: none moved/)).toBeInTheDocument();
  });

  it('hides on a first report', () => {
    const { container } = render(<ReportChanges documentId="d1" rows={[lab('d1', 'Ferritin', '40', 'normal', '2026-06-01')]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
