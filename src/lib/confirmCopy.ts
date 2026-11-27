// Wording for the "are you sure?" dialogs on actions that end a visit or
// a doctor's access. One place, so Home and Visits never word the same
// action differently. Plain language: say what happens, name both choices.

import type { ConfirmOptions } from '@/components/ConfirmDialog';

export function cancelAppointmentConfirm(doctorLabel: string, when: string): ConfirmOptions {
  return {
    title: 'Cancel this appointment?',
    description: `${doctorLabel} · ${when}. Your doctor will see that you cancelled. If you change your mind, tap Undo on the message that appears next.`,
    confirmLabel: 'Cancel appointment',
    cancelLabel: 'Keep appointment',
    destructive: true,
  };
}

export function revokeAccessConfirm(doctorLabel: string): ConfirmOptions {
  return {
    title: `Stop sharing with ${doctorLabel}?`,
    description: `${doctorLabel} will no longer be able to open your records in Womanie. To share again later, give them a new code.`,
    confirmLabel: 'Revoke access',
    cancelLabel: 'Keep sharing',
    destructive: true,
  };
}

export function declineRequestConfirm(doctorLabel: string): ConfirmOptions {
  return {
    title: `Decline ${doctorLabel}'s request?`,
    description: `${doctorLabel} will not see your records. The request is removed.`,
    confirmLabel: 'Decline',
    cancelLabel: 'Go back',
    destructive: true,
  };
}

export function cancelCodeConfirm(code: string): ConfirmOptions {
  return {
    title: 'Cancel this code?',
    description: `Nobody will be able to use ${code} to ask for your records. A doctor already connected keeps their access.`,
    confirmLabel: 'Cancel code',
    cancelLabel: 'Keep code',
    destructive: true,
  };
}
