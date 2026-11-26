# Switching on design "idea 4 · colour by stage"

The new design lives on branch `design-idea4` (preview deploys only). It goes
live only when the founder says **"switch on"**. This is the checklist for that
day. Work top to bottom; every step has a check.

## 0. Before you start

- [ ] The founder has said "switch on" (in writing: Telegram or chat).
- [ ] Nobody else is mid-merge into `main` (check `git log origin/main -5` and
      any open agent worktrees). Pick a quiet hour: the switch reloads every
      open tab and home-screen app once (see section 4).
- [ ] Note the current production commit so you know what you are leaving:
      `git rev-parse origin/main` -> write it down as `PRE_SWITCH`.

## 1. Bring the design branch up to date (on the branch, not on main)

```sh
git fetch origin
git checkout -b switch-on origin/design-idea4
git merge --no-edit origin/main          # main's newest work into the design
```

- Resolve conflicts **toward idea 4 classes** (`page-title`, `section-title`,
  `row-group`, `panel`, `btn-stage`, `text-stage-accent`, `border-line`) while
  keeping main's behaviour (new props, new rows, new copy). Earlier rounds'
  merge commits on `design-idea4` show the pattern.
- Any screen main added since the last design round: give it the idea-4 look
  (see "New screens" below) before going on.

## 2. The CSP hash (vercel.json)

The enforced Content-Security-Policy allows inline scripts **only by hash**.
Idea 4 adds one inline script to `index.html` (night mode before first paint),
so `vercel.json` on the design branch carries a second hash:

```
script-src 'self'
  'sha256-Gv2vN7Dp722KtCyYFA4iv/HU5mdu4CIjDDmWsQjHm2o='   <- early session check (already on main)
  'sha256-5zlz/6vEYlijUH6pnl8DfLnTFxxECKYdk76+fByV4uo='   <- idea 4: night mode before first paint
```

- [ ] After the merge, `vercel.json` must contain **both** hashes. If main
      changed `vercel.json` in the meantime, keep main's version and add the
      second hash to its `script-src`.
- [ ] If either inline `<script>` in `index.html` changed (even whitespace),
      recompute: `npx vitest run src/lib/cspHashes.test.ts` fails and prints
      the script. Print the hash of every inline script with:

      ```sh
      node -e "const h=require('fs').readFileSync('index.html','utf8');for(const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g))console.log('sha256-'+require('crypto').createHash('sha256').update(m[1],'utf8').digest('base64'))"
      ```
- [ ] `src/lib/cspHashes.test.ts` is green. A missing hash is silent in
      production: the browser just blocks the script (white flash at night,
      slower first load), nothing errors.

## 3. Gate (on `switch-on`)

```sh
npm run build          # tsc -b + vite build
npx vitest run         # all tests, including the CSP hash test
```

Both must pass. Then run the visual harness once against a local dev server
(no test-account writes; every API call is answered from fixtures):

```sh
npx vite --port 8093 &
AUDIT=1 node scripts/design-shots.cjs http://localhost:8093 pregnancy
AUDIT=1 node scripts/design-shots.cjs http://localhost:8093 doctor
AUDIT=1 node scripts/design-shots.cjs http://localhost:8093 first-run
```

`AUDIT=1` prints overflow, clipped text, tap targets under 44px, contrast
under WCAG AA and missing focus rings. Expect no lines other than `shot ...`.

## 4. Caching and the service worker: what happens on deploy

- `vercel.json` serves `/assets/*` with
  `Cache-Control: public, max-age=31536000, immutable`. File names are content
  hashed, so a **forward** deploy is safe: new HTML points at new file names.
- HTML and every app route are `no-cache, must-revalidate` (`/` and `/auth/*`
  are `no-store`), so browsers always ask for the newest `index.html`.
- The PWA service worker (vite-plugin-pwa, `registerType: "autoUpdate"`)
  precaches the build. On the first visit after the deploy it installs the new
  worker; `src/main.tsx` then reloads the page **once**, only when that cannot
  lose typing (in the first 15 s after opening, or while the app is in the
  background). Home-screen apps check for an update every time they come back
  to the foreground.
- A tab still holding the old build that lazy-loads a chunk gets
  `vite:preloadError` -> `reloadOnceForStaleChunk()` drops the offline cache
  and reloads into the new design. Old chunks stay downloadable from the
  browser cache in the meantime (immutable), so nothing breaks mid-session.
