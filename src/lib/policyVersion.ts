// The privacy-policy version the app shows and asks her to accept.
//
// MUST equal POLICY_VERSIONS.privacy_policy.version in
// api/_lib/policy-versions.ts (the server's source of truth); a test there
// fails when the two drift. The client sends it with the sign-up form and
// the consent screen, and the server refuses an acceptance of any other
// version, so an out-of-date app can never record agreement to wording
// she was not shown.
export const PRIVACY_POLICY_VERSION = '2026-11-26';
