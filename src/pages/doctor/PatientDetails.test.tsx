import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'doc1' } }) }));
vi.mock('@/hooks/useRequireRole', () => ({ useRequireRole: () => ({ loading: false }) }));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/db/client', () => ({ db: { from: vi.fn() } }));

import PatientDetails from './PatientDetails';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/doctor/patient/:patientId" element={<PatientDetails />} />
      </Routes>
    </MemoryRouter>,
  );
}

const chart = {
  profile: { id: 'p1', full_name: 'Anna Muster', life_stage: 'conception', pregnancy_due_date: null, ivf_phase: null },
  healthSignals: [],
  documents: [],
  medicalData: [
    { id: 'm1', document_id: 'd1', title: 'TSH', value: 6.1, unit: 'mU/L', reference_range: '0.4-4', status: 'high', data_type: null, date_recorded: '2026-10-01', notes: null, raw_data: null },
  ],
  notes: [],
  appointments: [],
  periodRecords: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('PatientDetails', () => {
  it('shows no chart data when the server refuses access (no approved connection)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 403, ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    renderAt('/doctor/patient/p1');
    expect(await screen.findByText(/don't have access to this chart/i)).toBeTruthy();
    expect(screen.queryByText('Anna Muster')).toBeNull();
    expect(screen.queryByText(/Write a note/)).toBeNull();
  });

  it('opens with a one-screen summary and plain stage name', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => chart }) as unknown as typeof fetch;
    renderAt('/doctor/patient/p1');
    expect(await screen.findByText('Anna Muster')).toBeTruthy();
    // Plain stage name in the header and again in the "Before the visit" brief.
    expect(screen.getAllByText(/Trying to conceive/).length).toBe(2);
    expect(screen.getByText('Before the visit')).toBeTruthy();
    expect(screen.getByText('1 result out of range')).toBeTruthy();
  });

  it('"Write a note" opens the note form from the Summary tab (regression)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => chart }) as unknown as typeof fetch;
    renderAt('/doctor/patient/p1');
    fireEvent.click(await screen.findByRole('button', { name: /Write a note/ }));
    await waitFor(() => expect(screen.getByText('New note')).toBeTruthy());
    expect(screen.getByLabelText('Title')).toBeTruthy();
  });

  it('?addNote=visit pre-fills the title', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => chart }) as unknown as typeof fetch;
    renderAt('/doctor/patient/p1?addNote=visit&date=2026-11-20');
    const title = (await screen.findByLabelText('Title')) as HTMLInputElement;
    expect(title.value).toMatch(/^Visit on /);
  });

  it('shows the patient stage as a chip in her stage colour, on a clinic-coloured page', async () => {
    document.documentElement.setAttribute('data-stage', 'pregnancy');
    global.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => chart }) as unknown as typeof fetch;
    const { unmount } = renderAt('/doctor/patient/p1');
    const chip = await screen.findByTestId('patient-stage-chip');
    expect(chip.textContent).toBe('Trying to conceive');
    expect(chip.getAttribute('data-stage')).toBe('conception');
    expect(document.documentElement.getAttribute('data-stage')).toBe('clinic');
    unmount();
    expect(document.documentElement.getAttribute('data-stage')).toBe('pregnancy');
  });

  it('an unknown stage is plain text, not a coloured chip', async () => {
    const odd = { ...chart, profile: { ...chart.profile, life_stage: 'research study' } };
    global.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => odd }) as unknown as typeof fetch;
    renderAt('/doctor/patient/p1');
    // The header line (the visit brief below repeats it).
    expect((await screen.findAllByText('Research study')).some(el => el.classList.contains('page-sub'))).toBe(true);
    expect(screen.queryByTestId('patient-stage-chip')).toBeNull();
  });

  it('with the new-note form open on Notes, "Write a note" steps aside for Save note', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => chart }) as unknown as typeof fetch;
    renderAt('/doctor/patient/p1');
    fireEvent.click(await screen.findByRole('button', { name: /Write a note/ }));
    await waitFor(() => expect(screen.getByText('New note')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Write a note/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save note' })).toBeTruthy();
  });
});