- `localStorage` keys the design reads (`womanie_color_scheme`,
  `womanie_stage_theme`) are new and optional; old clients ignore them.

**Never roll back with Vercel's "Instant Rollback" / "Promote previous
deployment".** The old deployment's `index.html` would reference the old hashed
assets, but any browser or service worker that already cached the new
`index.html` plus a year of `immutable` assets can end up mixing builds, and
the service worker precache only moves forward on a new build. If a rollback
via Vercel is ever unavoidable, first deploy a commit that relaxes the
`/assets/(.*)` header to `public, max-age=0, must-revalidate`, wait for it to be
live, then roll back. The normal way back is section 7.

## 5. Merge and deploy

```sh
git checkout main && git pull --no-rebase origin main
git merge --no-ff switch-on -m "Switch on design idea 4 (colour by stage)"
npm run build && npx vitest run      # once more, on main
git push origin main                 # Vercel deploys production from main
```

(With merge commits never `pull --rebase`.) Record the merge commit as
`SWITCH_ON`.

## 6. Smoke tests on womanie.info (after the deploy is "Ready")

Use the real site with the existing review account only for **reading**; do
not log, upload or book anything.

- [ ] `/` landing loads, no console CSP errors (DevTools -> Console: nothing
      like "Refused to execute inline script").
- [ ] Response headers on `/`: CSP contains both `sha256-` hashes; on a
      `/assets/*.js` file: `immutable`.
- [ ] Log in -> Home shows the stage header (one big fact, "Log today", max 3
      Today rows) in the stage colour; tab bar Home / Records / Ask AI /
      Visits / Me.
- [ ] Night mode: system dark -> reload -> no white flash, dark header.
- [ ] Me -> Appearance: Light / Dark / Automatic switch instantly.
- [ ] Me -> Life stage: switching the stage recolours Home.
- [ ] Records, Ask AI (send nothing), Visits, Me -> Reminders (Phone
      notifications card shows; do not switch it on) all render.
- [ ] Doctor login (review doctor account): Your day, Needs you, patient list,
      a chart's "New since last visit" render in the neutral clinic colours.
- [ ] An already-open tab from before the deploy: bring it to the front ->
      it reloads once into the new design (or on next navigation).
- [ ] Installed iPhone home-screen app: close fully, reopen -> new design
      within one reopen.
- [ ] Sentry: no new error group in the first 30 minutes.

## 7. Reverting safely (forward revert, never a Vercel rollback)

```sh
git checkout main && git pull --no-rebase origin main
git revert -m 1 <SWITCH_ON> --no-edit   # undo the merge as a NEW commit
npm run build && npx vitest run
git push origin main
```

- This is a new deploy with new asset hashes, so caches, the service worker
  and open tabs move forward to the old look the same way they moved to the
  new one (section 4). User data is untouched: the design branch changes no
  API, database table or stored field (check with
  `git diff PRE_SWITCH SWITCH_ON --stat -- api db` -> empty).
- The reverted `vercel.json` drops the night-mode hash together with the
  night-mode script, which is correct; the CSP test stays green.
- To switch on again later, revert the revert (`git revert <revert-commit>`),
  not a fresh merge of the old branch.

## New screens: the idea-4 look in one paragraph

Page head `page-head` + `page-title`/`page-sub` (sub-pages: `SubPageHeader`);
section headings `section-title`; lists in one `row-group` (hairline rows,
`min-h-14 px-4 py-3`, title `text-[17px] font-medium`, detail `text-[14px]
text-muted-foreground`, icon `h-5 w-5 text-stage-accent`, chevron right); a
block of content in a `panel`; ONE primary action per page as `btn-stage`;
tints `bg-stage-tint text-stage-accent` instead of amber/primary; alerts
`text-destructive` at full strength (never `/80`); every tap target 44px or
more (compact buttons keep their look and get `relative hit-44`).

## Optional follow-ups (not blockers)

- The PWA manifest (`vite.config.ts`) still says `theme_color` /
  `background_color` `#F7ECE9` (the old beige) while idea 4's
  `<meta name="theme-color">` is `#FFFFFF`; Android uses the manifest colour
  for the installed app's splash and title bar until the page loads.
