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
- Status: shipped — `getAuthUser` resolved inside the handler; 401 on no session.

**2. api/analyze-document.ts — No session validation before reanalysis**
- Where: Lines 30–33
- What's wrong: The handler accepts `{ documentId, userId, ... }` from the request body and trusts the `userId`. No call to `getAuthUser()` to verify the session.
- Blast radius: Cross-user data exfiltration — attacker can reanalyze another user's documents, consume their quota, and write to their `document_analyses`.
- Fix sketch: Add `const user = await requireAuthUser(req); if (user.id !== userId) return 401`. Same pattern applies to all `/api/*` handlers that touch user data.
- Risk class: RISKY — auth bypass fix, touches handler logic but not session code
- Priority: P0
- Status: shipped — `getAuthUser` checked + session id reconciled against body `userId`.

**3. api/db.ts — Query router trusts client-supplied filters**
- Where: Lines 23–85
- What's wrong: The endpoint doesn't enforce row-level security. Any authenticated user can craft a POST body omitting the `user_id` filter and read/update/delete any other user's rows.
- Blast radius: CRITICAL — any logged-in user can read any other user's medical records by sending a crafted POST.
- Fix sketch: Extract the session user inside the handler; for tables owned by users (health_documents, medical_extracted_data, profiles, document_analyses, ai_chat_messages…), force a `user_id = <session.id>` filter even if the client doesn't include it.
- Risk class: RISKY — central query router; must be tested carefully
- Priority: P0
- Status: shipped — `OWNER_COLUMN` map enforces the right column per table, owner-or filter injected for relational tables, `WRITE_BLOCKED` set covers `user_roles`.

**4. src/pages/MedicalHistory.tsx:655–669 — Delete is non-atomic**
- Where: `deleteDocument()`
- What's wrong: Deletes from `medical_extracted_data` first, then `health_documents`. If step 2 fails the orphaned doc row has no extracted data; UI confusion.
- Blast radius: Low — only manifests on transient DB failure during delete.
- Fix sketch: Add ON DELETE CASCADE (schema change — HANDOFF) OR do both deletes in a transaction on the server side via a new `/api/docs/delete` endpoint.
- Risk class: SAFE if via new endpoint; RISKY if schema change
- Priority: P0
- Status: shipped — new `/api/docs/delete` runs extracted-data, analyses, and the doc row inside one Neon transaction; blob is removed after commit on a best-effort basis.

**5. api/analyze-document.ts:513–517 — Transaction atomicity not guaranteed mid-timeout**
- Where: `sql.transaction([...])` at end of handler
- What's wrong: If Vercel kills the function at 300s while this transaction is in flight, we may have a new `document_analyses` row with `is_current=FALSE` and no flip. User sees old analysis as current; the new one is orphaned.
- Blast radius: Rare but confusing: re-analysis appears to have "failed" silently.
- Fix sketch: (a) Add a background janitor that promotes the most recent `document_analyses` row when a document's `ai_summary` is stale; OR (b) restructure so the flip happens before the per-item INSERTs finish.
- Risk class: SAFE — internal logic
- Priority: P0
- Status: shipped — extracted-value INSERT now runs *before* the flip-current transaction (analyze-document.ts ~700), and the flip is wrapped in `sql.transaction([…])`, so a mid-flight kill leaves the partial analysis recoverable rather than orphaned.

---

## P1 — degrades quality

**6. api/analyze-document.ts:462–476 — Per-extracted-value sequential INSERTs**
- Where: The for-loop writing `medical_extracted_data` rows
- What's wrong: 20–40 round-trips to Neon per doc, each ~50–150ms. 2–4s of wall time wasted.
- Fix sketch: Single multi-row INSERT.
- Risk class: SAFE
- Priority: P1
- Status: shipped — single `INSERT INTO medical_extracted_data … VALUES (…), (…), …` built from a flat parameter array (analyze-document.ts ~700).

**7. api/analyze-document.ts:108–350 — System prompt is 350 lines, not cached**
- Where: `buildSystemPrompt()`
- What's wrong: Anthropic prompt caching would cut cost by ~90% on repeated calls within 5min of each other; the rules block is static.
- Fix sketch: Split prompt into static (cacheable) + dynamic (date, patient context) sections; send with `cache_control: { type: "ephemeral" }` on the static block.
- Risk class: SAFE
- Priority: P1
- Status: shipped — `STATIC_RULES` block sent with `cache_control: { type: 'ephemeral' }` on both first-pass and follow-up Claude calls.

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
- Status: shipped — `delay = Math.min(delay * 2, 10000)` with `pendingSinceRef` cutoff at 3 minutes (MedicalHistory.tsx ~690).

**10. src/components/dashboard/{Cycle,Mode,Pregnancy}LabInsights — Independent fetches**
- Where: Each component fetches `medical_extracted_data` independently
- What's wrong: 3 redundant SELECTs on same table, same user, same page load.
- Fix sketch: `useExtractedData()` hook with React-Query-style caching (or lift state to PatientDashboard / MedicalHistory and pass down).
- Risk class: SAFE
- Priority: P1
- Status: shipped — `src/hooks/useLabResults.ts` keeps a per-user module-level cache + subscriber set; one fetch on first mount, in-flight promise dedupe across racing mounts, onHealthDataChange invalidates+refetches and fans out to all three consumers.

**11. Insights don't auto-refresh after analysis lands**
- Where: HealthSummaryWidget, HealthTimeline, all lab insights
- What's wrong: Component state is fetched on mount; no subscription to "new analysis landed" events. User uploads → polling sees `ai_summary` fill in → but insights components were mounted before and still show stale.
- Fix sketch: Same hook as #10; when MedicalHistory completes polling, hook invalidates and re-fetches.
- Risk class: SAFE (moderate effort)
- Priority: P1
- Status: shipped — `src/lib/data-events.ts` module-level emitter; consumers subscribe via `onHealthDataChange()` and refetch when MedicalHistory / DocumentUpload emit on completion.

**12. api/ai-doctor-chat.ts:113–116 — Fragile system-message prefix filter**
- Where: Skips messages starting with `[SYSTEM CONTEXT`
- What's wrong: Content-prefix sniffing; user can't paste that string.
- Fix sketch: Add `synthetic: boolean` column or role discrimination.
- Risk class: SAFE
- Priority: P1
- Status: shipped — the prepended synthetic user message was removed entirely (AIDoctorChat.tsx:358-365 explains the deletion). The backend loads profile + last 20 docs + last 100 extracted values server-side under the session user, so no client-side context injection (and no prefix sniff) is needed. Role mapping at api/ai-doctor-chat.ts:124 handles any legacy `role === 'system'` rows.

**13. api/analyze-document.ts:391–395 — No retry on Anthropic 5xx / 429**
- Where: After `fetch(https://api.anthropic.com/...)`
- What's wrong: First transient error = analysis fails and user has to retry manually.
- Fix sketch: 3 retries with exponential backoff (250ms, 1s, 4s), short-circuit on 4xx-non-429.
- Risk class: SAFE
- Priority: P1
- Status: shipped — bounded exponential backoff helper at analyze-document.ts ~66-95 retries on `status >= 500 || status === 429`, surfaces persistent failures to the UI as documented at line 605.

---

## P2 — polish

**14. JSON parse fallback silently degrades** — api/analyze-document.ts:417–428. On malformed JSON returns a generic summary with no structured data. Should retry Claude with "return valid JSON only" or fail loudly.
- Status: shipped — `tryParseAnalysisJson` runs first; on miss, a second Claude call with an explicit "strict JSON only" message replays; if that also fails the handler returns 502 with `error: 'parse_failed'` and leaves any prior successful `ai_summary` intact (analyze-document.ts ~572-610).

**15. Duplicated `friendlyTestNames`** — in both `medical-utils.ts` and `MedicalHistory.tsx`; already drifting. Delete the duplicate.
- Status: shipped — single source of truth at `src/lib/medical-utils.ts:53`; consumer at `friendlyTitle()` line 116. The MedicalHistory copy was removed.

**16. Filename collision risk** — `upload-${Date.now()}` fallback path in upload.ts; use UUIDs.
- Status: shipped — `upload-${crypto.randomUUID()}` (upload.ts:68). Comment explains why concurrent uploads would otherwise overwrite each other.

**17. Orphaned chat messages** — `ai-doctor-chat.ts:39-43` inserts user message before streaming reply; if stream fails, orphaned message remains.
- Status: shipped — user turn is captured into `userTurnContent` but only inserted in the handler's `finally` block, paired with the assistant reply inside `sql.transaction([...])` (api/ai-doctor-chat.ts:186-206). If `assistantText` is empty (stream failed before any delta) nothing is written at all.

