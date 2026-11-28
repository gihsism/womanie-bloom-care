import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { useConfirm } from './ConfirmDialog';
import {
  cancelAppointmentConfirm,
  revokeAccessConfirm,
  declineRequestConfirm,
  cancelCodeConfirm,
  stopMedicineConfirm,
  deleteDocumentConfirm,
  deleteChatConfirm,
  deleteAllChatsConfirm,
  deleteAccountConfirm,
  unshareVisitListConfirm,
  discardKickSessionConfirm,
  discardContractionConfirm,
  clearContractionsConfirm,
  untickBagConfirm,
  deleteNoteConfirm,
  removeAvatarConfirm,
  DELETE_ACCOUNT_PHRASE,
} from '@/lib/confirmCopy';
import type { ConfirmOptions } from './ConfirmDialog';

function Harness({ onResult, opts }: { onResult: (ok: boolean) => void; opts?: ConfirmOptions }) {
  const [confirm, dialog] = useConfirm();
  return (
    <>
      <button onClick={async () => onResult(await confirm(opts ?? cancelAppointmentConfirm('Dr. Muster', '3 Dec 2026, 09:00')))}>
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

describe('type-to-confirm (erase account)', () => {
  it('keeps the confirm button off until the exact phrase is typed', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} opts={deleteAccountConfirm()} />);
    fireEvent.click(screen.getByText('Cancel visit'));
    const go = await screen.findByRole('button', { name: 'Erase account' });
    expect(go).toBeDisabled();
    const field = screen.getByLabelText(/type exactly/i);
    fireEvent.change(field, { target: { value: 'delete my account' } });
    expect(go).toBeDisabled();
    fireEvent.change(field, { target: { value: DELETE_ACCOUNT_PHRASE } });
    expect(go).toBeEnabled();
    fireEvent.click(go);
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('starts empty again the next time it opens', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} opts={deleteAccountConfirm()} />);
    fireEvent.click(screen.getByText('Cancel visit'));
    fireEvent.change(await screen.findByLabelText(/type exactly/i), { target: { value: DELETE_ACCOUNT_PHRASE } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    fireEvent.click(screen.getByText('Cancel visit'));
    expect(await screen.findByLabelText(/type exactly/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Erase account' })).toBeDisabled();
  });
});

describe('confirm wording', () => {
  it('every remove / discard action is destructive, names both choices, and names the thing', () => {
    const all = [
      stopMedicineConfirm('Iron'), deleteDocumentConfirm('Blood test.pdf'), deleteChatConfirm('Is my TSH normal?'),
      deleteAllChatsConfirm(), deleteAccountConfirm(), unshareVisitListConfirm(), discardKickSessionConfirm(),
      discardContractionConfirm(), clearContractionsConfirm(), untickBagConfirm(), deleteNoteConfirm(), removeAvatarConfirm(),
    ];
    for (const o of all) {
      expect(o.destructive).toBe(true);
      expect(o.title).toMatch(/\?$/);
      expect(o.cancelLabel).toBeTruthy();
      expect(o.confirmLabel).not.toBe(o.cancelLabel);
    }
    expect(stopMedicineConfirm('Iron').title).toContain('Iron');
    expect(deleteDocumentConfirm('Blood test.pdf').title).toContain('Blood test.pdf');
    expect(deleteChatConfirm('Is my TSH normal?').title).toContain('Is my TSH normal?');
    expect(deleteAccountConfirm().requireText).toBe('DELETE MY ACCOUNT');
  });

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

describe('no browser confirm left on any action', () => {
  const files = [
    'src/components/dashboard/MedicineLog.tsx',
    'src/pages/MedicalHistory.tsx',
    'src/pages/AIDoctorChat.tsx',
    'src/pages/dashboard/Settings.tsx',
    'src/components/dashboard/VisitPrepCard.tsx',
    'src/components/dashboard/KickCounter.tsx',
    'src/components/dashboard/ContractionTimer.tsx',
    'src/components/dashboard/HospitalBagChecklist.tsx',
    'src/components/doctor/patient/PatientNotes.tsx',
    'src/components/doctor/DoctorProfileEditor.tsx',
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

  it('no source file calls the browser confirm()', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
          && /(window\.|[^.\w])confirm\(\s*[`'"]/.test(readFileSync(p, 'utf8'))) offenders.push(p);
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});
