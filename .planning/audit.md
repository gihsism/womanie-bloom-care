# Document Analysis Audit — 2026-04-22

## Executive summary

The womanie-bloom-care document analysis pipeline is **architecturally sound but operationally fragile**. It correctly uses versioned `document_analyses` for re-analysis durability, but the real problems are in error resilience, monitoring, and data consistency:

- **Critical:** No user feedback during 30–120s AI calls; backend crashes mid-analysis leave orphaned `document_analyses` rows in FALSE state
- **Critical:** `/api/upload` POST (token-gen) has no auth check; an unauth user can enumerate document types and max sizes
- **Critical:** `analyze-document` does not verify `userId` matches the session; client can reanalyze any user's documents
- **High:** 30+ sequential INSERTs per document kill performance; should batch or use COPY
- **High:** System prompt is 350 lines (~7.8 KB); Anthropic prompt caching not enabled despite 300s timeout allowance
- **High:** Dashboard consumers (CycleLabInsights, ModeLabInsights, PregnancyLabInsights) all fetch `medical_extracted_data` independently, no caching; duplicate queries on every page load
- **High:** Insights pages don't refresh when new analyses land; user uploads doc, it analyzes, but the page shows stale data until reload
- **Medium:** JSON parse fallback silently degrades; if LLM returns malformed JSON, user gets a generic text blob instead of structured data
- **Medium:** No cross-document correlation implemented despite the prompt saying it does; each doc is analyzed in isolation

The pipeline could be production-ready with 12–16 hours of focused work on auth, error handling, and caching.

---

## P0 — blocks users now

**1. api/upload.ts — POST endpoint has no auth check**
- Where: `/api/upload` POST handler (lines 18–48)
- What's wrong: The token-gen path calls `handleUpload` without verifying the user's session. An unauthenticated requester can hit `/api/upload` and get back a signed upload URL.
- Blast radius: Any attacker can upload junk to our blob; if the bucket is world-readable, potentially seed content; also consumes our quota.
- Fix sketch: Resolve the session inside `onBeforeGenerateToken`; 401 on missing session; stamp pathname with `user.id` server-side.
- Risk class: RISKY — auth (but we're the sole caller, changing won't break user flows)
- Priority: P0
- Status: open

**2. api/analyze-document.ts — No session validation before reanalysis**
- Where: Lines 30–33
- What's wrong: The handler accepts `{ documentId, userId, ... }` from the request body and trusts the `userId`. No call to `getAuthUser()` to verify the session.
- Blast radius: Cross-user data exfiltration — attacker can reanalyze another user's documents, consume their quota, and write to their `document_analyses`.
- Fix sketch: Add `const user = await requireAuthUser(req); if (user.id !== userId) return 401`. Same pattern applies to all `/api/*` handlers that touch user data.
- Risk class: RISKY — auth bypass fix, touches handler logic but not session code
- Priority: P0
- Status: open

**3. api/db.ts — Query router trusts client-supplied filters**
- Where: Lines 23–85
- What's wrong: The endpoint doesn't enforce row-level security. Any authenticated user can craft a POST body omitting the `user_id` filter and read/update/delete any other user's rows.
- Blast radius: CRITICAL — any logged-in user can read any other user's medical records by sending a crafted POST.
- Fix sketch: Extract the session user inside the handler; for tables owned by users (health_documents, medical_extracted_data, profiles, document_analyses, ai_chat_messages…), force a `user_id = <session.id>` filter even if the client doesn't include it.
- Risk class: RISKY — central query router; must be tested carefully
- Priority: P0
- Status: open

**4. src/pages/MedicalHistory.tsx:655–669 — Delete is non-atomic**
- Where: `deleteDocument()`
- What's wrong: Deletes from `medical_extracted_data` first, then `health_documents`. If step 2 fails the orphaned doc row has no extracted data; UI confusion.
- Blast radius: Low — only manifests on transient DB failure during delete.
- Fix sketch: Add ON DELETE CASCADE (schema change — HANDOFF) OR do both deletes in a transaction on the server side via a new `/api/docs/delete` endpoint.
- Risk class: SAFE if via new endpoint; RISKY if schema change
- Priority: P0
- Status: open

**5. api/analyze-document.ts:513–517 — Transaction atomicity not guaranteed mid-timeout**
- Where: `sql.transaction([...])` at end of handler
- What's wrong: If Vercel kills the function at 300s while this transaction is in flight, we may have a new `document_analyses` row with `is_current=FALSE` and no flip. User sees old analysis as current; the new one is orphaned.
- Blast radius: Rare but confusing: re-analysis appears to have "failed" silently.
- Fix sketch: (a) Add a background janitor that promotes the most recent `document_analyses` row when a document's `ai_summary` is stale; OR (b) restructure so the flip happens before the per-item INSERTs finish.
- Risk class: SAFE — internal logic
- Priority: P0
- Status: open

