-- HANDOFF #2, approved by Alena 2026-06-11: the footer "Stay Informed"
-- form validated an email, toasted "Subscribed!", and stored nothing.
-- This table makes the capture real: single-opt-in, no email infra —
-- the list exists for whenever a newsletter actually launches.
--
-- Additive and non-destructive. Lowercased unique email so repeat
-- submissions are idempotent (the endpoint upserts ON CONFLICT DO
-- NOTHING and still reports success — no email enumeration).
-- unsubscribed_at is included now so a future unsubscribe link never
-- needs a schema change.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'footer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);
