# End-to-end tests (Playwright)

There are two suites:

- **Local suite** (`e2e-local/`, `npm run e2e:local`): the production build
  on your machine with a fake API. No network, no database, no account.
  Run it before every merge.
- **Live smoke suite** (`e2e/`, `npm run e2e`): the deployed site with the
  real test account. Described from "Run" below.

## Local suite (no network, no live DB)

```sh
npm run e2e:local                                   # build, then run all (~2 min)
npx playwright test -c e2e-local/playwright.config.ts            # rerun without rebuilding
npx playwright test -c e2e-local/playwright.config.ts --project=phone-390 -g Pregnancy
npx playwright show-report e2e-local/.report        # last HTML report
```

Playwright is the repo's own `@playwright/test` devDependency (1.56.1, the
same version as in `~/.cache/womanie-ux/node_modules`). In an agent worktree,
symlink `node_modules` to the main checkout's; never install there. Chromium
must be installed once (`npx playwright install chromium`).

How it works: the config starts `vite preview` on `127.0.0.1:4179`
(`E2E_LOCAL_PORT` overrides) and serves `dist/`. It does not reuse a server
already on that port (another worktree's preview would serve its own build
to your tests); a busy port fails at start. Pick another `E2E_LOCAL_PORT`,
or set `E2E_REUSE_SERVER=1` to reuse one on purpose. `e2e-local/mock-api.ts`
answers every `/api/**` request in the browser: `/api/db` is a small
in-memory table store (filters, order, limit, insert/update/upsert/delete),
so a saved log or a ticked medicine can be read back; Ask AI streams a canned
answer; anything off `127.0.0.1` (fonts, Sentry) gets an empty 204. The
service worker is blocked so it cannot bypass the mocks. A request no
handler knows is recorded, and every test asserts there were none, so a new
endpoint shows up as a failure until it gets a fixture.

Fixtures: `e2e-local/fixtures/account.json` (one patient: a medicine, a lab
document with two results, two periods, an upcoming visit) and
`fixtures/stages.json` (per-stage profile columns and the stage label).
Dates are tokens (`{{day:-12}}`, `{{at:5}}`) resolved against today.

Two projects: `phone-390` (390x844, touch) and `desktop` (1280x900). Tests
run in parallel; each starts from a fresh copy of the fixtures.

| File | Per life stage (all 9) |
|---|---|
| `journeys.spec.ts` | Home: log today (mood, save) and tick a medicine (0 -> 1 of 1, dose row written); Records -> Documents -> open the lab document -> Print / PDF view; Ask AI -> canned streamed answer; Visits -> next visit -> prep sheet -> Print (window.print called, toolbar hidden in print media); Me -> profile shows the email, life-stage picker shows the stage |
| `new-features.spec.ts` | Prep sheet: questions, medicines, results, plus the symptom diary only for menopause / post-menopause and the cycles + ovulation tests only for trying to conceive. Once: Ask AI "Ask my doctor about this" (saved to the next visit, or to the unscheduled list with no visit, and shown on the prep sheet); "Print this chat" (print page, no tab bar, toolbar hidden in print); baby Stats weekly summary -> print page; pregnancy Check-ups "Mark done" saved to `user_app_data`, then Undo |
| `round10.spec.ts` | Once: a critical result is the first Today row ("marked urgent by the lab"), the flagged count stays the Records total; Records lists flagged results once (no second "Results that need attention" card) with "20% below" relative to the limit; a visit that started 5 minutes ago is still "Your next visit" on Visits |
| `edge-cases.spec.ts` | Every main page (Home, stage page, Records, Ask AI, Visits, Me, prep sheet) renders with no error screen and no console errors, for a brand-new empty account and for rows whose optional columns are null |

Bugs it has caught: a period row with no `cycle_length` froze the stage page
(endless loop) and crashed Home's cycle dial (fixed in `useStageProfile`).

**Rule: any new `/api` endpoint gets a fixture in the same commit.** Add a
`case` for it in `e2e-local/mock-api.ts` (or a `json` override in the test)
in the commit that adds the `fetch`, then run `npm run e2e:local`. Otherwise
every page that calls it fails on `expect(api.unhandled).toEqual([])`.
Only same-origin `/api/**` requests count; other hosts (Sentry ingest also
uses `/api/<id>/envelope/`) get an empty 204. Builds with or without
`VITE_SENTRY_DSN` in `.env.local` must both pass.

Adding a journey: add data to the fixture JSON if needed, use role/text
selectors as below, and finish with `expect(api.unhandled).toEqual([])` and
`expect(consoleErrors).toEqual([])`. No visual assertions (screenshots are
only taken on failure).

---

# Live smoke suite

A small smoke suite that drives the deployed app in a real browser and
guards the critical patient flows. Run it before (or right after) a deploy.
It is separate from `npm run build` and from the vitest unit tests.

## Run

```sh
npm run e2e                                    # against https://womanie.info
E2E_BASE_URL=https://<preview>.vercel.app npm run e2e   # against a preview
npx playwright test --project=desktop          # one project only
npm run e2e:report                             # open the last HTML report
```

