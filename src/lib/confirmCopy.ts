// Wording for the "are you sure?" dialogs on actions that end a visit or
// a doctor's access. One place, so Home and Visits never word the same
// action differently. Plain language: say what happens, name both choices.

import type { ConfirmOptions } from '@/components/ConfirmDialog';

export function cancelAppointmentConfirm(doctorLabel: string, when: string): ConfirmOptions {
  return {
    title: 'Cancel this visit?',
    description: `${doctorLabel} · ${when}. Your doctor will see that you cancelled. If you change your mind, tap Undo on the message that appears next.`,
    confirmLabel: 'Cancel visit',
    cancelLabel: 'Keep visit',
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

// ── Removing things she made or logged ──────────────────────────────
// The wording the old browser prompts used, now with both choices named.

export function stopMedicineConfirm(name: string): ConfirmOptions {
  return {
    title: `Stop tracking ${name}?`,
    description: 'Past doses stay in your history.',
    confirmLabel: 'Stop tracking',
    cancelLabel: 'Keep tracking',
    destructive: true,
  };
}

export function deleteDocumentConfirm(name: string): ConfirmOptions {
  return {
    title: `Delete "${name}"?`,
    description: 'The file and its results are removed from your records. This cannot be undone.',
    confirmLabel: 'Delete document',
    cancelLabel: 'Keep document',
    destructive: true,
  };
}

export function deleteChatConfirm(title: string): ConfirmOptions {
  return {
    title: `Delete the chat "${title}"?`,
    description: 'This cannot be undone.',
    confirmLabel: 'Delete chat',
    cancelLabel: 'Keep chat',
    destructive: true,
  };
}

export function deleteAllChatsConfirm(): ConfirmOptions {
  return {
    title: 'Delete all your past chats?',
    description: 'This cannot be undone.',
    confirmLabel: 'Delete all chats',
    cancelLabel: 'Keep chats',
    destructive: true,
  };
}

export const DELETE_ACCOUNT_PHRASE = 'DELETE MY ACCOUNT';

export function deleteAccountConfirm(): ConfirmOptions {
  return {
    title: 'Erase your account?',
    description: 'This will permanently erase everything Womanie has on you: documents, analyses, cycle logs, chats. This cannot be undone.',
    confirmLabel: 'Erase account',
    cancelLabel: 'Keep my account',
    destructive: true,
    requireText: DELETE_ACCOUNT_PHRASE,
  };
}

export function unshareVisitListConfirm(): ConfirmOptions {
  return {
    title: 'Remove this list from your visit?',
    description: 'Your doctor will no longer see it.',
    confirmLabel: 'Remove list',
    cancelLabel: 'Keep it shared',
    destructive: true,
  };
}

export function discardKickSessionConfirm(): ConfirmOptions {
  return {
    title: 'Discard this kick-count session?',
    description: 'The kicks counted so far are not saved.',
    confirmLabel: 'Discard session',
    cancelLabel: 'Keep counting',
    destructive: true,
  };
}

export function discardContractionConfirm(): ConfirmOptions {
  return {
    title: 'Discard this contraction?',
    description: 'The one you are timing now is not saved.',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep timing',
    destructive: true,
  };
}

export function clearContractionsConfirm(): ConfirmOptions {
  return {
    title: 'Clear all contraction history?',
    description: 'Every timed contraction is removed. This cannot be undone.',
    confirmLabel: 'Clear history',
    cancelLabel: 'Keep history',
    destructive: true,
  };
}

export function untickBagConfirm(): ConfirmOptions {
  return {
    title: 'Untick all packed items?',
    description: 'Your list stays; only the ticks are cleared.',
    confirmLabel: 'Untick all',
    cancelLabel: 'Go back',
    destructive: true,
  };
}

export function deleteNoteConfirm(): ConfirmOptions {
  return {
    title: 'Delete this note?',
    description: 'This cannot be undone.',
    confirmLabel: 'Delete note',
    cancelLabel: 'Keep note',
    destructive: true,
  };
}

export function removeAvatarConfirm(): ConfirmOptions {
  return {
    title: 'Remove your profile photo?',
    description: 'Patients will see the default placeholder.',
    confirmLabel: 'Remove photo',
    cancelLabel: 'Keep photo',
    destructive: true,
  };
}
