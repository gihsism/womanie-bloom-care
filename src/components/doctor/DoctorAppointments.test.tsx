import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const update = vi.fn();
const eq = vi.fn();
vi.mock('@/integrations/db/client', () => ({
  db: { from: () => ({ update: (row: unknown) => { update(row); return { eq: (...a: unknown[]) => { eq(...a); return Promise.resolve({ error: null }); } }; } }) },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import AppointmentsView from './DoctorAppointments';

const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
const apt = { id: 'apt1', patient_id: 'p1', scheduled_at: future, status: 'scheduled', consultation_type: 'video', duration: 30 };
const patients = [{ id: 'c1', patient_id: 'p1', status: 'approved', created_at: '2026-01-01T00:00:00Z', connection_type: 'code', patient_full_name: 'Anna' }];

describe('Doctor cancel visit dialog', () => {
  beforeEach(() => { update.mockReset(); eq.mockReset(); });

  it('asks for a reason in a dialog (no browser prompt) and saves it for the patient', async () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    const onChange = vi.fn();
    render(<MemoryRouter><AppointmentsView appointments={[apt]} patients={patients} onChange={onChange} /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel visit' }));
    expect(promptSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const submit = screen.getAllByRole('button', { name: 'Cancel visit' }).find(b => b.getAttribute('type') === 'submit')!;
    expect(submit).toBeDisabled(); // a reason is required

    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: '  I am unwell today  ' } });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith({ status: 'cancelled', notes: 'Cancelled by doctor: I am unwell today' });
    expect(eq).toHaveBeenCalledWith('id', 'apt1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"Keep visit" closes the dialog without changing anything', () => {
    render(<MemoryRouter><AppointmentsView appointments={[apt]} patients={patients} onChange={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel visit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep visit' }));
    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers "Open chart" only for a patient who approved; a pending one says when it opens', () => {
    const pending = [{ ...patients[0], status: 'pending' }];
    const { rerender } = render(<MemoryRouter><AppointmentsView appointments={[apt]} patients={patients} onChange={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Open chart' })).toBeInTheDocument();
    rerender(<MemoryRouter><AppointmentsView appointments={[apt]} patients={pending} onChange={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Open chart' })).toBeNull();
    expect(screen.getByText('Chart opens once she approves')).toBeInTheDocument();
  });
});
