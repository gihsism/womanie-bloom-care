# Handoff notes

Items the autonomous arc surfaced but chose not to ship without
product/owner judgment.

## 2026-05-19

### Newsletter subscribe form (Footer) is a no-op

`src/components/Footer.tsx:13-21` — handleSubscribe validates the
email, fires a "Subscribed!" toast, and clears the input. Nothing
gets sent anywhere. The marketing page is implicitly promising a
newsletter sign-up that doesn't exist.

Three options:

1. **Remove the form.** Replace with a `mailto:` link or "Follow
   on social" callout. Honest, no infra needed.
2. **Wire it.** New `newsletter_subscribers(id, email, subscribed_at,
   unsubscribe_token)` table + `/api/newsletter/subscribe` endpoint
   that inserts + sends a double-opt-in email. Schema + email
   delivery infra needed.
3. **Punt to a third-party.** Hosted form (Mailchimp / Buttondown
   / ConvertKit) — change the `<form>` action and the fake handler
   goes away. Paid integration but no schema work here.

Default if nothing else: option 1 (remove). It's the only one that
doesn't promise more than we deliver.

### Marketing-claim review on `<TrustSecurity>`

`src/components/TrustSecurity.tsx` claims:
- "HIPAA Compliant"
- "All health content is reviewed by board-certified physicians and
  specialists."

Both are legally significant claims. Confirm with counsel before
they ride on the public-facing landing page. If either is aspiration
rather than fact, the language should be softened.

### Patient appointment reschedule

Patients can cancel + rebook today. There's no single-step reschedule.
Worth a `/api/appointments/reschedule` endpoint that validates the new
slot against the doctor's schedule + busy-slots before updating
`scheduled_at`. About an hour to ship. Deferred so this arc could stay
in small, atomic commits.

## 2026-05-23

### HEIC / HEIF photo upload

iPhone defaults to HEIC. Claude vision only reads JPEG / PNG / GIF /
WebP, so we reject HEIC at upload (DocumentUpload, 755f81e) with a
"change Settings → Camera → Formats" hint. That works but it's a
weird thing to make the patient do.

Real fix: HEIC decoder inside api/analyze-document.ts. Options:
1. `heic-convert` (pure JS, ~1.5 MB pulled into the bundle, slow).
2. `sharp` with the HEIF system library — fast but Vercel functions
   don't include libheif by default; needs a custom runtime image.
3. Vercel Image Optimization API (paid, transforms on the fly).

For now, the user-facing message is honest. Worth doing once HEIC
share is non-trivial in upload telemetry.

### Auto-create pending doctor-patient connection on booking

When a patient books with a doctor through FindDoctor, no connection
row is created. The doctor sees the appointment but can't open
PatientDetails (consent-gated). Currently the patient has to
separately send an access code.

Right call is to auto-insert a pending connection on booking so the
patient sees an approval request in PendingConnections. Approving
unlocks the chart in time for the visit. Skipped — needs Alena's
read on whether booking implies consent to share full history.

### Access audit log

There's no record of when a doctor opens a patient's chart. For
GDPR-friendly transparency, a small `access_log(id, doctor_id,
patient_id, viewed_at, surface)` table that the patient can review
from Settings would be a good addition. Schema change, so HANDOFF.
