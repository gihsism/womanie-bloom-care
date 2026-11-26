import { describe, it, expect } from 'vitest';
import { isGatedPath, shouldShowConsentGate } from './consentGate';

describe('consent gate', () => {
  it('covers the patient app when consent is required (Google new / existing / version bump)', () => {
    const u = { consentRequired: true };
    for (const p of ['/dashboard', '/dashboard/settings', '/dashboard/medical-history', '/welcome', '/onboarding/basic-info', '/health-statistics', '/community']) {
      expect(shouldShowConsentGate(u, p), p).toBe(true);
    }
  });

  it('never covers the policy itself, public pages, auth pages or the doctor portal', () => {
    const u = { consentRequired: true };
    for (const p of ['/', '/privacy', '/dashboard/privacy', '/about', '/auth/login', '/auth/signup', '/doctor/dashboard', '/doctor/patient/x']) {
      expect(shouldShowConsentGate(u, p), p).toBe(false);
    }
  });

  it('does not match look-alike paths', () => {
    expect(isGatedPath('/dashboardx')).toBe(false);
    expect(isGatedPath('/welcome-back')).toBe(false);
  });

  it('cannot be bypassed by case or percent-encoding (React Router matches those too)', () => {
    const u = { consentRequired: true };
    for (const p of ['/DASHBOARD/settings', '/Dashboard', '/dashboar%64/settings', '/dashboard/', '/Welcome', '/ONBOARDING/life-stage', '/dashboard%2Fsettings/x']) {
      expect(shouldShowConsentGate(u, p), p).toBe(true);
    }
    // ...while the policy stays open in any spelling.
    expect(shouldShowConsentGate(u, '/Dashboard/Privacy')).toBe(false);
    expect(shouldShowConsentGate(u, '/dashboard/privac%79')).toBe(false);
    expect(isGatedPath('/%E0%A4%A')).toBe(false); // malformed escape: no throw
  });

  it('stays out of the way once accepted, or when logged out', () => {
    expect(shouldShowConsentGate({ consentRequired: false }, '/dashboard')).toBe(false);
    expect(shouldShowConsentGate({}, '/dashboard')).toBe(false);
    expect(shouldShowConsentGate(null, '/dashboard')).toBe(false);
  });
});
