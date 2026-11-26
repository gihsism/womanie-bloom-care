// Doctor setup checklist (doctor home, until complete). Pure: the
// dashboard loads the doctor's own rows through /api/db (owner-scoped) and
// this decides which steps are done. A doctor shows up in Find a Doctor
// only when her licence is approved AND "Accept new bookings" is on, and a
// patient can only pick a time inside her opening hours, so those three are
// "must"; the profile steps make the directory card worth clicking.

export interface SetupProfile {
  avatar_url?: string | null;
  specialty?: string | null;
  specialties?: string[] | null;
  languages?: string[] | null;
  verification_status?: string | null;
  is_verified?: boolean | null;
  // Present only once migration 017 is applied (select * returns it).
  practice_address?: string | null;
}

export interface SetupSettings {
  is_available?: boolean | null;
  consultation_price?: number | null;
  video_enabled?: boolean | null;
}

export interface SetupScheduleRow {
  is_active?: boolean | null;
  start_time?: string | null;
  end_time?: string | null;
}

export type SetupStepId = 'photo' | 'specialty' | 'languages' | 'address' | 'price' | 'hours' | 'bookings' | 'licence';

export interface SetupStep {
  id: SetupStepId;
  label: string;
  hint: string;
  done: boolean;
  /** Required for patients to be able to book you. */
  required: boolean;
  /** Element id in Profile & settings to jump to; null = nothing to do. */
  anchor: string | null;
}

const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const nonEmptyList = (v: unknown) => Array.isArray(v) && v.some(filled);

export function licenceText(status: string | null | undefined): string {
  switch (status) {
    case 'approved': return 'Your licence is verified.';
    case 'rejected': return 'We could not verify your licence. Email support@womanie.info with updated details.';
    case 'revoked': return 'Your verification was withdrawn, so patients cannot find you. Email support@womanie.info.';
    default: return 'We are checking your licence (usually 1 to 3 working days). Nothing to do: you can finish the steps above meanwhile, and patients can find you once it is approved.';
  }
}

export function computeSetupSteps(
  profile: SetupProfile | null | undefined,
  settings: SetupSettings | null | undefined,
  schedule: SetupScheduleRow[] | null | undefined,
): SetupStep[] {
  const p = profile ?? {};
  const approved = p.verification_status === 'approved' || (p.verification_status == null && p.is_verified === true);
  const hasHours = (schedule ?? []).some(s => s.is_active !== false && filled(s.start_time) && filled(s.end_time));
  const steps: SetupStep[] = [
    { id: 'photo', label: 'Profile photo', hint: 'Patients choose faster when they can see you.', done: filled(p.avatar_url), required: false, anchor: 'setup-photo' },
    { id: 'specialty', label: 'Specialty', hint: 'Shown next to your name; patients filter by it.', done: filled(p.specialty) || nonEmptyList(p.specialties), required: false, anchor: 'setup-specialty' },
    { id: 'languages', label: 'Languages you consult in', hint: 'Patients search by language.', done: nonEmptyList(p.languages), required: false, anchor: 'setup-languages' },
  ];
  // Only once the column exists (migration 017); otherwise the step could
  // never be completed.
  if (Object.prototype.hasOwnProperty.call(p, 'practice_address')) {
    steps.push({ id: 'address', label: 'Practice address', hint: 'Where in-person visits take place.', done: filled(p.practice_address), required: false, anchor: 'setup-address' });
  }
  steps.push(
    { id: 'price', label: 'Visit types and price', hint: 'Price, visit length, and whether you offer video visits. Save once to confirm.', done: !!settings && typeof settings.consultation_price === 'number', required: false, anchor: 'setup-price' },
    { id: 'hours', label: 'Opening hours', hint: 'Patients can only pick a time inside these hours (Swiss time).', done: hasHours, required: true, anchor: 'setup-hours' },
    { id: 'bookings', label: 'Accept new bookings', hint: 'Off until you switch it on. While off, you are not listed in Find a Doctor.', done: settings?.is_available === true, required: true, anchor: 'setup-bookings' },
    { id: 'licence', label: 'Licence verified by Womanie', hint: licenceText(p.verification_status), done: approved, required: true, anchor: null },
  );
  return steps;
}

export function setupProgress(steps: SetupStep[]) {
  const done = steps.filter(s => s.done).length;
  return {
    done,
    total: steps.length,
    complete: done === steps.length,
    /** Patients can find and book you right now. */
    bookable: steps.filter(s => s.required).every(s => s.done),
  };
}
