-- audit #8 — the llm_cache key is pinned to the model version, so on a model
-- upgrade old entries would linger forever and a returning user would keep
-- seeing the previous model's analysis until they happened to re-upload. There
-- was also no age signal on a cache row at all.
--
-- This adds a created_at timestamp so the read path can expire entries older
-- than 30 days (treating a stale row as a miss → fresh Anthropic call → row
-- refreshed). Additive and non-destructive: existing rows get now() as their
-- created_at via the DEFAULT, so nothing is lost and the worst case is that a
-- handful of pre-existing entries live up to 30 days from this deploy before
-- their first refresh.

ALTER TABLE llm_cache
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Lets the expiry predicate (created_at > now() - interval '30 days') stay cheap
-- even as the cache grows.
CREATE INDEX IF NOT EXISTS llm_cache_created_at_idx ON llm_cache (created_at);
