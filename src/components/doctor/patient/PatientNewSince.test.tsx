import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PatientNewSince from './PatientNewSince';

const NOW = Date.parse('2026-11-26T12:00:00Z');

describe('PatientNewSince (chart)', () => {
  it('lists what arrived after the last completed visit and opens its tab', () => {
    const onOpenTab = vi.fn();
    render(
      <PatientNewSince
        now={NOW}
        onOpenTab={onOpenTab}
        appointments={[{ id: 'v1', scheduled_at: '2026-10-15T09:00:00Z', status: 'completed', consultation_type: null, notes: null }]}
        documents={[{ id: 'd1', file_name: 'blood.pdf', document_type: 'lab', ai_summary: null, ai_suggested_name: 'Blood test', uploaded_at: '2026-11-20T00:00:00Z' }]}
        medicalData={[{ id: 'r1', document_id: 'd1', title: 'TSH', value: 6.1, unit: 'mU/L', reference_range: null, status: 'high', data_type: null, date_recorded: null, notes: null, raw_data: null }]}
        notes={[]}
        signals={[]}
      />,
    );
    expect(screen.getByText('New since last visit')).toBeInTheDocument();
    expect(screen.getByText(/^Since /)).toBeInTheDocument();
    fireEvent.click(screen.getByText('TSH 6.1 mU/L'));
    expect(onOpenTab).toHaveBeenCalledWith('results');
    fireEvent.click(screen.getByText('Blood test'));
    expect(onOpenTab).toHaveBeenCalledWith('documents');
  });

  it('explains a first visit instead of listing everything', () => {
    render(<PatientNewSince now={NOW} onOpenTab={vi.fn()} appointments={[]} documents={[]} medicalData={[]} notes={[]} signals={[]} />);
    expect(screen.getByText(/No completed visit with you yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says nothing is new when nothing is', () => {
    render(
      <PatientNewSince
        now={NOW}
        onOpenTab={vi.fn()}
        appointments={[{ id: 'v1', scheduled_at: '2026-11-25T09:00:00Z', status: 'completed', consultation_type: null, notes: null }]}
        documents={[]}
        medicalData={[]}
        notes={[]}
        signals={[]}
      />,
    );
    expect(screen.getByText('Nothing new since then.')).toBeInTheDocument();
  });
});
