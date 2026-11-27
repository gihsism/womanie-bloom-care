import type { PushPrefs } from './push';

// Me -> Reminders: which switch controls which reminder (one list, so the
// Settings page, the phone card and the tests read the same names).
//
// Two kinds of switch, never overlapping:
// - In the app (Settings, saved in her account, so the same on all her
//   devices): only whether a row or note shows inside Womanie.
// - Phone notifications (per device, saved with that device's
//   subscription): only whether that device gets a push.
// Reminders without an in-app switch always show in the app when due.

export type InAppPref = 'cycleReminders' | 'appointmentReminders';
export type PhonePref = Exclude<keyof PushPrefs, 'bookings'>;

export const IN_APP_SWITCHES: Record<InAppPref, { label: string; hint: string }> = {
  cycleReminders: {
    label: 'Period notes in the app',
    hint: 'Home\'s "Period likely tomorrow" and "Period late?" rows and notes, and the late-period note on the cycle calendar. Phone pushes follow the Period switch under Phone notifications.',
  },
  appointmentReminders: {
    label: 'Visit rows in the app',
    hint: 'Home\'s "Visit today" and "Visit on ..." rows. Phone pushes follow the Visits switch under Phone notifications.',
  },
};

// bookings is the doctor-side switch (Profile & settings in the doctor app).
export const PHONE_SWITCHES: Array<{ key: PhonePref; label: string; hint: string }> = [
  { key: 'medicine', label: 'Medicine times', hint: 'At the times you set on each medicine, unless you already logged the dose, and 3 days before a pack or course runs out' },
  { key: 'pill', label: 'Pill time', hint: 'At the pill time you set on the contraception card (21:00 unless you changed it), unless today\'s pill is already ticked; not in the pill-free week. The lock screen only says "Daily reminder"' },
  { key: 'period', label: 'Period', hint: 'The day before your period is expected, and if it is a few days late' },
  { key: 'appointment', label: 'Visits', hint: 'The day before a visit' },
  { key: 'checkups', label: 'Vaccinations and check-ups', hint: 'Vaccinations recommended in pregnancy, your baby\'s vaccination ages, and your 6-week check after the birth, when the app would show them on Home' },
  { key: 'documents', label: 'Documents from your doctor', hint: 'When a connected doctor adds a document to your Records (the name of the document is never shown)' },
  { key: 'ivf_trigger', label: 'IVF trigger shot', hint: 'About 1 hour and 10 minutes before the trigger time you entered, also at night. Off unless you switch it on; the lock screen only says "timed injection"' },
];

export interface ReminderRow {
  what: string;
  /** What shows inside the app; inAppSwitch names the Settings switch, if any. */
  inApp: string;
  inAppSwitch?: InAppPref;
  phone: PhonePref;
}

export const REMINDER_OVERVIEW: ReminderRow[] = [
  { what: 'Medicines', inApp: 'Due doses and packs running out on Home, always shown', phone: 'medicine' },
  { what: 'Contraceptive pill', inApp: '"Today\'s pill not ticked yet" on Home, always shown', phone: 'pill' },
  { what: 'Period due or late', inApp: 'Home rows and notes', inAppSwitch: 'cycleReminders', phone: 'period' },
  { what: 'Visits', inApp: 'Visit today and this week on Home', inAppSwitch: 'appointmentReminders', phone: 'appointment' },
  { what: 'Vaccinations and check-ups', inApp: 'On Home when due, always shown', phone: 'checkups' },
  { what: 'Documents from your doctor', inApp: 'Listed in Records, always shown', phone: 'documents' },
  { what: 'IVF trigger shot', inApp: 'Countdown on your IVF page, always shown', phone: 'ivf_trigger' },
];

export const phoneLabel = (key: PhonePref) => PHONE_SWITCHES.find(s => s.key === key)?.label ?? key;
