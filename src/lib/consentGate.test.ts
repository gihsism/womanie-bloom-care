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

  it('stays out of the way once accepted, or when logged out', () => {
    expect(shouldShowConsentGate({ consentRequired: false }, '/dashboard')).toBe(false);
    expect(shouldShowConsentGate({}, '/dashboard')).toBe(false);
    expect(shouldShowConsentGate(null, '/dashboard')).toBe(false);
  });
});
