// Current versions of the documents a user accepts, recorded in
// consent_log (migration 024) by /api/auth/signup and /api/me/consents.
//
// BUMP the version whenever the text she accepts changes. For the privacy
// policy that text is the SECTIONS block of src/pages/dashboard/Privacy.tsx;
// api/_lib/policy-versions.test.ts hashes that block and fails when the
// text changed but `sha256` (and normally `version`) was not updated, so
// a silent edit can't leave old acceptances pointing at new wording.
//
// terms: there is no Terms of Service text yet (/dashboard/terms redirects
// to /about), so there is nothing to accept or version. Add an entry here
// once the founder publishes terms; the consent log already accepts it.

export type ConsentDocument = 'privacy_policy' | 'terms';

export interface PolicyVersion {
  version: string;
  /** SHA-256 of the accepted text block (see the test). */
  sha256: string;
  /** Where the text is shown. */
  url: string;
}

export const POLICY_VERSIONS: Partial<Record<ConsentDocument, PolicyVersion>> = {
  privacy_policy: {
    version: '2026-11-26',
    sha256: '5fc8aa4cc990125128eb69b0ea530af42d0848fbe6b71d91740fa3b175cf8f0d',
    url: '/privacy',
  },
};

export function isConsentDocument(v: unknown): v is ConsentDocument {
  return v === 'privacy_policy' || v === 'terms';
}
