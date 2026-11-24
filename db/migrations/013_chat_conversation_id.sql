-- Real conversations in Ask AI. Until now chat_messages was one long
-- stream per user and "Past chats" split it on 3-hour gaps in the
-- browser, so separate chats within 3 hours merged into one.
--
-- Additive only: one NULLABLE column + one index. Existing rows are not
-- touched (they keep conversation_id = NULL and the client keeps
-- grouping them with the 3-hour rule). New turns carry a client-made
-- UUID on both the user and the assistant row, sent with each
-- /api/ai-doctor-chat request. Rows are still owned and read only by
-- user_id; the id only groups a user's own rows.
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/013_chat_conversation_id.sql
-- Idempotent: safe to run twice. The app works before it is applied
-- (the API retries without the column and chats group by time).
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS conversation_id UUID;
CREATE INDEX IF NOT EXISTS chat_messages_user_conversation_idx
  ON chat_messages (user_id, conversation_id, created_at);