---

## P1 — degrades quality

**6. api/analyze-document.ts:462–476 — Per-extracted-value sequential INSERTs**
- Where: The for-loop writing `medical_extracted_data` rows
- What's wrong: 20–40 round-trips to Neon per doc, each ~50–150ms. 2–4s of wall time wasted.
- Fix sketch: Single multi-row INSERT.
- Risk class: SAFE
- Priority: P1
- Status: open

**7. api/analyze-document.ts:108–350 — System prompt is 350 lines, not cached**
- Where: `buildSystemPrompt()`
- What's wrong: Anthropic prompt caching would cut cost by ~90% on repeated calls within 5min of each other; the rules block is static.
- Fix sketch: Split prompt into static (cacheable) + dynamic (date, patient context) sections; send with `cache_control: { type: "ephemeral" }` on the static block.
- Risk class: SAFE
- Priority: P1
- Status: open

**8. api/analyze-document.ts:357 — Cache key is pinned to model version**
- Where: cacheKey includes model name
- What's wrong: On model upgrade, old cache entries go stale silently; users don't see the improvement unless they re-upload.
- Fix sketch: Add `created_at` column; expire rows older than 30 days on cache hit.
- Risk class: SAFE (schema change needed — HANDOFF if new column)
- Priority: P1
- Status: open

**9. src/pages/MedicalHistory.tsx — Polling has no backoff**
- Where: Lines 614–630 (the polling effect I added earlier today)
- What's wrong: 5s interval for 3 min flat; creates DB load.
- Fix sketch: 2s → 4s → 8s → 10s cap; stop after 3 min.
- Risk class: SAFE
- Priority: P1
- Status: open

**10. src/components/dashboard/{Cycle,Mode,Pregnancy}LabInsights — Independent fetches**
- Where: Each component fetches `medical_extracted_data` independently
- What's wrong: 3 redundant SELECTs on same table, same user, same page load.
- Fix sketch: `useExtractedData()` hook with React-Query-style caching (or lift state to PatientDashboard / MedicalHistory and pass down).
- Risk class: SAFE
- Priority: P1
- Status: open

**11. Insights don't auto-refresh after analysis lands**
- Where: HealthSummaryWidget, HealthTimeline, all lab insights
- What's wrong: Component state is fetched on mount; no subscription to "new analysis landed" events. User uploads → polling sees `ai_summary` fill in → but insights components were mounted before and still show stale.
- Fix sketch: Same hook as #10; when MedicalHistory completes polling, hook invalidates and re-fetches.
- Risk class: SAFE (moderate effort)
- Priority: P1
- Status: open

**12. api/ai-doctor-chat.ts:113–116 — Fragile system-message prefix filter**
- Where: Skips messages starting with `[SYSTEM CONTEXT`
- What's wrong: Content-prefix sniffing; user can't paste that string.
- Fix sketch: Add `synthetic: boolean` column or role discrimination.
- Risk class: SAFE
- Priority: P1
- Status: open

**13. api/analyze-document.ts:391–395 — No retry on Anthropic 5xx / 429**
- Where: After `fetch(https://api.anthropic.com/...)`
- What's wrong: First transient error = analysis fails and user has to retry manually.
- Fix sketch: 3 retries with exponential backoff (250ms, 1s, 4s), short-circuit on 4xx-non-429.
- Risk class: SAFE
- Priority: P1
- Status: open

---

## P2 — polish

**14. JSON parse fallback silently degrades** — api/analyze-document.ts:417–428. On malformed JSON returns a generic summary with no structured data. Should retry Claude with "return valid JSON only" or fail loudly.

**15. Duplicated `friendlyTestNames`** — in both `medical-utils.ts` and `MedicalHistory.tsx`; already drifting. Delete the duplicate.

**16. Filename collision risk** — `upload-${Date.now()}` fallback path in upload.ts; use UUIDs.

**17. Orphaned chat messages** — `ai-doctor-chat.ts:39-43` inserts user message before streaming reply; if stream fails, orphaned message remains.

**18. Fire-and-forget analysis dispatch not observable** — if the /api/analyze-document request is lost in flight before Vercel receives it, nothing retries. Should store a `pending_jobs` row and have a retry worker.

**19. "Today's date" is UTC** — analyze-document.ts:98. Patient timezone not considered.

---

## HANDOFFs — needs Alena's call

- **Schema: RLS / cascade policies** — Postgres row-level security for true isolation; ON DELETE CASCADE on extracted_data. Both require SQL migrations against Neon.
- **Schema: Pending-jobs table** — for durable analysis retry.
- **Schema: Cross-document trend table** — for multi-document correlation.
- **Product: Re-analysis quota** — how many per day per user?
- **Product: Notification on analysis completion** — email / push / in-app badge?
- **Product: Model mix** — use Haiku for first-pass extraction + Sonnet for interpretation? 80% cheaper.

