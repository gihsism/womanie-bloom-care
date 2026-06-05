# Handoff notes — async decision queue for Alena

**Status: NOT blocking.** The autonomous arc keeps running on other work
regardless of this file. These are items I deliberately did NOT ship
because they need an owner/product/legal call, not engineering judgment.
Answer any of them whenever — no rush, nothing is stuck. Ordered by
priority.

---

## 1. ⚠️ Public site claims physician review that isn't happening (PRIORITY)

`src/components/TrustSecurity.tsx` shows two legally-significant claims on
the public landing page:
- **"All health content is reviewed by board-certified physicians and
  specialists."** — This is currently **not true**. No clinician has
  reviewed the clinical content (vaccine windows, PMDD framing, AMH
  thresholds, etc.). Leaving a false medical-review claim live is an
  honesty + liability risk.
- **"HIPAA Compliant"** — a compliance claim I can't verify.

What I need: tell me to either (a) soften the copy to what's true today
(e.g. "guided by ACOG / CDC / Mayo Clinic references" instead of
"reviewed by physicians"), or (b) confirm a real physician review is in
place / planned and leave it. I won't rewrite public legal copy without
your say-so. `HIPAA Compliant` stays untouched until you confirm.

## 2. Newsletter subscribe form is a no-op

`src/components/Footer.tsx` — the footer "Stay Informed" form validates
the email, fires a "Subscribed!" toast, and clears the field. Nothing is
stored or sent. So the page promises a newsletter that doesn't exist.
Options: (1) remove the form / swap for a social-follow callout; (2) wire
it for real — single-opt-in capture into a `newsletter_subscribers`
table is cheap and needs no email infra (a confirmation email would);
(3) hand off to Mailchimp/Buttondown (paid). Tell me which and I'll ship
it — I didn't pick for you since it's a product call.

## 3. Patient appointment reschedule (one-step)

Patients can cancel + rebook, but there's no single-step reschedule.
A `/api/appointments/reschedule` endpoint validating the new slot against
the doctor's availability is ~1h of work and needs no product judgment —
I can just build it if you want it; flagging only so it's a deliberate
yes.

## 4. HEIC / HEIF photo upload

iPhones default to HEIC; Claude vision only reads JPEG/PNG/GIF/WebP, so
we reject HEIC at upload with a "change your camera format" hint. Real
fix is a decoder in `api/analyze-document.ts`: (1) `heic-convert` (pure
JS, ~1.5 MB, slow); (2) `sharp` + libheif (needs a custom Vercel
runtime); (3) Vercel Image Optimization (paid). Needs your pick on the
infra/cost trade-off.

## 5. Auto-create pending doctor↔patient connection on booking

When a patient books via FindDoctor, no connection row is created, so the
doctor can't open the (consent-gated) chart without the patient sending a
separate access code. Auto-inserting a *pending* connection on booking
would smooth this — but it needs your read on whether booking implies
consent to share full history.

## 6. Doctor chart-access audit log

No record of when a doctor opens a patient's chart. A small
`access_log(id, doctor_id, patient_id, viewed_at, surface)` table the
patient could review from Settings would be good GDPR-friendly
transparency. Schema change + a small feature; flagging for a deliberate
yes before building.
