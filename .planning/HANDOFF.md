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
