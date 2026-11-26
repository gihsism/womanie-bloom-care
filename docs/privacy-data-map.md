# Womanie privacy data map

Last checked against the code: 2026-11-26 (migrations 001-024).
This is an engineering description of what the code does. It is not legal advice.
The privacy wording itself is the founder's decision: section 4 only proposes wording.

The machine-readable version of section 1 is `api/_lib/privacy-data-map.ts`.
`api/_lib/privacy-coverage.test.ts` fails when a table with a user / patient /
doctor id or an email is added in `db/migrations` without being wired into
"Download my data" (`api/_routes/me/export.ts`) and "Delete my account"
(`api/_routes/me/delete-account.ts`), or when this file doesn't mention it.

## 1. What is stored, why, where, who receives it, how long

Region key: **Neon = AWS us-east-1 (USA)** (from the database host name). Uploaded files
are in **Vercel Blob** (store region is set in the Vercel dashboard, not in the repo).
Server code runs on **Vercel Functions**; `vercel.json` sets no region, so it runs in
Vercel's default region (Washington D.C., `iad1`) unless the project settings say otherwise.

| Data (table) | Purpose | Stored in | Who else receives it | Kept for | Export | Deletion |
|---|---|---|---|---|---|---|
| Account: email, name, password hash (`auth_users`) | Sign-in | Neon US | Google (only for Google sign-in: Google sends us email + name) | Until account deletion | Yes (never the hash) | Deleted |
| Sign-in sessions (`auth_sessions`) | Keep her signed in | Neon US | - | 30 days per session; expired rows are not cleaned up | Yes (without session id) | Deleted |
| Profile: name, life stage (`profiles`), roles (`user_roles`) | App personalisation, patient/doctor access | Neon US | Approved doctors see the profile; Anthropic (life stage / name in AI prompts) | Until deletion | Yes | Deleted |
| Consent log: policy version + time accepted (`consent_log`, migration 024) | Record of what she accepted | Neon US | - | Until deletion | Yes | Deleted |
| Ask AI answer ratings: 👍/👎, reason from a fixed list, her optional comment (`chat_feedback`, migration 026; a copy stays in the browser until the server stores it) | Quality review of AI answers | Neon US (+ browser local storage) | - | Until deletion | Yes | Deleted |
| Uploaded documents: files + metadata (`health_documents`, Vercel Blob) | Her health records | Neon US + Vercel Blob | Anthropic (text/images for analysis); approved doctors | Until she deletes them or the account | Yes (download link per file) | Deleted (files: best-effort by prefix) |
| Documents a doctor sent her (`health_documents.uploaded_by_doctor_id`, 021) | Doctor shares a report into her Records | Neon US + Blob | The sending doctor | As above | Yes (with sender id) | Deleted with her account. If the DOCTOR deletes her account, the patient keeps the document and the doctor id stays on it (provenance of the patient's record) |
| AI analyses and extracted lab values (`document_analyses`, `medical_extracted_data` and its view `current_extracted_data`, `pending_jobs`) | Explain results, trends | Neon US | Anthropic (produced by it); approved doctors | Until deletion | Yes | Deleted |
| Cycle, daily signals, IVF events and IVF plan, life events, medications incl. `stopped_on`, babies, birth records, birth plan, app data (DOB, height, weight, blood type, checklists, logs), visit questions (`period_tracking`, `daily_health_signals`, `ivf_events`, `ivf_plans`, `life_events`, `medications`, `babies`, `birth_records`, `birth_plans`, `user_app_data`, `visit_questions`) | Tracking and visit preparation | Neon US (+ a copy in the browser's local storage for some app data) | Approved doctors (period, daily signals, medications, visit questions; birth plan only when she shares it); Anthropic (as context in AI chat) | Until deletion | Yes | Deleted |
| AI chat (`chat_messages`) and cached AI summaries (`llm_cache`, her summary keys) | AI Health Assistant | Neon US | Anthropic (each message plus selected records as context) | Chat: until deletion. Analysis cache: 30 days, content-addressed, not linked to her | Yes (chat + her summaries) | Deleted (her summary keys; shared analysis cache entries are not linked to her) |
| Doctor relationship: access codes, connections, appointments, notes, chart-view log (`patient_access_codes`, `doctor_patient_connections`, `appointments`, `doctor_notes`, `chart_access_log`) | Sharing with her doctor, booking | Neon US | The connected doctor | Until deletion (no time limit on the chart-view log) | Yes (patients get only the notes marked visible to them) | Deleted, on both sides (see open item 5) |
| Doctor professional data (`doctor_profiles`, `doctor_schedule`, `consultation_settings`) | Directory and booking | Neon US | Public directory; founder's Telegram on signup (name + licence number) | Until deletion | Yes | Deleted |
| Phone notifications (`push_subscriptions`, `push_sent_log`) | Medicine / period / visit reminders | Neon US | The phone's push service (Google FCM, Apple, Mozilla) receives an encrypted message; the text appears on her lock screen | Subscriptions until she turns them off; sent log 60 days | Yes (settings and push-service host only; device keys are secrets) | Deleted |
| Newsletter (`newsletter_subscribers`) | Newsletter | Neon US | - | Until unsubscribe / deletion | Yes | Deleted |
| Rate-limit counters (`rate_limit_counters`) | Abuse protection | Neon US | - | 2 days | No: only a SHA-256 hash and a counter | Deleted |
| Admin decisions about her (`admin_audit_log`, 023) | Accountability for licence checks | Neon US | Admins | Indefinite | Yes (without the admin's identity) | **Kept, pseudonymised**: her id becomes `erased:<sha256>`, email, licence number, reason and note are removed, action + date stay. Why: proof of who approved or rejected a doctor and when must outlive the account. Rows where she was the acting admin keep the admin id and lose the email |
| Doctor invitation links (`doctor_invites`, 023) | Onboarding a doctor | Neon US | Admins | 7-day link; row until deletion | Yes (never the token hash) | Deleted (the audit row above keeps the trail) |
| Error reports | Fixing crashes | Sentry (server DSN: EU, `ingest.de.sentry.io`; browser DSN is a Vercel env var, region to check) | Sentry | Sentry plan retention | - | Not linked to the account (no user id or email sent) |
| Request logs | Operations | Vercel | Vercel | Vercel plan log retention | - | Not deleted on account deletion. `console.error` lines can quote database or AI errors |
| Fonts | Typography | - | Google Fonts (every page load sends her IP address to Google) | - | - | - |

## 2. Third parties, what they receive and how it is limited

- **Neon (database)**: everything in section 1. Region AWS us-east-1, USA.
- **Vercel**: hosting, functions (default region iad1, USA), Blob file storage, request logs.
- **Anthropic (Claude API)**, `api/_lib/anthropic.ts`, `api/ai-doctor-chat.ts`, `api/analyze-document.ts`, `api/summary/*`:
  document text/images, chat messages and, for the chat, her profile, life stage and selected records
  as context (`profile-context.ts`, `life-context.ts`, `personal-retrieval.ts`). No other AI provider: there is no
  OpenAI call (the chat only re-encodes its stream in an OpenAI-style format for the browser).
  Zero-data-retention is not configured in code; check the Anthropic account terms.
- **Sentry**: server events go through `scrubEvent` (`api/_lib/sentry.ts`): no request body, cookies,
  query string, auth / API-key / IP headers; user reduced to an id (none is set today); console breadcrumbs
  dropped; any health-field or secret key in extra / contexts / tags replaced by `[Filtered]`; emails in
  messages masked; also applied to performance events. Browser events go through `src/lib/sentryScrub.ts`
  (no bodies, no query strings, no console breadcrumbs, no replays). Tests: `api/_lib/sentry.test.ts`,
  `src/lib/sentryScrub.test.ts`.
- **Google**: OAuth sign-in (email, name, Google account id returned to us); Google Fonts (IP address).
- **Push services** (FCM / Apple / Mozilla): an encrypted payload per reminder plus the device endpoint.
- **Telegram** (`api/_lib/notify.ts`): the founder's bot receives a doctor's name and licence number when a doctor signs up.

## 3. Export and deletion coverage (what changed on 2026-11-26)

Export now also includes: sign-in sessions, phone-notification devices and sent reminders, the consent log,
her cached AI summaries, the sender of each document a doctor sent her, documents she sent as a doctor,
admin decisions about her, and doctor invitation links addressed to her. (`ivf_plans`, birth plan,
visit questions and `medications.stopped_on` were already covered.)

Deletion now also: deletes the consent log and her doctor invitation links, and pseudonymises the admin audit
log (see table). Each new table is skipped until its migration is applied, so deletion never fails on a
missing table.

## 4. Mismatches between the privacy page (`src/pages/dashboard/Privacy.tsx`) and the code

The page text is unchanged. Proposed wording is for the founder to decide. After changing the text, bump the
version in `api/_lib/policy-versions.ts` (a test enforces this); users then see "the policy has changed since"
in Me → Privacy and can accept the new version.

| # | Page says | Reality | Proposed wording |
|---|---|---|---|
| 1 | "Neon (managed Postgres) in a US region." Nothing about where the code runs | Correct for the database (us-east-1). The server functions also run in the USA (no region set). The page does not say that this is a transfer of health data from Switzerland/EU to the USA | "Your data is stored by Neon (database) in the USA (AWS us-east-1) and processed by Vercel servers in the USA. [Founder: state the transfer safeguard you rely on, e.g. Swiss-US / EU-US Data Privacy Framework or standard contractual clauses.]" Or move the database and functions to an EU region (engineering option, see open item 1) |
| 2 | "Nothing is stored on the device ... except a session cookie and a small local cache for notification preferences." | The browser also keeps date of birth, height, weight, blood type, pregnancy weight log, postpartum birth details, chat model choice and the last sign-in email in local storage | "Your browser keeps a copy of some details you enter (for example date of birth, height, weight and pregnancy logs) so the app works quickly and offline. Signing out of a shared device does not remove it; clear the site data to remove it." |
| 3 | Doctors see "only ... documents, analyses, extracted values" | An approved doctor's chart also shows her profile, daily signals, period log, medications, appointments, visit questions, and her birth plan when she shares it. Doctors can also send documents into her Records | "An approved doctor sees your profile, documents and results, cycle and daily logs, medications, appointments and the questions you saved for a visit, and your birth plan if you choose to share it. A doctor can also send you documents, marked 'from Dr X'." |
| 4 | "We (the Womanie team) ... have no tooling that shows another person's account contents." | Admin tools exist: `/api/admin/docs` lists every user id with email and document counts and can move records between accounts; `/api/admin/doctors` shows doctor applications (licence number); every admin action is logged | "A small number of Womanie administrators can see account emails and the number of documents per account, to fix technical problems, and review doctors' licence details. Every administrator action is logged." |
| 5 | AI: "Your document text and chat messages are sent" | The chat also sends her profile, life stage and selected records (lab values, cycle data) as context | "...and, so the assistant can answer about you, the relevant parts of your records (for example recent lab values and cycle data)." |
| 6 | "Anthropic does not train on API traffic. Their retention is 30 days ..." | Not verifiable from the code; no zero-data-retention setting exists in code | Founder to confirm against the current Anthropic commercial terms / DPA, then keep or update the sentence |
| 7 | Not mentioned: Sentry, Google sign-in, Google Fonts, phone push services, Telegram, Vercel logs | All receive some data (section 2) | Add a "Service providers" list: "Vercel (hosting, files, logs, USA), Neon (database, USA), Anthropic (AI, USA), Sentry (error reports without your health data, EU), Google (sign-in if you choose it, and fonts), Apple/Google/Mozilla push services (reminders, encrypted), Telegram (internal alerts about doctor sign-ups)." |
| 8 | Delete account: "wipes every row ... we keep nothing." | Kept after deletion: the pseudonymised admin audit log; shared AI-analysis cache entries (30 days, not linked to her); Vercel request logs and Sentry events for their retention period; database backups / point-in-time history at Neon for its retention window; file deletion is best-effort | "Deleting your account erases your data from our database and your uploaded files. A few records stay for a limited time: server logs and error reports (without your health data) until they expire, database backups until they roll over (up to [N] days), and, for doctors, a record of licence-check decisions with your name and email removed." |
| 9 | Download: "profile, every document, every analysis, cycle + daily logs, chat history, doctor connections" | Export now has more (section 3) | "...plus medications, pregnancy, birth and IVF records, visit questions, reminders, your consent history and your sign-in sessions." |
| 10 | Not mentioned: retention periods | Most data has no time limit until she deletes it; chart-view log has no limit; sessions 30 days; sent reminders 60 days; rate-limit hashes 2 days | Add a retention sentence per category, as in section 1 |
| 11 | Not mentioned: who the controller is, legal basis / consent for health data, how to complain (FDPIC in Switzerland, EU authority) | Code now records privacy-policy acceptance with the version (signup tick + Me → Privacy) | Founder / lawyer to add. The consent log can show acceptance of a dedicated "health data processing" statement if you add one |
| 12 | Footer "Terms of Service" link | `/dashboard/terms` redirects to `/about`; there are no terms to accept or version | Publish terms, then add `terms` to `api/_lib/policy-versions.ts` (the consent log already accepts it) |
| 13 | "Unused codes expire in 24 hours" | True in the app (24 h, `CODE_TTL_HOURS` in `ShareWithDoctor.tsx`), but the browser sets `expires_at` through `/api/db`, so the server does not enforce the 24 h maximum | Wording can stay; engineering follow-up: cap `expires_at` on the server |

## 5. Open engineering items (not changed in this pass)

1. **Region**: moving Neon to an EU/CH region (e.g. AWS eu-central-1 / Frankfurt or Zurich) and setting
   `"regions": ["fra1"]` for functions would remove the US storage of health data. This touches `vercel.json`
   and needs a data migration that preserves user ids, so it needs the founder's decision.
2. **Google Fonts**: self-hosting the three font families would stop sending every visitor's IP to Google.
3. **Expired sessions** are never deleted (`auth_sessions`). A periodic `DELETE ... WHERE expires_at < now()`
   would fit the retention story.
4. **Chart access log** has no retention limit.
5. **Doctor deletes her account**: appointments and doctor notes about her patients are deleted on both sides
   (`DELETE FROM appointments WHERE ... OR doctor_id = ...`). Patients lose their visit history; if doctors have a
   duty to keep medical records, that also conflicts. Founder decision.
6. **Consent for Google sign-up and doctors**: the signup tick is on the patient email form only. Google sign-ups
   and doctors accept in Me → Privacy ("No acceptance recorded yet"); there is no blocking prompt.
7. **Migration 024** is written but not applied:
   `node scripts/apply-migration.mjs db/migrations/024_consent_log.sql`. Until then Me → Privacy shows
   "Not available yet" and signups skip the consent row.
8. **Migration 026** (Ask AI answer ratings, `chat_feedback`) is written but not applied:
   `node scripts/apply-migration.mjs db/migrations/026_chat_feedback.sql`. Until then ratings stay in the
   browser (marked unsent) and are sent the next time the chat opens after it is applied.
