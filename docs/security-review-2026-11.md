# Security review, November 2026 (round 5)

A defensive review of our own code: reading it, plus local unit tests and
the local end-to-end suite. Nothing was run against the live site, no one
logged in to live, and no doctor accounts or invites were created.

Scope: sign-in and sessions, cross-site requests and browser headers,
sharing records with doctors, and file uploads.

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | A doctor whose role the admin revoked could still open the Trends tab, the day list and the connected-patients list | Medium | Fixed |
| 2 | Share codes were stored exactly as the browser sent them (any length, any expiry, used code could be reset to unused) | Medium | Fixed |
| 3 | Successful sign-ins used up the per-email sign-in allowance | Low | Fixed |
| 4 | Response time showed whether an email has an account | Low | Fixed |
| 5 | A link or image on another site could sign a person out | Low | Fixed |
| 6 | Session cookie read with an unanchored pattern; token algorithm not pinned | Low (hardening) | Fixed |
| 7 | Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy missing | Low (hardening) | Fixed |
| 8 | A person can be locked out of password sign-in until midnight UTC by someone who knows her email | Low | Accepted, see below |
| 9 | HSTS without includeSubDomains / preload | Info | Recommendation |
| 10 | Sessions renew for as long as she keeps using the app (no absolute maximum) | Info | Recommendation |
| 11 | Password reset is by email to support | Info | Process note |

## What was fixed

### 1. Revoked doctors (Medium)

When the admin revokes a doctor (/api/admin/doctors), the doctor role is
deleted but her connection rows stay. The patient chart
(/api/doctors/patient), document access (/api/docs/file) and doctor uploads
already required the role. Three screens did not:

- /api/doctors/patient-trends: cycle and period lengths, symptoms, basal
  temperature, weight and blood pressure.
- /api/doctors/day: life stage, number of new documents and abnormal
  results, open questions.
- /api/doctors/connections: names and life stage of connected patients.

All three now require the doctor role as well as an approved connection.
Tests: `doctors/patient-trends.test.ts`, `doctors/day.test.ts`,
`doctors/connections.test.ts`.

### 2. Share codes (Medium)

The patient's share code is generated in the browser
(`ShareWithDoctor.tsx`: 8 characters from a read-aloud alphabet, 24 hours,
single use) and saved through the generic /api/db route. The server took
the row as sent, so a modified client could store a one-character code, a
code that never expires, or set a used code back to unused. A doctor
needs an approved connection anyway (redemption only creates a pending
request the patient must accept), so the impact was limited, but the code
is meant to be the first barrier.

/api/db now (`api/_lib/access-code.ts`):
- accepts only an 8-character code from the app's alphabet, unused, valid
  for at most 24 hours (10 minutes slack for a fast phone clock);
- refuses update and upsert on share codes (cancelling deletes, as the app
  already does);
- refuses a code that is currently live for anyone else, so a doctor's
  redemption can only match one patient.

Tests: `api/_routes/db.access-codes.test.ts`.

### 3 and 4. Sign-in limits and timing (Low)

The per-email limit (30 a day) was consumed by every attempt, successful
ones included. It is now read first and bumped only after a failure
(`peekLimit` in `api/_lib/ratelimit.ts`). The per-IP limit (100 a day) is
unchanged. An email with no account now runs the same bcrypt comparison as
a wrong password, so the answer takes as long either way.

Checked: the limiter cannot lock anyone out permanently. Windows are fixed
UTC days stored per (bucket, hashed subject, day); a new day starts a new
row, old rows are cleaned up, blocked attempts don't add to the count, and
if the counter table or Neon fails it falls back to a per-instance memory
limit instead of refusing sign-in. Google sign-in is never rate-limited by
this. Tests: `ratelimit.test.ts`, `auth/login.test.ts`.

### 5. Sign-out from another site (Low)

The app signs out by navigating to /api/auth/logout (a GET). Because the
session cookie is SameSite=Lax, a link or image on another site would also
carry it. Requests a browser marks `Sec-Fetch-Site: cross-site` are now
sent to the home page without touching the session. Test:
`auth/logout.test.ts`.

### 6. Session cookie hardening (Low)

- getAuthUser, /api/auth/me and /api/auth/logout read the cookie by its
  exact name (`x_womanie_session=` is ignored).
- Session tokens are verified with the algorithm pinned to HS256.

Test: `api/_lib/auth.test.ts`.

### 7. Headers (Low)

