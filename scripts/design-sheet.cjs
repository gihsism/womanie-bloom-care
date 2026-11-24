// Puts the design-shots.cjs screenshots side by side on one board.
//   node scripts/design-sheet.cjs [dir] [stage] [stage2]
//   node scripts/design-sheet.cjs ~/.cache/womanie-ux/build4/doctor doctor   -> doctor-pages.png
//   node scripts/design-sheet.cjs ~/.cache/womanie-ux/build4/round4 first-run -> onboarding.png
//   node scripts/design-sheet.cjs ~/.cache/womanie-ux/build4/round4 public    -> public-pages.png
const os = require('os');
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_DIR || path.join(os.homedir(), '.cache/womanie-ux/node_modules'), 'playwright'));

const DIR = process.argv[2] || path.join(os.homedir(), '.cache/womanie-ux/build4/round2');
const STAGES = process.argv.slice(3).length ? process.argv.slice(3) : ['pregnancy', 'menstrual-cycle'];
const DOCTOR = STAGES[0] === 'doctor';
const FIRST_RUN = STAGES[0] === 'first-run';
const PUBLIC = STAGES[0] === 'public';
// Boards with many shots wrap onto rows of PER_ROW phones.
const FIRST_RUN_SHOTS = [['select-type', 'Get started'], ['login', 'Log in'], ['signup', 'Sign up'], ['welcome', 'Welcome'],
  ['1-stage', '1 · Stage'], ['1-stage-picked', '1 · Stage picked'], ['2-pregnancy-date', '2 · Pregnancy date'], ['3-pregnancy-more', '3 · Pregnancy more'],
  ['2-cycle-date', '2 · Last period'], ['3-cycle-focus', '3 · Main focus'], ['3-cycle-focus-picked', '3 · Focus picked'], ['4-about-you', '4 · About you'], ['5-done', '5 · Done']];
const PUBLIC_SHOTS = [['index', 'Landing'], ['product', 'Product'], ['for-patients', 'For patients'], ['pricing', 'Pricing'], ['about', 'About'], ['blog', 'Blog'],
  ['install', 'Install'], ['community', 'Community'], ['library', 'Research library'], ['health-statistics', 'Health statistics'], ['find-doctor', 'Find a doctor'], ['not-found', 'Not found']];
const PER_ROW = 7;
const SHOTS = FIRST_RUN ? FIRST_RUN_SHOTS : PUBLIC ? PUBLIC_SHOTS : DOCTOR
  ? [['dashboard', 'Doctor home'], ['appointments', 'Appointments'], ['cancel-dialog', 'Cancel a visit'], ['patient-summary', 'Patient · Summary'],
    ['patient-results', 'Patient · Results'], ['patient-notes', 'Patient · Notes'], ['login', 'Doctor log in'], ['for-doctors', 'For Doctors']]
  : [['records', 'Records'], ['records-flag-open', 'Records · flag opened'], ['records-documents', 'Records · Documents'], ['ask', 'Ask AI'], ['ask-answer', 'Ask AI · answer'], ['visits', 'Visits'], ['me', 'Me']];
const TITLE = FIRST_RUN ? 'Womanie · idea 4: log in, sign up and the first-run screens' : PUBLIC ? 'Womanie · idea 4: the public pages' : DOCTOR ? 'Womanie · idea 4 on the doctor side (clinic colours)' : 'Womanie · idea 4 on Records, Ask AI, Visits and Me';
const FILE = FIRST_RUN ? 'onboarding.png' : PUBLIC ? 'public-pages.png' : DOCTOR ? 'doctor-pages.png' : 'all-pages.png';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 40 + Math.min(SHOTS.length, PER_ROW) * 420, height: 1000 }, deviceScaleFactor: 1.5 })).newPage();
  const img = (f) => `data:image/png;base64,${fs.readFileSync(path.join(DIR, f)).toString('base64')}`;
  const row = (stage) => `<div style="font:700 22px Figtree;margin:24px 0 10px">${stage}</div><div style="display:flex;flex-wrap:wrap;gap:30px;width:${Math.min(SHOTS.length, PER_ROW) * 420}px">${SHOTS.map(([s, t]) =>
    `<div><div style="font:600 17px Figtree;margin:0 0 8px 4px">${t}</div><img src="${img(`${stage}-${s}.png`)}" style="width:390px;height:844px;object-fit:cover;object-position:top;border-radius:30px;box-shadow:0 8px 24px rgba(0,0,0,.12)"></div>`).join('')}</div>`;
  await p.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&display=swap" rel="stylesheet"></head><body style="margin:0;background:#F4F1EE;padding:30px 40px;font-family:Figtree"><div style="font:700 30px Figtree">${TITLE}</div>${STAGES.map(row).join('')}</body></html>`);
  await p.waitForLoadState('networkidle');
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(DIR, FILE), fullPage: true });
  await b.close();
  console.log(path.join(DIR, FILE));
})();