---

## Appendix

- **No tests anywhere.** Adding a handful for extraction + auth checks would pay for itself.
- **No observability beyond Sentry** — no metrics on extraction latency, cache hit rate, or failure rate. Consider Vercel Analytics + custom spans.
- **React-Query not used** — added complexity for a small team, but at this point state duplication is costing more than it saves.

---

## Work log

### 2026-04-23 early morning (session 2)

- **af3e5f2** — new `RecentFindings` card on PatientDashboard. Pulls `current_extracted_data`, filters to critical/abnormal, sorts by severity+recency, top 5 visible with value, ref range, AI note, and relative date. Hides when clean. Subscribes to `onHealthDataChange`. Directly delivers on Alena's "dashboard updates based on analysis" ask.
- **d2996c2** — parse robustness. Helper `tryParseAnalysisJson` with lenient + brace-trim fallback. On parse failure, re-ask Claude once with the broken reply quoted back and a strict-JSON instruction; overwrite `llm_cache` on success so we don't replay the bad reply. If still broken, return `502 {error:'parse_failed'}` instead of silently saving a text blob. Closes P2 #14.
- **9d6e3ec** — new `/api/docs/delete` endpoint. Runs `medical_extracted_data` + `document_analyses` + `health_documents` deletes in one Neon transaction, then best-effort `@vercel/blob` `del()`. Fixes orphans and the old silent blob leak. `MedicalHistory.deleteDocument` now just POSTs to it and emits a data-change. Closes P0 #4.
- **3df2546** — deleted the unused duplicate `friendlyTestNames` in MedicalHistory. Closes P2 #15.
- **2962c53** — "Analysis stalled · tap to retry" state on doc cards when `uploaded_at` is > 3 min old and `ai_summary` is still null. Previously the card just sat on "Analyzing…" forever if anything failed. Closes part of P2 #18.

Remaining open after session 2:
- P0 #5 transaction atomicity — subtle; schedule after observability.
- P1 #8 cache TTL (schema change, HANDOFF).
- P1 #12 ai-doctor-chat synthetic-message prefix sniff.
- P2 #16 filename collision (mostly addressed by user.id prefix from the security fix).
- P2 #17 orphaned chat messages.
- P2 #19 timezone-aware today's date.

Next session candidates, in rough order:
1. Trend detection across docs (e.g. ferritin over 3 panels) — pure compute on existing `current_extracted_data`, big visible value.
2. Timezone-aware date in prompt (#19) — trivial.
3. Tests for `/api/db` ownership enforcement — defend the P0 fix.
4. Switch synthetic chat messages to a role-based flag (#12).
5. Observability: structured logging + Sentry spans for analysis latency + cache hit rate.

### 2026-04-22 evening (session 1)

Shipped, top-down:
- **c6f0797** — P0 security. Session auth required on `/api/db`, `/api/upload`, `/api/analyze-document`. `/api/db` now enforces per-table ownership via a column map; reads force the filter to the session user, writes reject owner mismatches, updates drop owner columns from the SET clause. `/api/upload` restricts pathnames to `<user.id>/`. `analyze-document` rejects when `req.body.userId` ≠ session. Closes items 1–3 from P0.
- **87c77da** — `callAnthropicWithRetry` with 250 ms / 1 s / 4 s backoff on 5xx and 429; batched the per-value INSERT loop into a single multi-row INSERT. Closes P1 #6 and #13.
- **51446f5** — Anthropic prompt caching. Split `buildSystemPrompt` into `STATIC_RULES` const + `buildDynamicHeader`; sent `system` as a two-block array with `cache_control: ephemeral` on the static block. Local `llm_cache` still hashes the full prompt so rule changes invalidate naturally. Closes P1 #7.
- **322f9f6** — Dashboard auto-refresh. `src/lib/data-events.ts` exposes a module-level emit/subscribe pair. DocumentUpload emits on insert; MedicalHistory polling emits when a doc transitions from `!ai_summary` to `ai_summary` (tracked via ref). CycleLabInsights, ModeLabInsights, PregnancyLabInsights, HealthSummaryWidget, HealthStatistics all subscribe. Also fixed two pre-existing bugs on HealthStatistics while editing: missing `usePageTitle` import and empty-session `db.auth.getSession()` usage. Closes P1 #10 and #11.

Remaining P0: #4 (non-atomic delete) and #5 (transaction atomicity under timeout) — both carry some schema/backend risk, queued for next session.

Remaining P1 (easy wins next up): #8 cache TTL, #9 polling backoff, #12 synthetic message flag, #14 JSON parse loudness, #15 duplicate friendlyTestNames.

Potential next high-value: visible "Analyzing…" status badge on doc cards; "Recent findings" card on PatientDashboard (critical/abnormal values surfaced at-a-glance — aligned with Alena's "dashboard updates based on analysis" ask).

