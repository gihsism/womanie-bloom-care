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

### 2026-04-23 (session 15)

- **2c2a732** — finished the ESLint `no-explicit-any` cleanup pass. analyze-document's `tryParseAnalysisJson` return type + `processWithAI` signature + cross-reference mapper + extracted_data loop all typed. ai-doctor-chat's per-row `any` replaced with `Record<string, unknown>`. db.ts filter tuple / params / safeUpdate all narrowed, and the `__owner_or__` sentinel is narrowed via a small cast instead of propagated as `any`. admin/docs groups typed. api/ is now 0 `no-explicit-any` errors.

Remaining open after session 15:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Authed e2e smoke flow.
2. Rotate sessions 1–6 out of audit.md into SHIPPED.md.
3. Dashboard empty-state pass for brand-new users.
4. ai-doctor-chat welcome-message + suggested-prompt polish.

### 2026-04-23 (session 14)

- **bae6d38** — ESLint pass, phase 1. The file surface modified across autonomous sessions had 49 `no-explicit-any` errors. This commit fixes ~half: introduces `src/lib/errors.ts` with `errorMessage(err: unknown): string`, uses it in six frontend catch blocks; retypes neon query results from `as any[]` to `as unknown[]` or `as Array<{…}>` across summary/generate, doctors/list, doctors/patient, auth/doctor-signup, connections/respond, connections/redeem-code; drops the `request: req as any` in upload.ts.

Remaining lint errors (17 in api/) are concentrated in analyze-document / ai-doctor-chat / db.ts where the Neon surface and the Claude response shape touch more call sites. Intentionally left for a follow-up so this session doesn't turn into a marathon type-cleanup.

Remaining open after session 14:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow; remaining any-in-api cleanup.

Next-session candidates:
1. Finish the remaining 17 `any`s in api/analyze-document / ai-doctor-chat / db.ts.
2. Authed e2e smoke flow — most user-valuable, catches the silent-broken-flow class of bug.
3. Rotate sessions 1–6 out of audit.md.
4. Dashboard empty-state pass (what does a brand-new-user dashboard look like? first-time upload experience?).

### 2026-04-23 (session 13)

- **d4801cc** — added `/api/predict-ovulation`. PatientDashboard auto-fetches a prediction on every mount for menstrual-cycle / conception users, plus the user-triggered `OvulationPrediction` button — both went through `db.functions.invoke('predict-ovulation', …)` which routes to `/api/predict-ovulation`. That endpoint never existed; prediction had been silently 404-ing since the Supabase migration. Pure algorithmic implementation (cycleLength − 14 luteal rule, ±4/+1 fertile window, indicator scan of last 30 days of signals, templated narrative) — no Claude call, so no cost/latency on every dashboard mount. Returns the exact shape the frontend already expected.
- **3f88863** — smoke.sh now asserts 401 on the new endpoint too (24 checks passing).

No more live `db.auth.*` / `db.rpc` / unreachable `db.functions.invoke(...)` targets in the codebase. The "broken after Supabase migration" class of bugs appears closed out.

Remaining open after session 13:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Authed e2e smoke flow — bcrypt a test user, exercise every page's core CRUD under its cookie. Would have caught CycleCalendar / DailyLogging bugs in session 12.
2. Rotate sessions 1–6 into `.planning/SHIPPED.md`; audit.md is pushing 400 lines.
3. Admin notification on doctor signup (Slack webhook or email).
4. UX: ovulation prediction currently requires both periodData AND signal entries to surface on the dashboard — a first-time user with no period-record history sees nothing. Consider a friendlier empty state.

### 2026-04-23 (session 12)

Found and closed several more post-migration stubs that had been sitting silently broken. Short-form:

- **831be78** — DoctorDashboard + useRequireRole.
  - useRequireRole called `db.rpc('has_role', …)`; rpc is not implemented in the shim, so the hook threw every render and bounced doctors to /auth/doctor-login. Switched to a `/api/db` read of `user_roles` with `.eq('role', role).maybeSingle()` — ownership enforcement injects the `user_id = session.id` filter.
  - DoctorDashboard hydrated local user state from `db.auth.getUser()` which always returns null; `loadDoctorData()` therefore never fired. Switched to AuthContext.
- **22ae4f5** — the other three stub sites. **CycleCalendar** (6 call sites) and **DailyLogging** (2) both read user via `db.auth.getUser()` as their auth gate — which always returned null, so period tracking, symptom logs, and daily signals were silently discarded whenever Alena tried to save. **doctor/PatientDetails** had one more occurrence that had gone unnoticed. All three now use AuthContext. After this commit no live `db.auth.*` / `db.rpc` calls remain outside the shim file itself.

**High-leverage lesson**: these were all "works in dev, fails in prod because we swapped auth providers and forgot to swap the consumers". The smoke.sh script from session 11 wouldn't have caught them because they fail with an authenticated session too (stub returns null; real session in AuthContext would have worked fine). A test that exercises real CRUD flows with a logged-in test user would catch this class.

Remaining open after session 12:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor signup email verification.

