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
