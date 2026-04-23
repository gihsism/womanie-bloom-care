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

### 2026-04-23 (session 8)

- **b5fe18a** — weekly narrative summary feature. `POST /api/summary/generate` reads the patient's profile + up to 20 recent documents' `ai_summary` + last 200 extracted values and asks Claude Sonnet 4 for a 4-section markdown narrative ("Your big picture" / "What's going well" / "What to keep an eye on" / "Good questions to bring to your doctor"). Cached in `llm_cache` keyed on user + ISO-week + content hash; `force: true` bypasses for manual refresh. New `WeeklySummary` card on PatientDashboard renders the markdown, collapses with a gradient fade + "Read more", and auto-refreshes on `onHealthDataChange` so a new analysis feeds into the narrative automatically.
- **906e4ee** — patient can revoke access for connected doctors. `GET /api/connections/approved` mirrors the pending endpoint. `POST /api/connections/respond` now also accepts `action: 'revoke'` — parameterised expected-status guard so approve/reject stay pending-only, revoke is approved-only; revoke simply DELETEs. New `ConnectedDoctors` card on Medical History renders under `PendingConnections` with a confirm-gated Revoke button.

End-to-end share-with-doctor lifecycle is now complete: generate code → redeem → pending → approve/decline → connected → revoke.

Remaining open after session 8:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- P2 #17 orphaned chat messages.
- HANDOFFs: schema migrations; `/api/auth/doctor-signup` with real role verification; rate-limit bucket.

Next-session candidates:
1. `/api/auth/doctor-signup` endpoint + DoctorSignUp rewrite (unblocks doctor onboarding — currently impossible).
2. Rate-limit `/api/analyze-document` and `/api/summary/generate` — now that there are two Claude-call endpoints, a tenant-level budget matters more.
3. Revoke-code / cleanup for expired `patient_access_codes` via a tiny cron-ish pass.
4. Polish: the WeeklySummary "Read more" gradient on a shorter summary looks empty — only show fade when content is actually taller than max-h-60.

### 2026-04-23 (session 7)

