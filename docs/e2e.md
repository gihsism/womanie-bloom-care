# End-to-end tests (Playwright)

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
| `04-chat.spec.ts` | Ask AI: one question, a streamed (`text/event-stream`) answer appears; Past chats -> delete that one chat (cancel, then confirm) | iphone only = 1 model call per run. The test deletes its own chat in the UI; `afterAll` deletes it by `conversation_id` if the test stopped earlier. Other chats on the account are never touched |
| `05-records-me.spec.ts` | Records -> Documents tab; Me -> Profile | none |
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