**18. Fire-and-forget analysis dispatch not observable** — if the /api/analyze-document request is lost in flight before Vercel receives it, nothing retries. Should store a `pending_jobs` row and have a retry worker.

**19. "Today's date" is UTC** — analyze-document.ts:98. Patient timezone not considered.
- Status: shipped — `req.body.timezone` accepted, `resolveToday(timezone)` resolves to the patient's local date with UTC fallback (analyze-document.ts:123, 132-170). Client sends `Intl.DateTimeFormat().resolvedOptions().timeZone` on every reanalysis call (MedicalHistory.tsx:790).

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

### 2026-05-23 (session 54 — deepening each life-stage mode)

Alena asked to keep improving pregnancy mode then move to other
modes, working continuously for 24h. Nine commits adding clinically
meaningful tools per mode:

Pregnancy:
- **77d944b** — Prenatal milestones checklist. 16 entries from typical
  ACOG/NICE timelines (first visit, dating ultrasound, NT scan,
  NIPT, anatomy scan, glucose challenge, Rhogam, GBS swab, hospital
  bag, full-term, induction discussion). Bucketed into "Due now /
  Coming up / Recently expected" against the current week. Category
  dots (visit / scan / lab / class / decision) + one-line "why this
  matters" per row.
- **6ecaacd** — Kick counter from week 28. ACOG 10-movements-in-2-hours
  methodology. Big tap target, runs locally (per-user localStorage),
  auto-completes at 10 with a reassuring or amber toast based on
  duration. Past-2h-without-10-movements inline warning. 14-entry
  session history with ✓/! markers.
- **104d1f6** — Maternal weight gain card. IOM guidelines: classifies
  pre-pregnancy BMI into the four categories, computes recommended
  total + expected-by-current-week gain (2-phase curve: ~1.5 kg in
  T1, then linear). Pre-fills height from the existing
  womanie_basic_info_ localStorage stash. Weight log: date + kg,
  one entry per date, recent-log strip with delta + per-row delete.

Conception (also surfaces on menstrual-cycle):
- **926a800** — BBT chart. Parses BBT entries from
  daily_health_signals.notes (DailyLogging already writes
  "BBT: 97.8°F" there but nothing ever read it back). Recharts line
  with cycle-start + ovulation reference lines. Biphasic-shift
  detection: first day of a sustained 3-day rise above the prior
  6-day rolling average + 0.2°F; reports doubling jump in plain
  language. °F / °C toggle in header.

Menopause:
- **75f40b6** — Stage tracker. Pulls the most recent period_tracking
  row, classifies (Cycling <60d / Perimenopause / Late perimenopause
  / Menopause reached) with progress bar against the 365-day clinical
  threshold. Card tone shifts amber → green as the line approaches.
  Empty-state nudge if no period logged.
- **6388f21** — Preventive screening tracker for menopause +
  post-menopause. Eight USPSTF/ACS-standard screenings with their
  cadences; per-row mark-as-done + status (overdue / due-soon /
  up-to-date / not logged), sorted by urgency. Replaces the old
  static "Schedule annual check-ups" callout.

IVF:
- **3d0c095** — Beta hCG tracker. Date + optional time + value per
  draw; computes inter-draw doubling time via t·ln(2)/ln(ratio);
  interpretation branches on latest + trend (negative / borderline
  / doubling normally / slower than typical / falling / plateau).
  Card highlighted when phase is `tww` or `beta`.

Contraception:
- **f7c823f** — 30-day pill adherence calendar. Built from the in-
  memory signals[] the dashboard already had. 30 squares, oldest
  left, today ringed in primary. Colors: green on-time, amber late,
  destructive missed, muted-grey not logged. Header reads
  "12 on-time · 2 late · 1 missed".

Cross-mode:
- **bfa868e** — CycleHistoryCard for menstrual / conception /
  contraception. Pulls last 12 months of period_tracking, derives
  cycle length from consecutive period starts (not the stored
  cycle_length, which can be stale), plots a Recharts bar chart with
  bars colored by deviation from the mean (primary ≤2d, secondary
  ≤5d, destructive outlier). Stats strip + ACOG-anchored regularity
  badge (Very regular / Mostly / Somewhat / Irregular by σ
  thresholds 2 / 5 / 8). Irregular triggers a callout pointing at
  PCOS / thyroid / stress as worth-discussing-with-doctor causes.

Continued session 54:
- **ed6433c** — Contraction timer for pregnancy ≥ week 36. Big Start
  / Stop surface with tabular-nums duration; idle state shows
  gap-since-last; last-hour stats (count, avg frequency, avg
  duration); 5-1-1 detection callout when the standard "go to
  hospital" threshold is met (≤5 min avg freq, ≥1 min avg duration,
  ≥6 contractions in window). Recent list with per-row delete, max
  50 entries. Per-user localStorage — real-time tool, no benefit to
  server sync.
- **3a6e705** — AI chat prompt suggestions are now mode-aware. The
  old code did substring sniffs on medicalContext ("pregnancy" /
  "menopause" / "abnormal") which misclassified anyone in trying-
  to-conceive / IVF / contraception / pre-menstrual / post-menopause
  modes. Now anchors on the exact `Life stage: <key>` line the
  context builder emits and picks from per-mode prompt sets — eight
  distinct sets, one per mode, each grounded in what the assistant
  actually knows from the server-side context.

### 2026-05-23 (session 53 — 24h authorization)

Alena re-authorized a third 24h autonomous arc. Began with a
direct user question — "why log in as a doctor is not available
yet?" — which uncovered a placeholder console.log on the Get
Started page's Healthcare Provider card. Eleven commits this turn:

- **44e1ade** — Healthcare Provider card on `/auth/select-type` had
  `console.log('Healthcare Provider signup - Coming soon')` as its
  onClick (placeholder), so clicking it did nothing visible even
  though `/auth/doctor-signup` has been live for months. Wired the
  card to navigate; added an "Already have an account?" row with
  Patient/Doctor login links; added "Are you a doctor?" cross-links
  on PatientLogIn + PatientSignUp.
- **698844f** — Forgot-password links: doctor login fired a "Coming
  soon" toast; patient login had no path. Both now mailto:
  support@womanie.info with subject + body pre-filled. Real path
  until email reset infra exists (HANDOFF).
- **ca57607** — AI chat: model selection persists to
  localStorage(`womanie_chat_model`). Doesn't reset to Haiku on
  every page load anymore.
- **4695942** — ErrorBoundary forwards caught errors to Sentry with
  the React componentStack. Render crashes now reach the dashboard
  instead of just console.error.
- **43c36bc** — Copy button on each assistant chat message. Sits
  bottom-right of the bubble, fades in on hover, flips to "Copied"
  with a checkmark for 1.5s. Skips the welcome boilerplate and
  empty streams.
- **48c76ea** — PatientDetails: dropped four unused lucide-react
  imports (User, Eye, Download, Clock). Cosmetic — Lucide is
  tree-shakable so no bundle impact.
- **edbf80e** — AppointmentTodayBanner kept disappearing the moment
  a visit started because it queried `?upcoming=true` (server filter
  is scheduled_at >= NOW()). Now fetches full history + filters
  client-side to today AND scheduled_at + duration > now, so the
  banner stays through the entire visit window.
- **611beb6** — Doctor-side counterpart: DoctorTodayBanner used to
  show 9am visits at 5pm because it only filtered on isToday.
  Added the same duration-elapsed check.
- **fb2ea99 → 755f81e** — DocumentUpload: first commit accepted any
  image type (HEIC, etc) at upload, second commit walked it back
  because Claude vision can't read HEIC — silent-fail-at-analysis
  is worse than a clear early reject. Accepts JPEG/PNG/WebP/PDF/
  DOCX; HEIC gets a friendly "change iPhone Settings → Camera →
  Formats" hint.
- **c9a3cb9** — HANDOFF.md picks up three deferred items:
  server-side HEIC decoding, auto-create pending connection on
  booking, access audit log table.

### 2026-05-20 (session 52 — continuous, no scheduled breaks)

Alena asked to drop the scheduled-wakeup pacing and work straight
through. Four commits:

- **c5ef9d6** — AI Doctor Chat export as markdown. Patients often want
  to share a chat thread with their actual clinician; until now the
  only way was a screenshot, losing the structure Claude usually
  returns (headings, lists, bold). Download button next to Clear chat
  writes a `text/markdown` blob with title + timestamp + model + a
  medical-advice disclaimer up top, then each turn as `## You` / `##
  Assistant` separated by horizontal rules. No new endpoint —
  client-side from in-memory state.
- **019f1be** — Doctor sees patient-initiated cancellations at the
  top of /doctor/dashboard. Symmetric to the patient surface on
  Notifications. `DoctorCancellationsBanner` filters appointments for
  status='cancelled' within 7 days, excludes doctor-initiated rows
  (the "Cancelled by doctor:" prefix), and sorts desc. Each row has
  an × that localStorage-dismisses (per-user). Hides itself when
  there's nothing recent.
