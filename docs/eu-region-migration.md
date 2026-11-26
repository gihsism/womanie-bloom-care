# Moving Womanie's data and servers to Frankfurt (EU)

Prepared 2026-11-26. **Nothing has been switched.** This is the plan and the
tools for it. Every step that changes something live is marked
**[FOUNDER OK]** and waits for the founder's go-ahead.

This is an engineering description, not legal advice. Whether Frankfurt is
required (Swiss nFADP / EU GDPR for health data) is the founder's and her
adviser's call; this document says what is technically possible, what it
costs, and how to do it without losing anything.

---

## 0. The one rule

**No data loss, no id changes.** Every user keeps the same `user_id`, every row
keeps its id, every history entry (cycle logs, lab values, chat, consent log,
sessions) arrives in Frankfurt byte-for-byte. The copy is proven with a
row-count and checksum comparison of every table before anyone can write to the
new database, and the old database stays untouched for 14 days.

---

## 1. Verified facts (checked 2026-11-26)

### Where things are today

| Piece | Where it runs / stores data today | How this was checked |
|---|---|---|
| Database (Neon Postgres 17, ~10 MB, 36 tables) | **AWS us-east-1 (N. Virginia, USA)** | Host name in `DATABASE_URL` (`…c-5.us-east-1.aws.neon.tech`), read without printing credentials |
| Server functions (Vercel) | **iad1 (Washington D.C., USA)** | Vercel project settings via `vercel api`: `functionDefaultRegions: ["iad1"]`; `vercel.json` sets no region |
| Uploaded documents (Vercel Blob store `womanie-bloom-care-blob`, public, 12 files, ~101 MB) | **iad1 (USA)** | `vercel api /v1/storage/stores` |
| Error reports (Sentry) | **EU (Frankfurt)** already | Browser DSN host is `…ingest.de.sentry.io`. The server DSN (`SENTRY_DSN`) is stored encrypted in Vercel; confirm it is the same EU org in Sentry > Organization settings |
| AI (Anthropic API, model `claude-sonnet-5-5`) | **USA / global**, no EU option | See below |
| Vercel plan | **Hobby** | `vercel api /v2/user` |

### Can each piece move to the EU, and what does it cost?