Next-session candidates:
1. Extend smoke.sh to a logged-in test-user flow (bcrypt an `e2e@womanie.test` account and exercise the big CRUD paths under its cookie — would have caught session 12's stub bugs).
2. More a11y on PendingConnections / ConnectedDoctors action buttons (they're already `<Button>` so focus ring handled — probably fine, verify).
3. Rotate sessions 1–5 out of audit.md into .planning/SHIPPED.md.
4. Admin notifications on doctor signup (Slack webhook or email).

### 2026-04-23 (session 11)

- **109372a** — new `.planning/smoke.sh`. Curl-based script, 23 checks, runs in ~3 seconds. Hits every auth-gated API route without a session and asserts 401/403; hits the public routes and asserts 200/302/400; compares live bundle hash against dist/. Fastest way to catch the class of silent regression that bit session 5. Gates on exit code so CI-ready.
- **cf558e1** — closed P2 #17 (orphan chat messages). ai-doctor-chat no longer inserts the user turn before calling Claude; captures it instead and persists the pair (user + assistant) inside a single `sql.transaction` in the finally block, only if assistant text was produced. A stream that yielded nothing skips both rows — chat history stays internally consistent.
- **0540025** — keyboard + SR access for RecentFindings / HealthTrends clickable rows. Added `role='button'`, `tabIndex={0}`, Enter/Space onKeyDown firing the same navigate() target, and a focus-visible ring. Cards were mouse-only before.

Remaining open after session 11:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification on signup; real rate-limit bucket.
- Further a11y: PendingConnections, ConnectedDoctors, NewDocInsights rows — same pattern.

Next-session candidates:
1. Apply the same a11y pattern to PendingConnections / ConnectedDoctors / NewDocInsights.
2. Admin notification channel on doctor signup (Slack webhook? email via Resend?).
3. Rotate audit.md sessions 1–5 into a SHIPPED.md — file is getting long for context loading.
4. Test coverage for the share-with-doctor lifecycle (smoke.sh would need an authenticated curl flow — non-trivial but doable with a test user + bcrypt).

### 2026-04-23 (session 10)

- **85d3462** — admin approval surface for doctor signups. `api/_lib/admin.ts` gates on `ADMIN_EMAILS` env var (case-insensitive, fails closed). `api/admin/doctors.ts` (GET pending list, POST `{userId, action}` for approve/reject) flips `doctor_profiles.is_verified` + `verification_status` and idempotently inserts the `user_roles` 'doctor' row under server authority. New `/admin/doctors` route renders a minimal list with Approve / Reject buttons; returns a friendly "Admin only" card on 403 with a hint to set `ADMIN_EMAILS`. Finally unblocks the doctor onboarding loop end-to-end.
- **145d1f9** — WeeklySummary polish: measure rendered markdown height on mount + summary-change and only clamp / show the fade + "Read more" when it actually overflows. Short summaries now render cleanly without a broken-looking gradient and dead button.

Remaining open after session 10:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- P2 #17 orphaned chat messages.
- HANDOFFs: schema migrations; email notification on doctor signup so new applicants don't sit unnoticed; real rate-limit bucket if in-memory ever becomes insufficient.

Next-session candidates:
1. Email / in-app notification to the admin when a new doctor signup lands (currently polls /admin/doctors manually).
2. `.planning/audit.md` is getting long; consider rotating earlier sessions out into a CHANGELOG or similar.
3. Smoke test script hitting every auth-gated endpoint with and without a valid cookie — the fastest way to catch a future ownership-enforcement regression.
4. P2 #17 orphaned chat messages — tiny consistency bug in ai-doctor-chat.

### 2026-04-23 (session 9)

- **30afdcb** — real `/api/auth/doctor-signup` endpoint. Hashes the password, creates `auth_users` + an `is_verified=false, verification_status='pending'` `doctor_profiles` row. Deliberately does NOT grant `user_roles.role='doctor'` or set a session cookie — role assignment stays admin-only (manual DB step for now) so nobody can self-elevate via the doctor-signup URL. DoctorSignUp.tsx now just POSTs to it and drops the broken db.auth.signUp() stub path.
- **4a69ddf** — `api/_lib/ratelimit.ts` + wiring. All three Claude-calling endpoints (`analyze-document`, `summary/generate`, `ai-doctor-chat`) consume from an in-memory per-user daily bucket and return 429 with a `retryInSec` field on exceed. In-memory only = soft ceiling per warm pod, not billing-grade — documented in the module; module is swappable for Vercel KV or a Neon-backed usage table later without touching callers.

Remaining open after session 9:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- P2 #17 orphaned chat messages.
- HANDOFFs: admin UI / CLI for approving doctors (manual DB step right now); schema migrations for a real rate-limit bucket if we outgrow in-memory.

Next-session candidates:
1. Admin CLI / endpoint for approving doctors — currently Alena has to run raw SQL.
2. Weekly summary fade-gradient polish (only show when content actually overflows).
3. P0 #5: make analyze-document's closing transaction survive a mid-commit function kill (partial-write janitor, or restructure the flip so it comes before the heavy writes).
4. `/api/auth/doctor-signup` email notification to an admin inbox so new signups don't get lost waiting to be approved.
5. Tests — at minimum, a smoke suite for `/api/db` ownership enforcement and for the connection lifecycle (pending → approve → revoke).


Sessions 1-8 have been rotated into .planning/SHIPPED.md.