- **6087bf5** — Doctor profile editor on the Settings tab. Until now
  bio / specialty / years_experience / languages were settable only
  at signup — after that the profile was frozen even though those
  fields are exactly what patients see on FindDoctor. New form
  reads + writes doctor_profiles directly (user_id ownership lets
  /api/db handle it; no new endpoint). Validates years 0–80 before
  the round-trip; empty inputs land as null so card "if (value)"
  guards still hide unset fields.
- **6045f44** — Avatar upload extends the profile editor. PUTs to
  /api/upload with a `<userId>/avatar-<uuid>.<ext>` pathname (passes
  the existing session-scoped check), validates JPG/PNG/WebP + 5 MB
  cap client-side, persists avatar_url to doctor_profiles
  immediately on success (independent of the Save button below) so a
  mid-edit refresh keeps the new photo. Remove button confirm-
  prompts and nulls the column. FindDoctor picks up the new image
  via the existing avatar_url render — no client change there.
- **540e994** — App: lazy-load all marketing + auth + onboarding
  pages. The initial bundle eagerly imported Product / ForPatients /
  ForDoctors / About / Pricing / Blog / Welcome / Community plus the
  auth and onboarding flows — pages a returning logged-in user
  landing on /dashboard never sees but still paid for. Converted to
  `lazy(() => import(...))`. Build impact: index chunk 731.84 kB →
  506.82 kB (-30%, -58 kB gzipped on the wire). MedicalHistory's
  577 kB chunk is the next target — its recharts deps want their own
  boundary, but that's a heavier refactor.
- **dad533e** — Doctor's "N new" upload pill on the connected-
  patients list now opens that patient's Documents tab directly.
  Previously it was a non-interactive div — to actually see those
  docs the doctor had to click View Details, then click Documents.
  PatientDetails picks up a new `?tab=` deep-link param (validated
  against the known tab list, stripped on consume) so the badge
  routes the doctor exactly where they wanted to go in one click.

### 2026-05-19 (session 51 — continuing 24h arc, +5 more)

- **058e7b7** — GDPR /api/me/export now includes appointments and the
  doctor notes flagged is_visible_to_patient. Internal-only doctor
  notes stay with the doctor.
- **7fa4481** — FindDoctor: Sort Select (Name / Highest rated / Most
  experienced / Price low→high). Data already on every row from
  /api/doctors/list (4590abe); just needed the sort path.
- **d1e44a2** — /dashboard/profile redirects to /dashboard/settings
  instead of /onboarding/basic-info. The wizard was wrong as a
  "where do I edit my profile" destination once Settings absorbed
  those fields.
- **0f099a4** — Doctor overview stat tiles (Total Patients, Upcoming,
  This Month, Pending Requests, Consultation) are clickable now and
  route into the appropriate tabs. Quick-Actions row was already
  navigable; the stats below it were not.

### 2026-05-19 (session 50 — 24h autonomous arc, +7 more)

Alena re-extended to 24h after session 49. Seven more commits:

- **43752ef** — Extracted callAnthropicWithRetry into
  api/_lib/anthropic.ts. summary/generate + summary/panel now use the
  same 250ms → 1s → 4s backoff that analyze-document had since
  session 13.
- **7d4a8c2** — ai-doctor-chat: retry the initial Anthropic
  connection on 5xx before opening the stream. 429 / 402 still
  short-circuit. Once the stream opens it runs untouched.
