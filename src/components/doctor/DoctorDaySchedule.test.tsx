import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import DoctorDaySchedule from './DoctorDaySchedule';

const NOW = new Date(2026, 10, 26, 8, 0).getTime();
const at = (dayOffset: number, h: number) => new Date(2026, 10, 26 + dayOffset, h, 0).toISOString();

const patients = [
  { id: 'c1', patient_id: 'p1', status: 'approved', created_at: '', connection_type: 'code', patient_full_name: 'Anna Keller' },
  { id: 'c2', patient_id: 'p2', status: 'pending', created_at: '', connection_type: 'booking', patient_full_name: 'Bea Roth' },
];
const appointments = [
  { id: 'a1', patient_id: 'p1', scheduled_at: at(0, 10), status: 'scheduled', consultation_type: 'in_person', duration: 30 },
  { id: 'a2', patient_id: 'p2', scheduled_at: at(1, 9), status: 'scheduled', consultation_type: 'video', duration: 20 },
];

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}{loc.search}</p>;
};

afterEach(() => vi.unstubAllGlobals());

describe('DoctorDaySchedule (the doctor\'s day)', () => {
  it('lists today and tomorrow with the facts from the consent-gated day API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ visits: [
        { appointment_id: 'a1', patient_id: 'p1', scheduled_at: at(0, 10), approved: true, life_stage: 'menopause',
          open_questions: 3, last_visit_at: '2026-09-01T09:00:00Z', new_docs: 2, new_abnormal: 1, low_mood_streak: 0 },
        { appointment_id: 'a2', patient_id: 'p2', scheduled_at: at(1, 9), approved: false },
      ] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/doctor/dashboard']}>
        <Routes>
          <Route path="/doctor/dashboard" element={<DoctorDaySchedule appointments={appointments} patients={patients} now={NOW} />} />
          <Route path="/doctor/patient/:id" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Anna Keller')).toBeInTheDocument();
    expect(screen.getByText('Bea Roth')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toMatch(/^\/api\/doctors\/day\?from=.*&to=/);
    await waitFor(() => expect(screen.getByText('3 open questions')).toBeInTheDocument());
    expect(screen.getByText('New: 1 result out of range, 2 new documents')).toBeInTheDocument();
    expect(screen.getByText(/waiting for her approval/)).toBeInTheDocument();

    // The pending patient is not a link into a chart.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Anna Keller/ }));
    expect(screen.getByTestId('where').textContent).toBe('/doctor/patient/p1?tab=summary');
  });

  it('still shows the schedule when the day API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(
      <MemoryRouter>
        <DoctorDaySchedule appointments={appointments} patients={patients} now={NOW} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Anna Keller')).toBeInTheDocument();
    expect(screen.queryByText(/open question/)).toBeNull();
  });

  it('says so calmly on a day without visits', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ visits: [] }) }));
    render(
      <MemoryRouter>
        <DoctorDaySchedule appointments={[]} patients={patients} now={NOW} />
      </MemoryRouter>,
    );
    expect(screen.getByText('No visits today.')).toBeInTheDocument();
    expect(screen.getByText('No visits tomorrow.')).toBeInTheDocument();
  });
});
