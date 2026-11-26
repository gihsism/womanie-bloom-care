// Whether she has to (re)accept the privacy policy before using the app.
//
// Used by /api/auth/me, which tells the client to show the one-time
// consent screen (src/components/ConsentGate.tsx). Pure so it can be
// tested without a database.
//
//   rows: her consent_log rows for 'privacy_policy' (any order)
//   currentVersion: POLICY_VERSIONS.privacy_policy.version
//
// required = no row for the CURRENT version. reason tells the screen
// which explanation to show: 'new' (she never accepted any version: a
// Google sign-up, or an account from before the consent log) or
// 'updated' (she accepted an older version and the policy changed since,
// i.e. the version constant was bumped).

export type ConsentReason = 'new' | 'updated';

export interface ConsentStatus {
  required: boolean;
  reason: ConsentReason | null;
}

export function privacyConsentStatus(
  rows: Array<{ version?: unknown }>,
  currentVersion: string | null | undefined,
): ConsentStatus {
  // No published policy -> nothing to accept.
  if (!currentVersion) return { required: false, reason: null };
  const versions = rows
    .map(r => (typeof r.version === 'string' ? r.version : null))
    .filter((v): v is string => v !== null);
  if (versions.includes(currentVersion)) return { required: false, reason: null };
  return { required: true, reason: versions.length > 0 ? 'updated' : 'new' };
}