- **0de7681** — db client shim: replaced "Use Clerk for
  authentication" error strings (leftover from the Clerk → JWT
  migration) with pointers to the actual /api/auth/* endpoints.
- **d8a51e5** — Health Statistics page now has a Download CSV button
  that exports current_extracted_data with title / value / unit /
  range / status / type / date / source document / notes as an
  RFC-4180 CSV. Button hides itself when there are no lab results.
- **fd1c027** — FindDoctor booking-success toast picked up a View
  button that routes to /dashboard/appointments. Matches the
  doctor-side "Add visit note" toast-action pattern.
- **70caa5f** — Patient appointment cancel: removed the misleading
  "this can't be undone" copy from the confirm dialog and added a
  real Undo button on the toast that flips status back to
  'scheduled'. Wired in both UpcomingAppointments (dashboard card)
  and the full /dashboard/appointments page.

### 2026-05-19 (session 49 — continuing autonomous arc, +6 commits)

Alena re-extended the autonomous mandate to 24h after session 47.
Six more atomic improvements, all pushed:

- **800e596** — Patient appointments page: filter past list by status
  (All / Completed / No-show / Cancelled / Unresolved). Chips with
  zero count hide; appears only when > 3 past rows.
- **4c10cbb** — Doctor overview Recent Activity rows are clickable
  buttons that navigate straight to /doctor/patient/:id. Saves two
  taps per "open this chart."
- **3db79ab** — Same-window data loop: DailyLogging emits
  health-data-change after a save; CycleCalendar subscribes. So
  logging a daily signal lights up SymptomPatternsCard, attention
  badge, GettingStarted, etc. without a refresh.
- **6e0dc69** — Extended the loop to CycleCalendar's four mutation
  paths (start/end/remove period, save signal) and IVFTracker's
  three (add/toggle/delete event). Both also subscribe so changes
  from elsewhere refresh the local view.
- **c610617** — Doctor's notes list: search + type filter when notes
  count exceeds five. Search hits title + content; type narrows to
  Observation / Diagnosis / Recommendation / Follow-up.
- **acf6200** — Doctor's documents tab: search + category filter
  with the same > 5 threshold. Search matches filename,
  ai_suggested_name, and ai_summary. Category Select is derived from
  the patient's actual document_type values.

### 2026-05-19 (session 48 — doctor-initiated cancellation)

The doctor-side appointment flow could mark visits Completed or
No-show but had no way to say "I can't make this one." If something
came up the doctor would either cancel via a backend call or just
ghost — both leave the patient guessing.

Code landed across three commits whose titles don't fully describe it
(cross-session interleave), but the working flow is:

- **800e596** (in addition to its stated patient-side chip filter)
  introduced the doctor-side `cancelByDoctor(apt)` in DoctorDashboard
  upcoming-appointments list. Confirm-with-reason prompt; required
  reason ("Add a short reason so the patient understands why"); updates
  status='cancelled' and notes=`Cancelled by doctor: <reason>`. New
  Cancel button next to Open chart on each upcoming row, disabled
  during the round-trip. Same commit expanded /api/me/appointments to
  return the `notes` column so the patient side can read it.
- **4c10cbb** (in addition to its stated Recent Activity click target)
  renders the parsed reason on the patient's `/dashboard/appointments`
  page. New `doctorCancelReason()` extracts the prefix; cancelled rows
  with a matching prefix show a small destructive-tinted pill under
  the consultation type with the doctor's exact reason. Patient-
  initiated cancellations (no prefix) render nothing extra, so the
  hint only appears when there's something to say.
- **6e0dc69** (in addition to its stated cycle/IVF emit work) added
  the Notifications-page surface + bell-badge count. `useAttentionCount`
  switched to the full appointments fetch and derives both upcoming +
  `recentDoctorCancellations` (14-day window, prefix-filtered) from
  one round-trip; the new count rolls into the bell-icon total.
  Notifications page picks up a destructive-tinted card listing each
  cancellation with doctor name, time, reason in italics, and a
  one-click "Rebook" button that jumps to FindDoctor. Patient-
  initiated cancellations are silent (no badge increment, no card)
  because the patient already knows about their own cancellations.

### 2026-05-19 (session 47 — closing wave)

- **c835fbc** — `/api/auth/me` falls back to `profiles.full_name`
  when the JWT-cached `name` is blank. A user who signed up without a
  name and added it via the inline form (f37709f) had a stale JWT;
  Welcome / header dropdowns still said "Welcome, there." Fixed
  with a one-row lookup on cache miss; best-effort, doesn't fail the
  request on error.

### 2026-05-19 (session 46 — continuing autonomous arc, +5 more)

- **6d17f05** — Capped unbounded result sets on three history endpoints
  (/api/me/appointments history mode, /api/me/doctor-notes,
  /api/doctors/connections). Defensive — payloads can't run away on
  power users.
- **03f4af5** — AI chat suggestion chips now include "What should I
  prepare for my next appointment?" and "Explain my doctor's latest
  note in plain language" when the context block has them (see
  b9fb27f).
- **102807d** — Doctor's Connected Patients list picked up a search
  box that appears only when patient count > 5. Matches name, life
  stage, and patient_id short-prefix; respects the recent-activity
  sort.
- **fa5a9f6** — Doctor-connection cards (PendingConnections /
  ConnectedDoctors / DoctorNotesCard) emit + subscribe on
  onHealthDataChange, so approve/revoke updates the other lists
  without a reload.
- **e042fdc** — Three product-judgment items deferred to
  .planning/HANDOFF.md: the no-op newsletter form in Footer,
  marketing claims on TrustSecurity, and the missing single-step
  patient reschedule flow.

### 2026-05-19 (session 45 — continuing autonomous arc, +8 commits)

Continuation of session 43. Eight more commits, all pushed:

- **a1744c9** — Doctor's overview added a "This Month" stat tile —
  completed-visit count for the calendar month, with a quiet no-show
  number appended when > 0. Computed from the already-loaded
  appointments[]; no extra query.
- **cd8990e** — Doctor's Lab Results: All Results section swapped flat
  list for a By Panel grouping. api/doctors/patient now returns
  raw_data so the panel field surfaces; groups sorted by row count,
  "Other" last, 30-row cap per group with a "+ N more" hint.
- **baf3a68** — Client-side AI doctor chat context picked up upcoming
  appointments + visible doctor notes (intent was right but doesn't
  reach Claude — see b9fb27f follow-up).
- **b9fb27f** — Server-side fix-up: api/ai-doctor-chat now joins
  appointments + doctor_profiles for upcoming visits and doctor_notes
  for visible notes, surfacing them in the system prompt under
  "## Upcoming Appointments" and "## Doctor Notes (visible to
  patient)". Claude can finally answer "what should I bring on
  Tuesday?" with grounded context.
- **062db3e** — Print Health Record now includes the visible doctor
  notes (up to 10) between Flagged Findings and Documents. A patient
  walking a printout into a second-opinion visit no longer hides
  everything their first doctor told them.
- **4590abe** — FindDoctor cards surface title (Dr / Prof / MD), years
  of experience, rating + review count, languages, and additional
  specialties. /api/doctors/list already returned all of this; the UI
  just wasn't using it.
- **4823b70** — FindDoctor search now also matches languages and
  secondary specialties so "german" / "PCOS" / "thyroid" return
  doctors who fit. Empty query short-circuits.
- **d44c510** — Sidebar leads with My Profile / Appointments /
  Notifications / Settings. Appointments entry carries a primary-
  tinted pill showing the count of upcoming consultations. Added
  upcomingAppointments to useAttentionCount but kept it out of the
  bell total — upcoming visits are informational, not attention.

### 2026-05-19 (session 44 — dashboard per-mode polish)

Alena asked "can you improve dashboard? for different types" — four
commits making the dashboard read like it knows who's looking at it:

- **85ac504** — `ModeHeroStat` is a slim "today at a glance" card at
  the very top of /dashboard. Each life stage gets distinct content
  and tinting: cycle day + phase + days-to-next for menstrual/conception;
  pill streak (parsed from daily_health_signals notes) for contraception;
  phase label + tracking day for IVF; week + trimester + due date math
  for pregnancy; days-since-last-period + hot-flash count for menopause;
  readiness % from local checklist for pre-menstrual; static wellness
  framing for post-menopause. Empty states are seed prompts, not stale
  placeholders.
- **1ce6284** — The comment on quickLinks claimed "Context-aware quick
  links based on life stage" but every mode showed the same four tiles.
  Doctor-search slot's label now nudges toward the right specialty —
  "Find OB-GYN" / "Find fertility specialist" / "Find menopause
  specialist" / "Find gynecologist" — while the destination stays the
  shared FindDoctor page.
- **79cbde9** — Daily Reminders card was gated on `stageTips[selectedMode]`
  but the dictionary only had four modes filled in. Users on
  pre-menstrual / contraception / IVF / post-menopause silently saw no
  reminders card at all. Filled in the missing four with mode-appropriate
  content (pill timing + STI reminder for contraception; injection
  cadence + hydration for IVF; DEXA + cardio screening for post-
  menopause; first-period age + prep-kit advice for pre-menstrual) and
  bumped the existing four to four tips each for symmetry.
- **f37709f** — Profile-completion banner used to route users to
  /onboarding/basic-info — but that form only collects DOB / height /
  weight / blood type, no name field. Users would walk through it, come
  back, and the banner would still be sitting there because
  profile.full_name still wasn't set. Replaced with an inline form: one
  input, one Save button, upserts profile.full_name through /api/db,
  banner self-dismisses, dashboard greeting at the top updates without
  a refresh.
- **863d88b** — `GettingStarted` checklist's "Add your name" step
  still pointed at the same broken /onboarding/basic-info route, so
  even with the new inline banner above it, the step's CTA dragged
  users back into the dead loop. Changed the step's ctaHref to a hash
  anchor `#name-banner`; click handler treats hash hrefs as
  scrollIntoView calls instead of routes. Name banner picks up
  `id="name-banner"` + `scroll-mt-24` so the sticky header doesn't
  cover it. Description copy now reads "Use the 'What should we call
  you?' box above to fill this in" so the action is unambiguous.

### 2026-05-19 (session 43 — autonomous arc)

Alena re-authorized 8 hours of autonomous work after session 42. Six
commits this stretch:

- **e5bd214** — Doctor-note badge on the Notifications bell.
  useAttentionCount picked up a new field, recentDoctorNotes, counting
  visible notes written in the last 14 days. Total feeds AppSidebar
  bell dot + PatientDashboard dropdown pill. Notifications page now
  includes DoctorNotesCard so the badge lands on a real consumer.
- **63cb84d** — Appointments could only go scheduled → cancelled.
  Doctor's Appointments tab now offers Mark completed / No-show on
  past appointments still in scheduled state, with quiet Undo on
  resolved rows. Status pills tint green / amber. Patient-side
  Appointments page picks up matching pills.
- **caef89d** — Dead "Join Call" / "Start call" buttons on
  DoctorDashboard + DoctorTodayBanner had no onClick (Womanie doesn't
  run video infrastructure). Relabeled to "Open chart" and wired to
  /doctor/patient/:id so the click does the thing a doctor actually
  needs at appointment time.
- **44a5fcb** — Doctor's connected-patients list now surfaces patient
  activity: /api/doctors/connections LATERAL-joins health_documents to
  return last_upload_at + recent_doc_count (14-day window). Dashboard
  sorts by approved → recent count → last upload → created. Each row
  shows "Last upload <relative>" and patients with new uploads get a
  small amber "N new" pill.
- **5b0f430** — Doctor's documents tab renders ai_summary through
  react-markdown so the existing structure (📋 Key Takeaways,
  ⚡ Action Items, 🔗 Cross-Referenced Patterns) is finally readable.
  Document title prefers ai_suggested_name where Claude proposed
  something clearer than the original filename.
- **12a2ab6** — One-click follow-up after a visit. "Mark completed"
  toast now carries an "Add visit note" action button that navigates
  to /doctor/patient/:id?addNote=visit&date=<iso>; PatientDetails
  consumes those params, jumps to the Notes tab, opens the new-note
  form, and pre-fills the title with "Visit on <date>". Query is
  stripped on consume so a refresh doesn't re-trigger.

### 2026-05-19 (session 42)

- **2781efb** — Patient dashboard now surfaces doctor notes that have
  been marked visible. When a doctor writes a note on PatientDetails,
  the "Visible to patient" toggle defaults on, but the patient had no
  consumer for it — note sat in the DB, patient never saw it. New
  `DoctorNotesCard` on PatientDashboard shows visible notes with
  doctor name + avatar + specialty, the note title + type chip
  (diagnosis / treatment / recommendation / observation), relative
  time, and the content (line-clamped at 3 with Show more when
  longer). Hides itself when there are none. Supporting
  `/api/me/doctor-notes` endpoint joins `doctor_profiles` server-side
  because `doctor_notes` is owned-by-doctor in `/api/db`'s ownership
  map — patients can't reach the row through the generic router.
  Smoke flow asserts 401 unauth.

### 2026-05-19 (session 41)

- **5697d11** — Doctor's patient view: finished the half-built Lab
  Results tab. A previous session had added the tab trigger +
  threaded `medicalData` through from `/api/doctors/patient`, but the
  TabsContent block was never written — clicking the tab landed on
  empty space. New `LabResultsView` subcomponent renders a Flagged
  section sorted by status severity (critical → high / low / abnormal
  → borderline) and recency, then an All Results card with everything
  newest first. Each row shows status pill, value+unit, reference
  range, date, and source document name. Search input filters by
  title or notes; All Results caps at 200 with a hint to narrow with
  search.

Doctor + auth flow polish (closes the "signup polish + doctor note
edit/delete" candidates from last tick):
- **85d0593** — `PatientDetails` clinical notes were insert-only. Each
  note row now has Edit and Delete buttons. Edit replaces the
  read-only display with an inline form reusing the same
  title/type/visibility/content fields as the new-note form (only one
  note is editable at a time). Delete is confirm-gated. Both routed
  through /api/db — `doctor_notes` is owned by `doctor_id`, so the
  generic router pins updates and deletes to the calling doctor.
- **ca85396 / efec0d0 / b9d224d** — Password strength meter. PatientSignUp
  rejected <8-char passwords but gave no mid-typing feedback between
  "password" and "X9q!Lv#tw&8Aer". Added a 5-tick bar with five tiers
  (Too short / Weak / Fair / Good / Strong) under the field. Extracted
  the heuristic into `src/lib/password-strength.ts` (`scorePassword`)
  so the same meter shows up on Settings → change password and on
  DoctorSignUp. The doctor surface also had a `password.length >= 6`
  client check while the server enforces 8 — bumped both to 8 so the
  step-2 button doesn't let users through to a guaranteed 400.

### 2026-05-14 (session 35)

- **352ef2e** — `UpcomingAppointments` card on PatientDashboard. Patients
  could already book through FindDoctor but had nowhere to see the
  appointment after — it landed in the DB and disappeared from their
  view. New card lists the next three upcoming consultations with
  doctor name + avatar, time, type chip (video / in person), and an X
  to cancel. Hides itself when there's nothing upcoming. New
  `/api/me/appointments` endpoint joins appointments with
  `doctor_profiles` server-side (patients can't read other doctors'
  profile rows via /api/db). Smoke flow asserts 401 unauth.
- **ac579ed** — DoctorDashboard fix-up: missed bit of the prior
  `patientNameFor` patch — applied it to the inline appointment list
  on the Overview tab and to the AppointmentsView upcoming/past lists
  so every appointment row reads "Alice Smith" instead of the literal
  "Appointment" label.

Note: the `352ef2e` commit message describes only the
DoctorDashboard polish, but its diff actually contains the whole
UpcomingAppointments feature. A parallel session collided on the
commit at 00:48; the content is sound, only the message is misleading.

Remaining open after session 35:
- All ongoing HANDOFFs (schema for emergency contacts / notification
  settings / pending-jobs table / cross-doc trend table; admin email
  on doctor signup; real rate-limit bucket).
- IVF phase day vs tracking day (schema work).
- BBT / LH trapped in `notes` text (schema work).

Next-session candidates:
1. Past-appointments page so users can see their consultation history
   (the endpoint already returns historical rows when `upcoming` is
   omitted; just needs UI).
2. Email confirmation when a doctor confirms / cancels an
   appointment (currently the patient only sees status flip on
   refresh).
3. Reminder banner the day of a scheduled appointment.

Late session 35 additions (auth + doctor flow polish):
- **b393e5d** — Change password from Settings without an email round-trip.
  New `/api/auth/change-password` verifies current password against
  bcrypt hash, requires ≥8 chars and different from current, updates
  `auth_users`, and revokes every OTHER session so a stolen old-password
  device gets booted. Rate-limited 10/24h per user. Google-only accounts
  rejected up front. Forgot-password (email reset) still missing — needs
  email provider + tokens table chosen.
- **f57122a** — Notification toggles in Settings now actually do
  something. New `useNotificationPrefs` hook reads the same per-user
  localStorage key the Settings page writes, re-reads on focus +
  storage event so a flip in another tab takes effect immediately.
  Wired `healthTips` to hide the "Daily Reminders" tip card on
  PatientDashboard and `cycleReminders` to gate the late-period alert
  in TodayStatusCard. `appointmentReminders` is preserved with no
  surface yet.
- **f803726, ac579ed, 352ef2e** — Doctor side saw every patient as
  "Patient #abc12345" because `/api/db` can't join across tables and
  doctors aren't owners of `profiles` rows. New `/api/doctors/connections`
  endpoint LEFT JOINs profiles and returns name + life_stage; the
  PatientConnection lookup is reused via `patientNameFor()` across all
  three appointment lists so the overview / upcoming / past tables show
  real names. Falls through to the old query if the endpoint fails so
  the list still renders.
- **44b6a85** — FindDoctor was offering already-booked slots. New
  `/api/doctors/availability?doctor_id&date` returns the times +
  durations of non-cancelled appointments for that day (no patient
  identity leaked). Booking dialog refetches on (doctor, date) change
  and filters slots via interval-overlap math; past slots that have
  already started are also hidden. Footer reports how many slots are
  suppressed.
- **91f0c2d** — Closed the residual booking race. New
  `/api/appointments/book` does `INSERT … WHERE NOT EXISTS (overlapping)`
  in one round-trip so a same-slot collision returns 409 instead of
  writing a duplicate row. Validates doctor existence + is_verified +
  is_available + non-past. FindDoctor surfaces the server's exact
  message ("This slot was just taken by another patient") rather than
  the old generic toast.

Open follow-ups from this group:
- Forgot-password / email reset (needs email provider).
- Server-side rate limit + audit logging on /api/appointments/book if
  it ever becomes a load target.

Appointments-pass continued (closes the previous session's candidates 1
and 3, plus an unplanned calendar-export):
- **ccfe890** — `/dashboard/appointments` page lists upcoming + past in
  one round-trip (the /api/me/appointments endpoint already returns
  everything when called without ?upcoming=true). Upcoming ascending,
  past descending up to 50; cancelled rows stay in Past with a
  "Cancelled" badge and dimmed opacity; cancel button only on
  non-cancelled upcoming rows. UpcomingAppointments card's overflow
  and the new "See all appointments" link both land here.
- **674e02c** — `AppointmentTodayBanner` is the surface
  `appointmentReminders` was missing. Prominent card at the top of the
  dashboard when an appointment is scheduled for today; gated by the
  notification toggle. Imminent (±15 min) boosts to "Starting soon" with
  a Join call button on video consults; past-start-still-in-progress
  reads "in progress" instead of a stale negative duration. Re-ticks
  once a minute so the countdown stays accurate without a refresh, and
  resubscribes to onHealthDataChange so a cancel elsewhere makes it
  disappear.
- **f251c2d** — Add-to-calendar .ics export on each upcoming row.
  RFC 5545 one-event VCALENDAR with doctor name, time, duration, type,
  and a 15-min DISPLAY alarm; UTC-stamped so the consuming calendar
  applies local timezone instead of us baking it in. Apple Calendar /
  Google Calendar / Outlook all consume the same file.

Doctor flow + onboarding fixes (next-tick candidates from the previous
list — all three closed):
- **c125a52** — `DoctorTodayBanner` is the symmetric of
  AppointmentTodayBanner on the doctor side. Lists every non-cancelled
  appointment scheduled for today at the top of /doctor/dashboard with
  patient name (via the existing patientNameFor helper), time,
  countdown, and consultation type. Imminent slots boost to "Starting
  soon" with a "Start call" button on video consults; in-progress
  reads correctly. Reuses the in-memory appointments + patients arrays
  the dashboard already loads — no extra round-trip.
- **cd476a4** — Verification banner used to claim every non-approved
  doctor was "pending verification, some features may be limited"
  even when the status was `rejected` or `revoked`. Now branches on
  the actual status with distinct copy and a destructive palette for
  the bad cases — both point users at support@womanie.info with a
  specific next step.
- **100fb1d** — **Onboarding answers were being dropped on the floor.**
  The three-screen flow (basic info → life stage → mode setup) stored
  everything in OnboardingContext + localStorage, then OnboardingSuccess
  called resetOnboarding() and navigated to the dashboard. The DB write
  step was simply missing. Users landed on a blank dashboard with no
  period data and the wrong life stage. New `commitOnboarding()` helper
  runs on success-page mount: writes profiles.life_stage (mapped from
  the broad onboarding stage + regular-cycle main-focus combo onto the
  eight dashboard modes), profiles.pregnancy_due_date (derived from
  due-date / last-period + 280d / current-week + remaining), and seeds
  a period_tracking row from the reported last-period start and cycle
  length. DOB / height (cm) / weight (kg) / blood type park in per-user
  localStorage since profiles doesn't have those columns yet — when
  schema lands, swap the localStorage path for an /api/db upsert
  without touching callers. Button shows a "Saving your answers…"
  loading state during the commit.

### 2026-04-25 to 2026-04-28 (rolling autonomous arc)

Document analysis + presentation (post session-34): personal ranges on PanelDetail (`4dac5fa`), AI panel insight endpoint + card (`8bec07e`), single-doc print view (`dec2f65`), audit of pregnancy week-by-week measurements + ranges (`785da70`), favicon + Lovable-leftover icon cleanup (`4dafe08`, `fb92049`), HealthStatistics stat cards (`8b51706`), full-record print view (`db5a143`), doc-list search (`2f74221`).

Menstrual cycle (Alena flagged "period of bleeding is too long"):
- **425c6b4** — calendar caps active-period bleeding at predicted_end + 2 days. Forgotten un-ended periods no longer balloon visually through every day to today.
- **c38e38a** — banner now alerts the moment rendering stops (predicted_end + 2 instead of +5), no silent gap.
- **011085a** — TodayStatusCard's `isOnPeriod` reads the actual period record's confirmed end, not just `cycleDay <= avgPeriodLength`.
- **c432d73** — cycle-phase label card on TodayStatusCard (Menstrual / Follicular / Fertile window / Ovulation / Late luteal · PMS likely / Luteal). Plus an ordinal-day-of-cycle fix that was writing "21th" / "22th" / "23th".
- **78c3723** — calm "your period is late by N days" alert above the phase card when today is past the predicted period start by more than the confidence window. Hidden when a period is active.

Closed both follow-ups this session:
- **6bbc44b** — DayActionSheet now offers an inline "Ended <day>" button when you tap a day inside the active period range. Today/yesterday get the natural labels; older days say "Ended Apr 22". Days before the period started or in the future show an explanation instead of an action.
- **1eba692** — `SymptomPatternsCard` on PatientDashboard for menstrual / pre-menstrual / conception modes. Walks every logged signal in the last 6 months, classifies each by cycle phase relative to the owning period record, shows top 4 symptoms + top 3 moods per phase as "logged on N of M tracked days." Hidden until at least 3 logged days exist.

"Other types of cycles" arc — covered all 8 modes by the end:
- **0e12c2f** — `FertileWindowTimingCard` for conception mode. Walks the last 3 completed cycles, draws each as a horizontal timeline (period band, fertile window, ovulation marker, intercourse dots color-coded protected/unprotected). Top stat counts unprotected intercourse logged inside the fertile window. Doesn't penalize active cycles.
- **02ea46a** — `ContraceptionDashboard` was a UI mock — selected method, pill streak, pack day, side-effects all reset on refresh. Now persists prefs to localStorage scoped by user.id, computes pill streak from real `daily_health_signals` rows (parsing the same "Pill: on-time / late / missed" segment `DailyLogging` already writes into notes — so the two surfaces never disagree). Three logging buttons (took on time / took late / missed) plus "Start a new pack" stamp.
- **c9c78ff** — `MenopauseDashboard`: same mock-state problem, plus an unwired doctor-chat CTA. Tracked symptoms + myth carousel position now persist to localStorage scoped by user.id × `isPostMenopause` flag (so the two scopes don't collide). New hot-flash trend card on the menopause view reads the user's last 30 days of signals and parses the existing `Hot flashes: N` segment from `DailyLogging`. Doctor-chat CTA actually navigates now.
- **bd62278** — `PreMenstrualDashboard`: readiness checklist + "did you know?" carousel position now persist to localStorage. Was losing both on every refresh.
- **a02019f** — `IVFTracker`: header showed "Day 47 • Duration: 8-14 days" while the user was past day 14 because the day count was actually journey day, not phase day. Re-labeled "Tracking day N • Typical: …" so the relationship is unambiguous.

Remaining open:
- The notes-segment trick for structured pill / hot-flash state works but the right long-term shape is dedicated columns (`pill_status`, `basal_temp_f`, `lh_test`, `hot_flash_count`) — that needs a migration. Without one, BBT and LH stay trapped in notes text, unreadable by the app.
- IVF could store per-phase start dates so "tracking day" can become "phase day" — also wants schema work.
- All ongoing HANDOFFs.

### 2026-04-25 (session 34)

Alena said "do all and don't stop" so this session ran through the queued items + kept going.

- **be99a67** — Panel deep-dive page at `/dashboard/panel/:slug`. Click a panel name on HealthStatistics's by-panel chart → see every reading in that panel across every uploaded doc, grouped by canonical title with per-test ResultSparkline + a 6-row history list (date · value · status · doc deep-link). Header has count summary + "Ask AI" with a panel-specific prefilled question. Title + unit normalization is what makes this work cleanly across docs.
- **5e8bb14** — Per-doc panel grouping. The flat in-range list inside an expanded doc now groups by `raw_data.panel` with a "CBC · 12" header per group + a "View panel →" link to the deep-dive. Panels with most rows sort first; "Other" lands at the bottom.
- **f1a2fec** — System prompt tightening: new "EXTRACTION DISCIPLINE (READ FIRST)" section at the top of `STATIC_RULES` with 9 directives (extract every value, never infer, verbatim numbers, standardize titles only, ISO dates, specific notes, status mapping). Caches with the rest of `STATIC_RULES`; local `llm_cache` invalidates naturally on rules change.
- **ed4e4b7** — `OverdueTests` card on PatientDashboard. For tests the patient has tracked at least twice but where the latest reading is 12+ months old, surface them so a real gap doesn't go invisible. Each row deep-links to the panel deep-dive when the test has a panel; footer button hands "which to recheck" to the AI doctor with a prefilled question.
- **949a1a2** — Filter chips on the My Documents list (All / Flagged / Lab results / Imaging / Prescription / Notes). Inline counts; chips that resolve to 0 hide; whole row hides when ≤3 docs.

Remaining open after session 34:
- Personal range / personal baselines on panel deep-dive (median + p5/p95 of user's history vs. the lab's healthy range).
- Per-doc print/share-friendly view.
- Per-panel Claude narrative on the panel deep-dive page.
- All ongoing HANDOFFs.

Next-session candidates:
1. Personal-range mini-block per test on PanelDetail.
2. AI panel summary on PanelDetail (Claude call hashed by user+panel).
3. "Print this analysis" view (single doc, clean layout).

### 2026-04-25 (session 33)

Continuing the document-analysis "all three buckets" arc.

- **fe382fc** — Per-doc "Read this first" hero card on the expanded view. Top 3 flagged findings sorted by severity → AI-priority → recency, each with friendly name + value + ref range + AI note + an inline Ask button. Hides for benign docs.
- **2718951** — `/dashboard/compare?a=<id>&b=<id>` paired-diff view. Pairs every lab value by canonical title (the f89fb8d normalizer makes this safe), classifies each as both / a_only / b_only, computes a status shift, sorts worsened-first, tints rows by direction, header counts ("2 worsened · 5 improved · 1 new in B"), Ask AI button at the top hands the comparison to Claude. Entry from Medical History via a new "Compare to…" dropdown on each expanded doc.
- **763e092** — Unit-notation normalizer pairs with the title one. Collapses μ vs µ vs mc vs u, recases mL / dL / L / mIU / IU / mEq segments, strips spaces around `/`. Applied on write to `medical_extracted_data`; the existing `/api/me/normalize-titles` backfill endpoint now does both passes in one call with separate counts. Settings button relabelled "Clean up test names + units". Raw unit preserved in `raw_data.raw_unit`.

The "all three buckets" pass has now landed at least one substantive piece in each bucket: extraction (titles + units), per-doc presentation (Top 3 hero, ValueGauge zones, sparklines, Ask), cross-doc (compare-two-docs). Plus the surrounding polish from earlier sessions (deep-link Ask, RecentFindings, HealthTrends, NewDocInsights, WeeklySummary all already in place).

Remaining open after session 33:
- Panel deep-dives: click a panel name (CBC / Thyroid Panel / etc.) → see every reading across all docs, grouped + sparklined. Cross-doc bucket continuation.
- Strengthen the system prompt to never summarize tables. Extraction quality bucket continuation.
- All ongoing HANDOFFs.

Next-session candidates:
1. Panel deep-dive page `/dashboard/panel/:slug`.
2. System prompt tightening + add `confidence` field to extracted_data.
3. Per-doc panel-grouped layout (CBC / Thyroid / etc. visually grouped instead of flat list).

### 2026-04-25 (session 32)

Alena asked for "all three buckets" of document-analysis improvements (extraction quality, per-doc presentation, cross-doc views). Working through them in dependency order.

- **8e03dc5** — sparklines on per-doc result cards. Tiny SVG trendline next to each abnormal/critical ResultCard when ≥2 readings of the same test exist; latest point bigger and stroke-coloured by current status. Plus an "Ask about this" button that deep-links into AI Doctor Chat with a pre-filled "Can you walk me through what my <doc name> results mean?" question. Closes a presentation-bucket item.
- **f89fb8d** — extraction-quality bucket: canonical title normalization. New `api/_lib/normalize-test-title.ts` aliases ~250 surface forms (Hb / Hgb / Haemoglobin → Hemoglobin, FT4 → Free T4, etc.) into ~100 canonical names. Applied at the `medical_extracted_data` INSERT site. Without this every cross-document feature was quietly missing connections any time Claude phrased a test differently between two uploads. Raw title preserved in `raw_data.raw_title` for audit / future backfill.
- **b548725** — backfill: `POST /api/me/normalize-titles` runs the same map over the user's existing rows. Idempotent. Triggered manually from a "Clean up test names" button under Settings → Download my data. Toast reports renamed-of-scanned counts. Without this, the alias map only helped *new* uploads.
- **064a1cb** — presentation-bucket polish: ValueGauge picked up a 3-zone bar (under-range red / in-range green / over-range red) plus a "12% below" / "32% above" deviation label for out-of-range readings. The marker is plotted at its real position now, so abnormal-high vs critical-high are visibly different rather than both clamping to the right edge.

Remaining open after session 32:
- Extraction quality #2: strengthen the system prompt to never summarize tables (always extract every value). Could also add unit normalization (μg/L vs mcg/L).
- Presentation #2: per-doc "Top findings" hero card; panel-grouped layout in expanded view.
- Cross-doc: dedicated compare-two-docs view; panel deep-dives.
- All ongoing HANDOFFs.

Next-session candidates:
1. Unit normalization (paired with title normalization — μg/L vs mcg/L vs ng/mL grouping).
2. Per-doc "Top 3 findings" hero at the top of the expanded view.
3. Compare-two-docs view (pick A and B, show paired diffs).

### 2026-04-24 (session 31)

- **4dafe08** — user-reported bug: the browser-tab icon was still showing Lovable's logo. Root cause: `public/favicon.ico` was a 73×74 PNG leftover from the Lovable scaffolding, and `index.html` pointed at three other favicon paths (`/favicon-32x32.png`, `/favicon-16x16.png`, `/mask-icon.svg`) that don't exist, so the browser fell back to the stale `.ico`. VitePWA's `includeAssets` also referenced the same ghost paths. Replaced with a simple pink-heart-on-gradient SVG favicon (matching the `#E8B4D8` brand), updated HTML + Vite config to point at it, removed the dead references.
- **8b51706** — Health Statistics page picked up stat cards + a by-panel breakdown above the existing document list. Four cards (documents / lab values / healthy / flagged) and a horizontal bar chart grouping lab results by panel from the `raw_data` JSONB. Subscribes to `onHealthDataChange`.

Remaining open after session 31:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Authed e2e smoke flow.
2. Consolidated schema migration for the three `localStorage` stubs (notification toggles, emergency contacts).
3. Replace the Lovable-leftover apple-touch-icon + pwa-192x192 icons too (not critical — only affects installed PWA, but would complete the brand pass).
4. Mobile UX pass on new pages.

### 2026-04-24 (session 30)

- **c0ca0bb** — `/dashboard/emergency` Emergency Contacts page. LocalStorage-backed (keyed per user.id), capped at 5 contacts, each with name / optional relationship / phone. Phone renders as `tel:` so tapping dials on mobile. Yellow hero reminds the user Womanie doesn't place calls and they should use their local emergency number. Dashed footer calls out the on-device storage caveat. Sidebar + dropdown re-surface the entry.

Remaining open after session 30:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations (would let Emergency Contacts + Settings toggles sync across devices); admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

All dashboard nav entries now resolve to real pages. The "broken nav" cleanup started in session 27 is complete.

Next-session candidates:
1. Authed e2e smoke flow.
2. Consolidated schema migration for the three `localStorage` stubs (notification toggles, emergency contacts, plus any future preferences).
3. Mobile UX pass on new pages.

### 2026-04-23 (session 29)

- **defb81e** — `/dashboard/privacy` is a real page now instead of a redirect to Settings. Six sections explaining where data lives (Neon / Vercel Blob), who can see it (you + approved doctors only), Anthropic Claude API terms, doctor-connection flow, data export, and deletion rights. Hero has one-click Download / Delete buttons; footer has privacy@womanie.info. Sidebar + dropdown point straight at it.

Remaining open after session 29:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Emergency Contacts stub (nav entry currently missing; real feature would need schema).
2. Authed e2e smoke flow.
3. Footer: tiny link-strip at the bottom of authenticated pages pointing at Privacy / Help / About for consistent trust signaling.

### 2026-04-23 (session 28)

- **b297a9c** — new Help & Support page. Eight FAQ cards covering the most common questions a Womanie patient has (not-your-doctor framing; how uploads / analysis / sharing / data-control work; AI accuracy expectations; privacy). Hero card routes to the AI assistant or `mailto:support@womanie.info`. Re-surfaces the Help entry in both the sidebar and PatientDashboard dropdown (dropped in session 27 because the route didn't exist — now it does).

Remaining open after session 28:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Emergency Contacts page — requires schema for contacts; could localStorage-stub like the notification toggles.
2. Authed e2e smoke flow.
3. Footer / bottom nav pass for consistency with the session-28 support patterns.
4. Mini Privacy page at /dashboard/privacy with the concrete data-model story, so the redirect to Settings is replaced by real content.

### 2026-04-23 (session 27)

- **c4027ff** — persist Settings notification toggles to localStorage (keyed per user.id). Flipping a switch used to feel saved because it fired a toast, but the state lived only in React and vanished on refresh. Shape matches what a future `profiles.notification_settings` JSONB column would hold, so swapping to a server round-trip later is a drop-in.
- **828cb7d** — dead dashboard nav cleanup. Six menu entries in the dropdown + sidebar pointed at never-shipped routes (`/dashboard/profile`, `/dashboard/emergency`, `/dashboard/help`, `/dashboard/privacy`, `/dashboard/terms`, `/dashboard/about`), all 404'd. App.tsx now redirects four of them to sensible existing pages (about → /about, profile → onboarding/basic-info, privacy → /dashboard/settings, terms → /about); the dropdowns/sidebar drop the two with no good target (emergency, help).

Remaining open after session 27:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Authed e2e smoke flow.
2. Consolidate connections/* endpoints (cosmetic).
3. Emergency Contacts / Help pages (real content rather than deleting entries).
4. Dashboard empty-state polish for users who have completed onboarding but haven't uploaded anything.

### 2026-04-23 (session 26)

- **2850593** — chat history pagination. `GET /api/chat/messages` used to return every row; now defaults to most-recent 50, supports `?before=<created_at>` for back-paging, and returns `hasMore` + `earliestCursor` so the client can render a "Load earlier messages" pill at the top of the chat that fetches the next page and splices it in after WELCOME_MESSAGE. Client back-compat is preserved (old `data.messages` field still there).

Remaining open after session 26:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow; persisting Settings notification toggles (needs a schema change).

Next-session candidates:
1. Authed e2e smoke flow (long-standing; high value).
2. Persist Settings notification toggles via a `profiles.notification_settings` JSONB column (schema — HANDOFF-light).
3. Add a "Data retention" blurb + links to the export / delete buttons in a footer on dashboard for trust signaling.
4. Consolidate `connections/*` endpoints (cosmetic; not needed for function cap).

### 2026-04-23 (session 25)

- **7039d87** — GDPR data-portability export. `GET /api/me/export` returns one JSON blob with everything Womanie stores on the session user: auth_users, profiles, every health_document (with file_path blob URL so raws can be grabbed separately), document_analyses, medical_extracted_data, period_tracking, daily_health_signals, ivf_events, doctor_patient_connections (both sides), chat_messages, patient_access_codes. Content-Disposition + the Settings page's new 'Download my data' button stream it straight to disk as `womanie-export-<date>.json`.
- **99872d2** — GDPR right-to-erasure. `POST /api/me/delete-account` with `{ confirm: 'DELETE MY ACCOUNT' }` wipes every row keyed on the session user across 18 tables in a single neon transaction, then best-effort-sweeps their Vercel Blob uploads via `list({prefix}) + del(urls)`, then clears the session cookie. Settings UI adds a red 'Delete my account' button gated behind a window.confirm plus a type-to-confirm window.prompt.

Remaining open after session 25:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Persist Settings notification toggles (currently local-state only).
2. Authed e2e smoke flow.
3. Chat history pagination — `chat_messages` loads every row every time.
4. Add `/api/me/export` + `/api/me/delete-account` to `.planning/smoke.sh` (both should 401 on unauth).

### 2026-04-23 (session 24)

- **36d14cb** — patient can cancel an active access code before it's redeemed. Each row in `ShareWithDoctor`'s active-codes list now carries a trash-icon button next to Copy; click deletes the `patient_access_codes` row (own-row delete via the `patient_id` ownership policy) and re-fetches the list. Covers the "oh no I sent it to the wrong doctor" case.
- **97d131f** — confirm before clearing a non-empty AI Doctor chat. The Clear icon in the chat header used to wipe localStorage + delete server chat_messages with no safety net; now only an actually-populated chat triggers a `window.confirm`, empty-state clicks still go through silently.

Quick function-count audit: 23 Vercel functions, Pro-plan ceiling is 100. No consolidation pressure.

Remaining open after session 24:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Persist Settings notification toggles (they're local-state-only; flip a switch and reload and it's forgotten).
2. Data export endpoint (GDPR — patient downloads all their data).
3. Account delete (GDPR).
4. Authed e2e smoke.

### 2026-04-23 (session 23)

- **f2b28ef** — reanalyzeAll in MedicalHistory now surfaces per-doc outcomes. Previously `Promise.allSettled` + ignored results meant 429s / 500s / 502s tallied as "done" silently. Now tracks succeeded / failed / rateLimited per batch, early-exits when the daily `/api/analyze-document` cap is hit (no point burning through 20 queued docs only to watch them all 429), and emits a toast that reflects the actual result: all-done with a count, rate-limit-reached with the retriable remainder, or mixed-failures with both numbers. Dropped the `db.functions.invoke` shim in favor of a direct fetch so status codes aren't swallowed into thrown errors.

Quick audit note: dark-mode sweep ran cleanly — every new card already uses the `dark:` variant where a light-tone background is used, and `bg-white` / `text-black` patterns aren't present in the autonomous-session surface. Flagged item closed.

Remaining open after session 23:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Consolidate `/api/connections/*` into one handler — 23 Vercel functions is past Hobby's cap, and four separate files for approved/pending/redeem/respond is more surface area than the feature needs.
2. Expired `patient_access_codes` cleanup.
3. Authed e2e smoke.
4. Revisit the Settings page — added a lot of UX elsewhere, may want to expose things like ADMIN_EMAILS check, data export, account delete.

### 2026-04-23 (session 22)

- **1b8a7ee** — Badge counts on the Notifications nav entry. New `useAttentionCount` hook aggregates pending doctor connections + stalled analyses (>3 min with no ai_summary) + critical findings; subscribes to `onHealthDataChange` so the count updates as events land. PatientDashboard's dropdown shows an inline number pill; AppSidebar shows a small dot-badge in the corner of the Bell icon (9+ on overflow). Hook fails silently on errors since the badge is cosmetic.

Remaining open after session 22:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Dark-mode sweep on newly-added cards (some bg-amber-100 / bg-green-100 etc. may contrast poorly in dark mode).
2. Expired-code cleanup on `patient_access_codes`.
3. Authed e2e smoke flow.
4. Consolidate `/api/connections/*` behind a single handler (Vercel function count keeps climbing).

### 2026-04-23 (session 21)

- **d92a98c** — re-analyze flows on MedicalHistory (reanalyzeOne + reanalyzeAll) now pass the patient's timezone to `/api/analyze-document`. Initial upload added this in session 14; re-analysis had been sneaking UTC into Claude's "Today:" prompt for re-runs.
- **6e3ced1** — `/dashboard/notifications` route now exists. Both PatientDashboard's dropdown and AppSidebar link to it; the route was never wired up, so those clicks 404'd. New page aggregates: pending + approved doctor connections (reuses `PendingConnections` / `ConnectedDoctors`), stalled analyses (doc >3 min old with no `ai_summary` — same threshold MedicalHistory already uses), and critical findings from `current_extracted_data`. All rows deep-link into the specific doc via the session-5 `?doc=` link.

Remaining open after session 21:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Badge counts on navigation (stalled docs count, pending connections count) so notifications are visible before clicking in.
2. Dark-mode sweep on the new cards (some cards have hard-coded green-100 / amber-100 tones that may not contrast in dark mode).
3. Expired-code cleanup on `patient_access_codes`.
4. Authed e2e smoke flow.

### 2026-04-23 (session 20)

- **239fcfe** — admin panel now manages verified doctors too, not just pending. `GET /api/admin/doctors` returns `{ pending, approved }`; `POST` adds `action='revoke'` that flips `is_verified=false`, sets `verification_status='revoked'` (history kept), and strips `user_roles.role='doctor'`. UI splits into Pending / Verified sections with a shared `DoctorCard` sub-component; revoke is behind a `window.confirm`.
- **b5e974c** — GettingStarted celebration toasts. Ref-tracked set of already-completed steps; on each refresh, newly-completed keys fire a 🎉 toast (plus a final ✨ "You're all set" when the last step ticks off). Initial mount captures current state silently so established users don't get spammed.

Remaining open after session 20:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Expired-code cleanup on `patient_access_codes` (housekeeping).
2. Authed e2e smoke flow.
3. Settings page audit — I haven't looked at it, likely has broken Supabase stubs.
4. Dark mode check — some of the new cards have hard-coded colors that may not read well in dark mode.

### 2026-04-23 (session 19)

- **54e5cc7** — admin shortcut in the shared `UserMenu`. `/api/auth/me` now includes `isAdmin` (same `ADMIN_EMAILS` rule as `api/_lib/admin.ts`); `AuthUser` / `AuthContext` expose it; `UserMenu` renders a Shield-icon "Admin" button only when `user.isAdmin`. Client-side gating only — endpoint-level authorization stays unchanged.
- **ce1814a** — PatientDashboard's bespoke dropdown (it doesn't use UserMenu) picked up the same admin-only entry above the Logout separator.

Remaining open after session 19:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Revoke-code / cleanup of expired `patient_access_codes` (housekeeping).
2. Authed e2e smoke flow.
3. Little celebration (toast + icon pulse) when a GettingStarted step ticks off.
4. Admin panel: show verified doctors too, not just pending ones (reject/re-verify actions).

### 2026-04-23 (session 18)

- **8f98f25** — "Ask" deep-link on NewDocInsights rows, completing the trio (RecentFindings / HealthTrends / NewDocInsights). Different question templates per shift kind — "new" / "worsened" / "improved" — so the prefilled chat opener reads naturally in each context.
- **d6c1212** — new `GettingStarted` checklist on PatientDashboard. Three onboarding steps (profile name set / first doc uploaded / first daily log) with per-step CTA. Whole card hides itself once all three are complete, so it's invisible for established users. Subscribes to `onHealthDataChange` so it re-evaluates immediately after the user takes each action.

Remaining open after session 18:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Revoke / cleanup of expired `patient_access_codes` (small housekeeping job).
2. Authed e2e smoke flow.
3. UX: when a user completes a GettingStarted step, brief toast + celebrate (small, nice).
4. Surface admin doctor-approvals in a navigation entry (currently only reachable by typing /admin/doctors).

### 2026-04-23 (session 17)

- **c23021c** — "Ask" affordance on every RecentFindings row. Clicking navigates to `/dashboard/ai-doctor?q=<question>`; AIDoctorChat reads the `q` param on mount, auto-sends as the first user turn, and strips it from the URL so a refresh doesn't resend. Question template pulls the finding title + value + unit ("What does my Ferritin of 12 μg/L mean for me?"). Also refactored the row from an `<li role='button'>` into two proper sibling `<button>`s so row-nav + Ask both have real accessibility and focus behaviour.
- **20f95d4** — same Ask pattern on HealthTrends rows, with trend-aware question phrasing ("My Ferritin improved from 42 μg/L to 78 μg/L. What does this mean for me?"). Verb degrades to "went up / down / changed" when no status shift.

Remaining open after session 17:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Dashboard empty-state pass for brand-new users (most of the dashboard is hide-when-empty; a "Welcome, here's your next step" hero would help before the widgets light up).
2. `?q=` deep-link into AIDoctorChat also from NewDocInsights "worsened / new" rows.
3. Expire / clean old `patient_access_codes` (low priority but easy).
4. Authed e2e smoke.

### 2026-04-23 (session 16)

- **a736f8c** — audit.md rotation. Sessions 1–8 moved to `.planning/SHIPPED.md`; audit.md kept at sessions 9–15 for trailing context (~300 lines, fits well in a fresh wake-up load).
- **2c4f318** — AIDoctorChat empty-state polish. When `medicalContext` is empty (brand-new user with no uploads), swap the context-aware prompt chips for onboarding-oriented starters ("What kinds of tests should I be tracking?", "What can you help me with?", "What should I upload first?") so the first chip click doesn't return "I have no data to reference". Existing chips still trigger once there's data.

Remaining open after session 16:
- P0 #5 transaction atomicity.
- P1 #8 cache TTL (HANDOFF).
- HANDOFFs: schema migrations; admin email notification; real rate-limit bucket; doctor-signup email verification; authed e2e smoke flow.

Next-session candidates:
1. Authed e2e smoke flow.
2. Dashboard empty-state pass for brand-new users (PatientDashboard first impression — widgets mostly hide themselves; a concrete "next step" hero would help).
3. Revoke-code / cleanup for expired `patient_access_codes`.
4. Inline "Ask about this" on RecentFindings rows → open AI Doctor with a prefilled question.

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
