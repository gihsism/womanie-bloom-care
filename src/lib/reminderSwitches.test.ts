import { describe, it, expect } from 'vitest';
import { DEFAULT_PREFS } from '../../api/_lib/push-schedule';
import { DEFAULT_PUSH_PREFS } from './push';
import { IN_APP_SWITCHES, PHONE_SWITCHES, REMINDER_OVERVIEW } from './reminderSwitches';

describe('Settings: which switch does what', () => {
  const patientPhoneKeys = Object.keys(DEFAULT_PREFS).filter(k => k !== 'bookings').sort();

  it('every phone reminder the server sends to a patient has exactly one switch', () => {
    expect(PHONE_SWITCHES.map(s => s.key).sort()).toEqual(patientPhoneKeys);
    expect(Object.keys(DEFAULT_PUSH_PREFS).sort()).toEqual(Object.keys(DEFAULT_PREFS).sort());
  });

  it('the overview lists every reminder type once, with its phone switch', () => {
    expect(REMINDER_OVERVIEW.map(r => r.phone).sort()).toEqual(patientPhoneKeys);
  });

  it('each in-app switch appears in the overview and says the phone has its own switch', () => {
    for (const [key, s] of Object.entries(IN_APP_SWITCHES)) {
      expect(REMINDER_OVERVIEW.filter(r => r.inAppSwitch === key)).toHaveLength(1);
      expect(s.hint).toMatch(/Phone pushes follow/);
      expect(s.label).toMatch(/in the app/);
    }
  });

  it('the phone pill switch never promises a lock screen that names the pill', () => {
    expect(PHONE_SWITCHES.find(s => s.key === 'pill')?.hint).toContain('"Daily reminder"');
  });
});