- **23a39f0** — patient-side pending-connection approval. New `GET /api/connections/pending` joins `doctor_patient_connections` (pending, for this patient) with `doctor_profiles` (name, specialties, verified badge, avatar) — the join lives server-side because the patient can't read doctor_profiles rows through /api/db. New `POST /api/connections/respond` validates the connection is pending + belongs to the session patient, then approves (status='approved', approved_at=now()) or rejects (deletes). New `PendingConnections` card on Medical History slots above `NewDocInsights` and hides when empty.
- **7051821** — close the user_roles self-elevation path. /api/db now maintains a `WRITE_BLOCKED` set of tables whose insert/update/upsert/delete operations are rejected with 403. user_roles is the first entry. Reads still work (so DoctorLogIn's role-verification query is fine). Role assignment is now only possible through trusted server paths — which means DoctorSignUp still doesn't work, pending a dedicated endpoint, but the existing privilege-escalation is closed.

Share-with-doctor loop is now end-to-end complete:
  1. Patient generates 8-char code (ShareWithDoctor, session 6).
  2. Doctor redeems via /api/connections/redeem-code (session 5).
  3. Connection lands as pending.
  4. Patient sees it in PendingConnections, approves or declines.
  5. Approved doctor reads patient data via /api/doctors/patient (session 5).

Remaining open after session 7:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- P2 #17 orphaned chat messages.
- HANDOFFs: schema migrations; `/api/auth/doctor-signup` with real role verification.
- Polish: revoke-an-approved-doctor UX.

Next-session candidates:
1. "Revoke access" button on approved doctor connections (extend /api/connections/respond to accept 'revoke').
2. Weekly/monthly narrative summary across all docs (on-demand Claude call).
3. Rate limiting on /api/analyze-document.
4. `/api/auth/doctor-signup` endpoint + DoctorSignUp rewrite.

### 2026-04-23 (session 6)

- Audit pass over every `.from(...)` site in `src/` to hunt the rest of the regressions from session 1's ownership enforcement. Most patient-side queries use `user.id` or a relational column and are fine; the remaining broken spots are:
  - **DoctorLogIn** — called `db.auth.signInWithPassword`, a Supabase-shim stub that always errors. Fixed to POST `/api/auth/login` and verify the doctor role via `/api/db` (owner enforcement injects `user_id = session.id` so the role lookup is safe). Full reload to `/doctor/dashboard` after login so AuthContext picks up the new cookie. Commit **f4a2096**.
  - **DoctorSignUp** — also uses stubs, plus inserting directly into `user_roles` with `role: 'doctor'` which is a pre-existing privilege-escalation path (any authenticated user could self-assign). NOT fixed — see HANDOFF below.
- **8b95906** — new patient-side `ShareWithDoctor` dialog on MedicalHistory. Generates an 8-char readable code (A-Z + 2-9), expires in 24 hours, inserts into `patient_access_codes`. Lists active codes with a copy button. Pairs with last session's `/api/connections/redeem-code` for the full patient→doctor link flow. Also fixed a subtle policy bug: `patient_access_codes` is owned via `patient_id`, not `user_id` — my session-1 policy was wrong; it only hadn't bitten because there was no patient-side writer until now.

Added to HANDOFFs:
- **Doctor signup + role assignment** — needs a dedicated `/api/auth/doctor-signup` endpoint that creates the auth_users row, creates doctor_profiles, and assigns the doctor role server-side with verification (email-domain whitelist, admin approval, license check, etc.). Also needs `/api/db` to stop accepting `user_roles` INSERT from clients — role writes should only happen via trusted server paths. Without this, fixing DoctorSignUp would make an existing escalation path easier.

Remaining open after session 6:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- P2 #17 orphaned chat messages.
- HANDOFFs: schema (RLS, analysis_status, pending_jobs, rate-limit, cross-document trends, doctor signup endpoint), plus user_roles write policy tightening.

Next-session candidates:
1. Patient-side UI to approve/reject pending doctor_patient_connections (completes the end-to-end flow from ShareWithDoctor).
2. Weekly/monthly narrative summary across all docs.
3. Rate-limit `/api/analyze-document`.
4. Tighten `/api/db` to reject `user_roles` INSERT/UPDATE.

### 2026-04-23 (session 5)

- **be84ed0** — deep-linking from dashboard cards into the specific doc on Medical History. `RecentFindings` and `HealthTrends` now navigate with `?doc=<id>` when the finding / trend has a known document_id; `MedicalHistory` reads `useSearchParams`, auto-expands the matching doc card, and scrolls it into view (via `id=doc-card-<id>` + `scroll-mt-16` so the sticky header doesn't cover the target).
- **ddb0820** — regression fix: doctor-side access-code redemption. Session 1's `/api/db` ownership enforcement meant a doctor couldn't SELECT or UPDATE `patient_access_codes` (rows are patient-owned). New `/api/connections/redeem-code` does the whole verify-doctor-role / find-code / create-connection / mark-used cascade under server authority; `DoctorDashboard.handleSubmitCode` now POSTs to it.
- **7e3aec7** — regression fix: `FindDoctor` was silently empty for patients because `doctor_profiles` + `doctor_schedule` + `consultation_settings` reads were pinned to the session user. New `GET /api/doctors/list` serves the verified-doctor directory server-side with public-surface columns only.
- **3b6b339** — regression fix: `PatientDetails` on the doctor side was denying every approved connection because `profiles` / `daily_health_signals` / `health_documents` reads were pinned to the session user. New `GET /api/doctors/patient?id=<patientId>` consent-gates on an `approved` row in `doctor_patient_connections`, then returns profile + signals + documents + extracted data + notes + appointments in one payload.

Noteworthy — the session-1 `/api/db` fix, while correct on the security axis, broke multiple cross-user flows. This session closed the three obvious ones (code redemption, doctor directory, approved-patient view). There may be more stragglers in places I haven't exercised — watch for them as Alena starts using doctor flows.

Remaining open after session 5:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- P2 #17 orphaned chat messages.
- HANDOFFs: schema (RLS, analysis_status, pending_jobs, rate-limit, cross-document trend table).

Next-session candidates:
1. Weekly/monthly narrative summary across all docs (on-demand Claude call, persist in DB).
2. Rate limiting on `/api/analyze-document` (lightweight in-memory per-pod ok for now; a real bucket needs schema).
3. Patient-side UI to generate an access code and share with a doctor (the complement to `/api/connections/redeem-code`).
4. Audit remaining `.from(...)` call sites in `src/` for any more ownership-enforcement regressions I missed.

### 2026-04-23 (session 4)

- **dc8360a** — `NewDocInsights` banner at the top of Medical History. When there's a freshly analyzed doc, compares its `medical_extracted_data` rows title-by-title against all prior docs' rows and surfaces three kinds of shift: `worsened` (was ok, now abnormal/critical or stepped up), `improved` (was abnormal/critical, now stepped down), `new` (no prior reading and came back abnormal/critical). Ranked worsened → new → improved, top 6, counts overflow. Dismissible per-doc via localStorage keyed on user+doc id. Pure client-side over data already loaded on the page.
- **6adbcea** — structured JSON stage logs in analyze-document. `logStage(documentId, stage, startedAt, extra)` emits one line per stage (start, llm_cache_hit / llm_cache_miss, anthropic_ok with token + prompt-cache usage, parsed, parse_failed, done) with elapsed ms from handler start. Greppable `"event":"analyze_document"` in Vercel logs; gives us end-to-end latency and prompt-cache hit rate without a separate metrics service.

Next-session candidates:
1. Deep-link from RecentFindings / HealthTrends / NewDocInsights into the specific expanded doc on Medical History.
2. Rate-limit `/api/analyze-document` per user per day (in-memory is insufficient on serverless; would prefer a lightweight DB-backed bucket — flag as HANDOFF if schema needed).
3. "Share with doctor" flow building on `patient_access_codes`.
4. Weekly/monthly narrative summary across all docs (Claude call on `current_extracted_data`).

### 2026-04-23 early morning (session 3)

- **d1413e4** — new `HealthTrends` card on PatientDashboard. Pure client-side compute over `current_extracted_data`: groups by `title`, takes tests with ≥2 parseable numeric readings, shows latest vs previous with direction, % change, status-shift label (Improved / Worsening). Sort prioritizes status flips, then larger deltas, then recency. Top 6 shown; card hides when nothing to say. Delivers ongoing visible value as Alena uploads more documents.
- **a8899f3** — timezone-aware "Today: …" in the analysis prompt. Client sends `Intl.DateTimeFormat().resolvedOptions().timeZone`; server's `resolveToday(tz)` formats via `Intl.DateTimeFormat('en-CA', { timeZone, … })` for YYYY-MM-DD. Closes P2 #19.
- **eac03f8** — removed the synthetic `[SYSTEM CONTEXT …]` user message the frontend prepended to every ai-doctor-chat call. The backend already loads richer context from the DB, so the snippet was a strict subset; its only effect was forcing a fragile prefix-sniff on the backend to keep it out of the message history. Frontend still computes `medicalContext` for prompt-chip selection; it's just no longer shipped. Closes P1 #12.

Remaining open after session 3:
- P0 #5 transaction atomicity — subtle; after observability.
- P1 #8 cache TTL (schema change, HANDOFF).
- P2 #16 filename collision — mostly addressed by the session-1 user.id prefix; could be closed with a UUID suffix but not urgent.
- P2 #17 orphaned chat messages.
- HANDOFFs: schema changes (RLS, analysis_status column, pending_jobs, rate-limit table, cross-document trend table).

Next-session candidates (descending by user-visible value):
1. "What's changed" banner / diff when a new analysis lands (compare new vs prior extracted_data, surface net new abnormal findings, improved flags).
2. Per-doc "changes since last test" inline column in the expanded doc card.
3. Weekly/monthly health report summarizing across all docs (could be Claude-generated on demand).
4. Rate-limit `/api/analyze-document` (simple in-memory or via lightweight schema).
5. Structured logging + Sentry spans around analysis (latency, cache hit rate, failure mode).
6. Share-with-doctor flow — `patient_access_codes` table exists but UI is minimal.

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

