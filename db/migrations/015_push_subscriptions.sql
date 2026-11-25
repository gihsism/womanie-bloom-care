-- Phone notifications (Web Push) for reminders that reach her outside the
-- app: medicine times, period expected / late, a visit the day before.
--
-- Additive only: two new tables, nothing existing is altered.
--
-- push_subscriptions: one row per device that opted in (Me -> Reminders ->
-- "Phone notifications"). endpoint/p256dh/auth come from the browser's
-- PushManager. timezone is her IANA zone (e.g. Europe/Zurich) so reminder
-- times are read in HER local time. prefs = which reminder types this
-- device gets: { "medicine": true, "period": true, "appointment": true }.
-- NOT in /api/db's ownership map: only /api/push/* reads or writes it, and
-- always filtered by the session user.
--
-- push_sent_log: one row per reminder already sent, so a reminder goes out
-- once even when the scheduler runs every few minutes or twice at the same
-- time (the sender claims the key with INSERT ... ON CONFLICT DO NOTHING
-- before sending). Rows older than 60 days are pruned by the sender.
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/015_push_subscriptions.sql
-- Idempotent: safe to run twice. The app works before it is applied (the
-- opt-in shows "not available yet" and the sender does nothing).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  prefs JSONB NOT NULL DEFAULT '{"medicine": true, "period": true, "appointment": true}'::jsonb,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS push_sent_log (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS push_sent_log_sent_at_idx ON push_sent_log (sent_at);
