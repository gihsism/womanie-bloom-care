-- Ask AI answer feedback: thumbs up / down with an optional reason, per
-- answer, for later quality review (2026-11-26).
--
-- One row per rating; rating again replaces her earlier rating of the
-- same answer (unique on user + answer key). Written only by the server
-- (POST /api/chat/feedback); NOT in /api/db's ownership map.
--
-- rating:        1 = helpful, -1 = not helpful
-- reason:        one of a fixed list ('wrong', 'not_personal', 'unclear',
--                'too_long', 'unsafe', 'other'), or NULL
-- comment:       optional free text she typed (max 500 chars). Nothing is
--                added to it by the app: no name, no records, no answer text.
-- message_id:    the chat_messages row of the answer, when it was stored
-- answer_key:    the page's id for the answer (message id, or a random id
--                when the reply was not stored), so a re-rating updates
-- conversation_id, model: to group reviews by chat and model
--
-- Exported by /api/me/export (chat_feedback) and deleted with the account
-- by /api/me/delete-account; deleting a chat leaves its ratings, which hold
-- no chat text. See docs/privacy-data-map.md.
--
-- The app works before this is applied: the page keeps ratings in the
-- browser and the server answers "stored: false"; export and deletion
-- skip the table.
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/026_chat_feedback.sql
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS chat_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  answer_key      TEXT NOT NULL,
  message_id      UUID,
  conversation_id UUID,
  model           TEXT,
  rating          SMALLINT NOT NULL CHECK (rating IN (1, -1)),
  reason          TEXT CHECK (reason IN ('wrong', 'not_personal', 'unclear', 'too_long', 'unsafe', 'other')),
  comment         TEXT CHECK (char_length(comment) <= 500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_feedback_user_answer_idx ON chat_feedback (user_id, answer_key);
CREATE INDEX IF NOT EXISTS chat_feedback_review_idx ON chat_feedback (rating, created_at DESC);
