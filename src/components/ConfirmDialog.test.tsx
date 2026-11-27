import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { useConfirm } from './ConfirmDialog';
import {
  cancelAppointmentConfirm,
  revokeAccessConfirm,
  declineRequestConfirm,
  cancelCodeConfirm,
} from '@/lib/confirmCopy';

function Harness({ onResult }: { onResult: (ok: boolean) => void }) {
  const [confirm, dialog] = useConfirm();
  return (
    <>
      <button onClick={async () => onResult(await confirm(cancelAppointmentConfirm('Dr. Muster', '3 Dec 2026, 09:00')))}>
        Cancel visit
      </button>
      {dialog}
    </>
  );
}

describe('useConfirm', () => {
  it('names both choices and resolves true only on the confirm button', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByText('Cancel visit'));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Cancel this appointment?')).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Muster · 3 Dec 2026, 09:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('resolves false when she keeps the appointment', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByText('Cancel visit'));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep appointment' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(onResult).not.toHaveBeenCalledWith(true);
  });

  it('resolves false on Escape', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByText('Cancel visit'));
    const dlg = await screen.findByRole('alertdialog');
    fireEvent.keyDown(dlg, { key: 'Escape' });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});

describe('confirm wording', () => {
  it('every ending action is destructive and offers a way back', () => {
    for (const o of [
      cancelAppointmentConfirm('Dr. A', 'today'),
      revokeAccessConfirm('Dr. A'),
      declineRequestConfirm('Dr. A'),
      cancelCodeConfirm('ABCD1234'),
    ]) {
      expect(o.destructive).toBe(true);
      expect(o.cancelLabel).toBeTruthy();
      expect(o.confirmLabel).not.toBe(o.cancelLabel);
    }
    expect(revokeAccessConfirm('Dr. A').title).toContain('Dr. A');
    expect(String(cancelCodeConfirm('ABCD1234').description)).toContain('ABCD1234');
  });
});

describe('no browser confirm left on cancel / revoke / decline', () => {
  const files = [
    'src/components/dashboard/UpcomingAppointments.tsx',
    'src/pages/dashboard/Appointments.tsx',
    'src/components/dashboard/ConnectedDoctors.tsx',
    'src/components/dashboard/PendingConnections.tsx',
    'src/components/dashboard/ShareWithDoctor.tsx',
  ];
  it.each(files)('%s uses the in-app dialog', f => {
    const src = readFileSync(f, 'utf8');
    expect(src).not.toMatch(/window\.confirm/);
    expect(src).toMatch(/useConfirm\(\)/);
    expect(src).toMatch(/\{confirmDialog\}/);
  });
});
