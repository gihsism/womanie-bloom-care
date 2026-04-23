# Shipped — older session logs

Rotated out of `audit.md` once we had enough trailing sessions to keep
the active file small for context loading. Commit hashes on main; look
them up with `git show <hash>` for full detail. Newest first.

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

