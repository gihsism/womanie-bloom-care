import { describe, it, expect } from 'vitest';
import { privacyConsentStatus } from './consent-status';

describe('privacyConsentStatus', () => {
  it('no rows: required, reason new (Google sign-up or account from before the log)', () => {
    expect(privacyConsentStatus([], '2026-11-26')).toEqual({ required: true, reason: 'new' });
  });

  it('a row for the current version: not required', () => {
    expect(privacyConsentStatus([{ version: '2026-01-01' }, { version: '2026-11-26' }], '2026-11-26')).toEqual({ required: false, reason: null });
  });

  it('version bump: rows only for older versions -> required again, reason updated', () => {
    expect(privacyConsentStatus([{ version: '2026-11-26' }], '2027-02-01')).toEqual({ required: true, reason: 'updated' });
  });

  it('ignores malformed rows', () => {
    expect(privacyConsentStatus([{ version: null }, {}], 'v1')).toEqual({ required: true, reason: 'new' });
  });

  it('no published policy: nothing to accept', () => {
    expect(privacyConsentStatus([], undefined)).toEqual({ required: false, reason: null });
  });
});
