import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { POLICY_VERSIONS } from './policy-versions';
import { PRIVACY_POLICY_VERSION } from '../../src/lib/policyVersion';

describe('policy versions', () => {
  // The consent log records WHICH version she accepted. If the privacy text
  // changes without a version bump, old acceptances would silently point at
  // new wording. Fix: bump POLICY_VERSIONS.privacy_policy.version and paste
  // the new hash printed in the failure.
  it('privacy policy text matches the recorded version hash', () => {
    const src = readFileSync(new URL('../../src/pages/dashboard/Privacy.tsx', import.meta.url), 'utf8');
    const block = src.slice(src.indexOf('const SECTIONS'), src.indexOf('export default'));
    expect(block.length).toBeGreaterThan(500);
    const hash = createHash('sha256').update(block).digest('hex');
    expect(hash, 'Privacy.tsx text changed: bump the version in api/_lib/policy-versions.ts').toBe(POLICY_VERSIONS.privacy_policy!.sha256);
  });

  // The app sends its version with the sign-up form and the consent screen;
  // the server refuses any other version. A bump must change both, or every
  // sign-up would fail with policy_outdated.
  it('the app ships the same privacy-policy version as the server', () => {
    expect(PRIVACY_POLICY_VERSION, 'bump src/lib/policyVersion.ts together with api/_lib/policy-versions.ts').toBe(POLICY_VERSIONS.privacy_policy!.version);
  });
});