First time on a machine: `npx playwright install chromium`.

## Account and password

All tests use the test account `ux-review@womanie.test` only (`E2E_EMAIL`
overrides the address; the nightly run sets it from a secret). The password
comes from `E2E_PASSWORD`, or else is read at runtime from
`~/.cache/womanie-ux/.pw`. It is typed only in `e2e/global-setup.ts`, which
runs outside Playwright's tracing, so it never appears in traces,
screenshots or reports. Never commit it.

Login sessions are saved in `e2e/.auth/` (git-ignored) and **reused while
they are still valid**: the server allows only 30 sign-in attempts per email
per day (UTC), shared with every other tool that uses this account. A normal
run costs one login (the iphone project logs out at the end; the desktop
session is kept). `E2E_FRESH_LOGIN=1` forces new logins. If setup fails with
`HTTP 429 Too many sign-in attempts`, wait for the time it reports.

## Nightly run (GitHub Actions)

`.github/workflows/nightly-e2e.yml` runs `npm run e2e` against
https://womanie.info every day at 05:30 UTC (and on demand: Actions ->
Nightly smoke (e2e) -> Run workflow). It needs four repository secrets:
`E2E_EMAIL`, `E2E_PASSWORD` (the test account) and `TG_BOT_TOKEN`,
`TG_CHAT_ID` (Telegram). On failure it uploads `e2e/.report` and
`e2e/.results` as the artifact `e2e-report-<run id>` (14 days) and sends a
Telegram message with the run link; open the report with
`npx playwright show-report <unzipped folder>`.

In CI every run logs in fresh (2 sign-ins: iphone + desktop) and
`e2e/global-teardown.ts` logs both sessions out at the end, so a session
cookie inside an uploaded trace is already dead (the repo is public).
`CI=true` also gives each test one retry.

## What it covers

Two projects: `iphone` (iPhone 15 viewport, touch, Chromium) and `desktop`
(Desktop Chrome). One worker, files in order, because the tests share one
account.

| File | Flow | Data it changes, and how it is cleaned up |
|---|---|---|
| `global-setup.ts` | Log in through the login form | — |
| `01-today.spec.ts` | Home (Today) loads with no console errors | none |
| `02-stage-and-log.spec.ts` | Me -> Life stage: switch to Period tracking (or Menopause), Home follows; on that stage open the Log sheet, tick a mood and a symptom, save, reopen, untick, save; switch back | `afterAll` restores today's mood/symptoms (or deletes today's row if there was none) and puts `profiles.life_stage` back, unless another tool changed it meanwhile |
| `03-new-flows.spec.ts` | (a) Find a Doctor -> profile -> book a next free time (first try 409) -> "Your visit is booked" -> Notifications "Booking confirmed", all doctor/booking APIs mocked in the browser; (b) pregnancy week 37: contraction timer with a fake clock (no banner for short ones, "building", "time to call" after ~52 min, offline save marked "not synced yet" then synced), Clear history; (c) menopause: HRT questions -> Add to Questions to bring (twice: second adds nothing) -> on the visit summary | (a) none; `afterAll` deletes the contractions the run created and the unscheduled questions list (if there was none before) and puts `profiles.life_stage` and `pregnancy_due_date` back |
| `04-chat.spec.ts` | Ask AI: one question, a streamed (`text/event-stream`) answer appears; Past chats -> delete that one chat (cancel, then confirm) | iphone only = 1 model call per run. The test deletes its own chat in the UI; `afterAll` deletes it by `conversation_id` if the test stopped earlier. Other chats on the account are never touched |
| `05-records-me.spec.ts` | Records -> Documents tab; Me -> Profile | none |
| `06-birth-plan-and-pill.spec.ts` | (a) pregnancy week 32: Birth plan -> tick a Feeding wish + note, "Saved" -> Print or save PDF -> the sheet shows wish, note, due date and footer; toolbar hidden in print media; (b) contraception: Missed-pill steps -> "Under 3 h" = late, still protected; "48 h or more" = missed with extra protection; "change pill type" closes the sheet | `afterAll` puts the `birth_plans` row back (deletes it if there was none) and `profiles.life_stage` / `pregnancy_due_date` |
| `99-logout.spec.ts` | Me -> Log out; session is gone, `/dashboard` sends you away | iphone only |

Other tools (design screenshots, UX sweeps) log in as the same account and
switch its life stage, so the stage-and-log group runs serially with one
retry, and it does not assume any particular stage on Home.

There is no doctor-side test: no doctor test account exists, and the suite
does not create accounts.

## Writing more tests

- Role and text selectors (`getByRole`, `getByText`, `getByTestId` for
  `me-row-*`), never CSS classes, never fixed sleeps (`waitForTimeout`).
- Anything a test creates is removed in `afterAll`, which runs even when
  the test fails. `e2e/helpers.ts` has `apiDb()` for the owner-scoped
  `/api/db` calls the app itself makes.
- Use the `test` / `expect` exported from `e2e/helpers.ts`; it adds the
  `consoleErrors` fixture.