Added in vercel.json:
- `Cross-Origin-Opener-Policy: same-origin` on every path. Google sign-in
  is a full-page redirect and the app's own new tabs use `noopener`, so
  nothing relies on a cross-window reference.
- `Cross-Origin-Resource-Policy: same-origin` on /api.

Note: the local end-to-end suite runs `vite preview`, which does not apply
vercel.json headers. After deploy, open the app once, sign in with Google,
open a document and print a visit sheet to confirm nothing is blocked.

## Checked and found in order

Sign-in and sessions
- Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`, 30 days, on every
  place a session is issued (login, signup, Google callback, doctor
  signup, /me renewal) and cleared with the same flags.
- A new random session id on every sign-in (no session fixation). Every
  authenticated request checks the session row is still live, so logout,
  password change (revokes all other sessions) and account deletion take
  effect at once.
- Google sign-in: `state` in an HttpOnly cookie, constant-time compare,
  cleared after use. A Google sign-in to an account that had an
  unverified password drops that password and all its sessions.
- Doctor invites: 32 random bytes, only a SHA-256 hash stored, 7 days,
  single use enforced inside the signup transaction, revocable, one
  answer for unknown/used/revoked/expired, rate-limited per IP.
- Cron endpoint (/api/push/send-due): secret compared with
  `timingSafeEqual`, refuses to run without a secret of 16+ characters.
- There are no email-verification or password-reset tokens in the code
  (see 11).

Cross-site requests and CORS
- Every state-changing route is POST/DELETE with a JSON body; the
  SameSite=Lax cookie is not sent on cross-site POSTs. GET routes only
  read (the only writes on GET are access-log rows).
- `Access-Control-Allow-Origin: *` is set without
  `Access-Control-Allow-Credentials`, so browsers never send cookies on a
  cross-origin fetch and never expose an authenticated answer to another
  site. Narrowing it to our own origin would be tidier but changes nothing
  for security today.
- Existing headers: HSTS (2 years), nosniff, X-Frame-Options DENY,
  Referrer-Policy, Permissions-Policy (camera, microphone, geolocation,
  payment, usb off; the app uses none of them), and a CSP with no inline
  scripts except the one hashed in index.html (guarded by
  `vercel-headers.test.ts`). The CSP allows exactly the third parties in
  use: Google Fonts, Sentry ingest, Vercel Blob uploads.

Doctor sharing
- Every doctor read of patient data checks an approved connection (now
  also the role everywhere, see 1) and is written to chart_access_log.
- Only the patient can approve, reject or revoke a connection
  (/api/connections/respond binds patient_id to the session). Connections
  can't be written through /api/db.
- Share codes: 32^8 (about 10^12) possible values, 20 redemption attempts
  per doctor account per day, single use, atomic claim, and only doctor
  accounts can redeem.

File uploads
- Upload tokens only for a path inside the owner's folder (or a patient's
  folder when the doctor has an approved connection and the role); allowed
  types PDF, JPEG, PNG, WebP, HEIC/HEIF, DOCX; 200 MB cap; random suffix.
- The avatar PUT accepts only JPG/PNG/WebP up to 5 MB.
- The Blob URL is never returned to the browser after upload; files are
  served through /api/docs/file by document id with nosniff,
  Content-Disposition and no-store. Delete only within the owner's folder.
- No listing endpoint exists. Older blobs are public-with-random-name
  (unguessable, URL never exposed); setting BLOB_DOCUMENT_ACCESS=private
  makes new uploads private.

## Accepted and recommended

8. Targeted lockout. Someone who knows a person's email can use up the 30
   failed attempts and block password sign-in for her until midnight UTC.
   It never lasts longer, Google sign-in still works, and the alternative
   (a higher limit) makes password guessing easier. Accepted.

9. HSTS. Adding `includeSubDomains; preload` would protect first visits
   and subdomains, but every subdomain of womanie.info must serve HTTPS
   first and preload is hard to undo. Recommendation for the owner, not
   changed here.

10. Session lifetime. /api/auth/me pushes the 30 days out while she keeps
    using the app, so an active session never ends on its own. Fine for a
    phone app; an absolute cap (for example 180 days) could be added later.

11. Password reset is a "Forgot password?" email to support. Whoever
    handles it must confirm the request comes from the account's own email
    address before resetting anything.

Also noted, not changed: a revoked doctor can still read her own
appointment rows (times and patient ids, no health data) through /api/db.