**Vercel functions -> fra1 (Frankfurt): yes, on Hobby, no extra cost.**
- Hobby may run functions in a *single* region of its choice; Pro gets 5. The region is set with `"regions": ["fra1"]` in `vercel.json` (or in Project Settings > Functions). [Vercel: Configuring regions](https://vercel.com/docs/functions/configuring-functions/region)
- Hobby is free with fixed monthly allowances (4 CPU-hrs, 360 GB-hrs memory, 1M invocations…); no region surcharge is listed for Hobby. [Vercel: Hobby plan](https://vercel.com/docs/plans/hobby)
- Regional prices exist, but "This pricing is available only to Pro plan users." For Pro, fra1 costs more than iad1: Active CPU $0.184/h vs $0.128/h, provisioned memory $0.0152 vs $0.0106 per GB-hr, CDN requests $2.60 vs $2.00 per million. [fra1 pricing](https://vercel.com/docs/pricing/regional-pricing/fra1), [iad1 pricing](https://vercel.com/docs/pricing/regional-pricing/iad1)

**Neon database -> aws-eu-central-1 (Frankfurt): yes, but only as a new project plus a copy.**
- "The region is fixed at project creation and cannot be changed afterward … To move data to a different region, create a new project there and migrate." [Neon: Regions](https://neon.com/docs/introduction/regions), [Neon: Region migration](https://neon.com/docs/guides/region-migration)
- Frankfurt is `aws-eu-central-1`.
- Recommended methods: Import Data Assistant (under ~10 GB), dump and restore, or logical replication. Use **direct (unpooled)** connection strings for dump/restore. [Neon: Migrate to another region](https://neon.com/docs/import/migrate-neon-to-another-region), [Neon: dump and restore commands](https://neon.com/docs/import/migrate-from-neon)
- Free plan: 100 projects, 1 GB storage per project, 100 CU-hours per project per month. Our database is 10 MB, so a second project for the 14-day overlap fits inside Free. The pricing page lists one price per plan and no regional surcharge. [Neon pricing](https://neon.com/pricing)
- Check in the Neon console which plan the account is on; nothing here needs a paid plan.

**Vercel Blob -> fra1: yes, but only as a new store plus a copy.**
- "You can create Blob stores in any of the 19 regions … You cannot change the region once the store is created." [Vercel Blob](https://vercel.com/docs/vercel-blob)
- Hobby: free within 1 GB storage, 10,000 simple and 2,000 advanced operations, 10 GB transfer per month; over the limit Blob stops for 30 days rather than billing. Our 101 MB copied once is about 24 advanced operations. Regional Blob prices again apply only to Pro (fra1 storage $0.025/GB vs $0.023/GB in iad1). [Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)

**Sentry: already EU.** EU org data at rest is in Frankfurt; a short list (user accounts, org settings, DSN keys, audit logs, usage data) is always kept in the US. The region of an existing org can't be changed. [Sentry: Data storage location](https://docs.sentry.io/organization/data-storage-location/)

**Anthropic API: no EU data residency on the direct API today.**
- `inference_geo` has only two values: `"global"` (default; may run in any geography) and `"us"` (priced at 1.1x). Workspace geo (where data is stored at rest) is `"us"` only and can't be changed after a workspace is created. [Anthropic: Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency)
- Partner platforms (Amazon Bedrock, Google Cloud Vertex, Google-managed) choose the region by endpoint, so an EU region there is the documented way to get EU inference. That means a separate account, different code and different pricing. It is **not** part of this plan.
- So even after the move, chat messages, uploaded documents sent for analysis and the context the AI gets **still leave the EU**. The privacy policy and `docs/privacy-data-map.md` must keep saying so.

### "Same price on the current plans": confirmed, with two caveats

- **Confirmed** for today's setup: Vercel Hobby stays free in fra1 (one region is allowed), Neon shows no regional price difference and Free covers the second project, and Blob on Hobby is free within the same limits in any region.
- **Caveat 1: if Womanie upgrades to Vercel Pro,** fra1 is dearer than iad1 (about 30-45% on CPU, memory and requests, about 9% on Blob storage). At today's tiny usage that is cents, but it is not "the same price".
- **Caveat 2: the move does not make the AI part EU-resident** (see Anthropic above). Choosing US-only AI processing would cost 10% more; EU AI processing would need Bedrock/Vertex, a separate project.

---

## 2. What is already built (inert, switched off)

| Piece | File | State |
|---|---|---|
| Copy checker: compares every table's columns, row count, checksum of all rows, constraints and indexes, plus sequences and extensions. Read-only on both databases. | `scripts/db-verify-copy.mjs` (+ `scripts/fixtures/db-verify-fixture.json`, tests in `scripts/db-verify-copy.test.ts`) | Ready. `node scripts/db-verify-copy.mjs --dry-run` needs no database |
| Maintenance (read-only) mode: env var `MAINTENANCE_MODE=1` makes every write return "503, try again shortly"; reads (her data, the session check) keep working; a banner explains it | `api/_lib/maintenance.ts`, `api/_routes/maintenance.ts`, `src/components/MaintenanceBanner.tsx` (+ tests) | **OFF** by default. Nothing happens until the env var is set and the project is redeployed |
| Region change for the functions | shown as a diff in section 5, **not** applied to `vercel.json` | Waits for the window |

What maintenance mode blocks while ON: sign-up, log-in, log-out, every save
through `/api/db`, uploads, document analysis, AI chat, summaries, bookings,
consents, push sending and the Google sign-in callback. Even routes that only
look like reads but write a log line (for example a doctor opening a chart) are
blocked, so **no row can reach the old database after the copy is taken**.
Already-signed-in users can still open the app and see their data, chat
history and "Download my data" (the session check's automatic renewal is
skipped while ON). Opening a stored document is blocked too, because a doctor
opening one writes an access-log row that must not be lost. Contractions and kick sessions
that fail to save stay on the phone and are re-sent later by the existing
offline queue; other entries show the usual "could not save" message.

How it was tested: the checker passed a real `pg_dump | pg_restore` copy on a
local Postgres 17 (1,066 rows, 3 tables) and failed it after one row was
deleted, one float changed in its 7th decimal, and a sequence was set back. It
also connected read-only to the production Neon database (36 tables, 583 rows)
to prove the connection works; nothing was written.

---

## 3. Before the day (rehearsal, no user impact)

You need: a terminal on the Mac, `pg_dump`/`pg_restore` 17 (installed:
`pg_dump --version` shows 17.10; Neon runs 17.12, same major version is what matters),
and access to the Neon and Vercel dashboards.

1. **[FOUNDER OK] Create the Frankfurt database.** Neon console > New project >
   name `womanie-eu`, Postgres **17**, region **AWS Europe Central 1 (Frankfurt)**.
   Free plan is enough. Copy its connection string with **Pooled connection
   turned OFF** (the host must not contain `-pooler`). Keep it in your password
   manager, never in a chat or a file in the repo.
2. **Rehearse the copy** (reads the live database, writes only to the new, empty one):
   ```bash
   cd ~/womanie-bloom-care
   read -rs SOURCE_DATABASE_URL && export SOURCE_DATABASE_URL   # paste OLD (US) string, press Enter
   read -rs TARGET_DATABASE_URL && export TARGET_DATABASE_URL   # paste NEW (Frankfurt) string, press Enter
   pg_dump -Fc -v -d "$SOURCE_DATABASE_URL" -f /tmp/womanie-rehearsal.dump
   pg_restore -v --no-owner --no-acl --single-transaction --exit-on-error \
     -d "$TARGET_DATABASE_URL" /tmp/womanie-rehearsal.dump
   node --no-warnings scripts/db-verify-copy.mjs --json /tmp/womanie-rehearsal-report.json
   ```
   (`read -rs` keeps the strings out of the screen and the shell history.)
   Expected: `RESULT: PASS`, 36 tables. Users may write during a rehearsal, so a
   row or two of difference on a busy table is normal *here only*; the real run
   happens with writes blocked. If `pg_restore` stops with an error, send the
   last 20 lines (they contain no password) before going further.
3. **Empty the new database again** so the real copy starts clean: in the Neon
   console delete the `womanie-eu` project and create it again (same settings),
   or delete and recreate its `neondb` database. Copy the new connection string.
4. **Prepare the region change** as a branch, not merged: create branch
   `eu-region-fra1` with the diff from section 5 and open a pull request.
   **Do not merge it yet**: merging to `main` deploys it.
5. **Test the banner** on a preview: on the preview deployment only, set
   `MAINTENANCE_MODE=1` (Vercel > Settings > Environment Variables, environment
   *Preview*), redeploy the preview, check the banner shows and saving fails
   politely; then remove the variable.
6. Pick a quiet window (for example a weekday 22:00 Zurich time). Plan
   **30 minutes**; the copy itself takes under a minute at 10 MB.
7. Optional: tell users a day ahead ("short maintenance on … at 22:00; you can
   read but not save for about 15 minutes").

---

## 4. The cut-over window (step by step)

Keep a notes file with the time of each step.

| # | Step | Who / where | Done when |
|---|---|---|---|
| 1 | **[FOUNDER OK] Maintenance ON:** Vercel > Settings > Environment Variables > add `MAINTENANCE_MODE` = `1` (Production). Optional `MAINTENANCE_MESSAGE` = your own text. Then Deployments > current production > **Redeploy**. | Vercel | Banner visible on womanie.info; saving something shows "try again shortly" |
| 2 | **Wait 5 minutes** so any request that was already running (AI summaries may take up to 5 min) has finished. | - | Clock |
| 3 | **Copy:** run the same three commands as in the rehearsal, with the real file names `/tmp/womanie-cutover.dump` and `/tmp/womanie-cutover-report.json`. | Terminal | `pg_restore` finished without error |
| 4 | **Verify:** the checker must print `RESULT: PASS` (all 36 tables `OK`, same row totals). **Anything else = stop and roll back (step R1).** Keep the JSON report (it contains no credentials). | Terminal | PASS |
| 5 | **[FOUNDER OK] Switch the database:** Vercel > Environment Variables > edit `DATABASE_URL` (Production) to the Frankfurt string. Redeploy. Maintenance stays ON. | Vercel | Deployment ready |
| 6 | **Read checks** (already signed-in browser, test account `ux-review@womanie.test`): Dashboard loads with its data; Records list shows the documents; AI chat history is there. (Opening a document is blocked while maintenance is ON, see section 2; it is tested in step 10.) | Browser | All three OK |
| 7 | **[FOUNDER OK] Functions to Frankfurt:** merge the `eu-region-fra1` pull request (separate commit, so it can be reverted alone). | GitHub / Vercel | Deployment summary shows **fra1** |
| 8 | Repeat the read checks from step 6. | Browser | OK |
| 9 | **[FOUNDER OK] Maintenance OFF:** delete `MAINTENANCE_MODE` (Production), Redeploy. | Vercel | Banner gone |
| 10 | **Write checks** with the test account: log in and out, log a symptom/period day, upload a small test PDF and open it, send one AI chat message, change one setting. Then in the Neon console (Frankfurt project > Tables) confirm the new rows appear there, and in the **old** project that they do not. | Browser + Neon | All OK |
| 11 | Update the local `.env.local` `DATABASE_URL` to the Frankfurt string (otherwise local scripts such as `scripts/apply-migration.mjs` would keep writing to the old database). | Mac | Done |

Between steps 5 and 7 the functions are still in the USA and talk to the
database in Frankfurt; pages are slower for those few minutes. That is expected.

Users stay signed in throughout: sessions are rows in the database and are
copied, and the signing key (`AUTH_SECRET`) does not change.

---

## 5. The `vercel.json` change (prepared, not applied)

```diff
--- a/vercel.json
+++ b/vercel.json
@@ -1,4 +1,5 @@
 {
+  "regions": ["fra1"],
   "functions": {
     "api/ai-doctor-chat.ts": {
       "maxDuration": 60,
```

One region only (Hobby allows exactly one; more would fail the deployment).
After it deploys, the deployment summary should show `fra1`. Optionally, also
set Project Settings > Functions > Function Regions to Frankfurt so the
dashboard and the file agree. **[FOUNDER OK]**

---

## 6. Rollback

| When | How | Data loss? |
|---|---|---|
| **R1. Before step 9** (writes still blocked) | Set `DATABASE_URL` back to the old US string, revert the `fra1` commit if it was merged, redeploy, then turn maintenance OFF. | **None.** Nothing was written anywhere during the window |
| **R2. After step 9** (users have written to Frankfurt) | **Do not simply point back**, or everything written since step 9 would disappear from view. Instead run the window again in reverse: maintenance ON, wait 5 min, copy Frankfurt -> a fresh US project (same commands, source and target swapped), verify PASS, switch `DATABASE_URL`, maintenance OFF. | None, if done this way |

The old US project stays **untouched for 14 days**. Nothing deletes it
automatically. Optional extra safety **[FOUNDER OK]**: right after step 10, make
the old database refuse writes so a forgotten script or old preview can't
write to it: in the Neon SQL editor of the **old** project run
`ALTER DATABASE neondb SET default_transaction_read_only = on;` (undo with
`... = off`).

After 14 days without problems **[FOUNDER OK]**: delete the old US project in
Neon (this also removes its US backups and history), then update
`docs/privacy-data-map.md` (region key: Neon = AWS eu-central-1, functions =
fra1) and the privacy policy wording.

---

## 7. Uploaded documents (Vercel Blob): options

The documents (12 files, ~101 MB) live in a **public** store in iad1. A store's
region can't be changed, and the app uses one Blob token for reading, writing
and deleting, so it can only talk to one store at a time.

| Option | What happens | Pros | Cons |
|---|---|---|---|
| **A. Copy files and update the links (recommended)** | Create a new store in **fra1**, copy every file to the same path (`<user_id>/…`), update `health_documents.file_path` row by row (compare-and-swap, old link kept in a backup column), then switch `BLOB_READ_WRITE_TOKEN` to the new store. | Everything in the EU; one store, so delete-account and export keep working | One more short window; needs a small script |
| B. Leave old files, send only new uploads to the EU | Switch the token to a new fra1 store; old files stay in iad1. | No copy | Old files become unreadable and undeletable for the app (one token = one store) unless code is changed to know two stores. Not EU-resident. **Not recommended** |
| C. Do nothing for now | Database moves; files stay in the US. | Simplest | Health documents remain in the US; the privacy wording must say so |

For option A there is already a ready-made, unrun plan in
`scripts/rotate-public-blobs.mjs` (2026-11-25) that copies public documents to
**private** blobs, verifies each copy by size, swaps the link only if the row
is unchanged, keeps the old link in `file_path_public_legacy` for an exact
rollback, and never deletes the old files. It already reads from one token
(`BLOB_READ_WRITE_TOKEN`) and writes with another
(`BLOB_PRIVATE_READ_WRITE_TOKEN`). Pointing the second token at a **new private
store in fra1** does the region move and the public-to-private change in one
pass. Do it as a separate window after the database move (run it against the
Frankfurt database). The new store's URL host still ends in
`.blob.vercel-storage.com`, which the app's security rules already allow. Old
files are deleted only after 30 days and only on the founder's word.
**[FOUNDER OK]** for creating the store, running the script, and switching the
token.

---

## 8. Smoke-test checklist (copy into the notes file)

- [ ] womanie.info loads; no maintenance banner (after step 9)
- [ ] Log in with the test account; log out; log in again
- [ ] Dashboard shows existing cycle data and lab trends
- [ ] Records: existing documents listed; one opens
- [ ] Upload a small PDF; it appears and opens; analysis runs
- [ ] AI chat: history visible; a new message gets an answer
- [ ] Save a daily signal / period day; reload; it is still there
- [ ] Settings: Download my data works
- [ ] Neon (Frankfurt) shows the new test rows; Neon (US) does not
- [ ] Vercel deployment summary shows `fra1`
- [ ] Sentry: no new error spike in the hour after

---

## 9. Steps that need the founder's OK (summary)

1. Create the Neon project `womanie-eu` in Frankfurt (free).
2. Pick the window; optional user notice.
3. Turn maintenance mode ON / OFF in production.
4. Switch `DATABASE_URL` to Frankfurt.
5. Merge the `fra1` region change (and optionally set it in the dashboard).
6. Optional: make the old database read-only after the move.
7. Delete the old US database after 14 days.
8. Blob: choose option A, B or C; for A, create the fra1 store and run the copy.
9. Decide how to handle the AI part (stays US/global; disclose it, or plan a separate Bedrock/Vertex EU project) and update the privacy wording.
