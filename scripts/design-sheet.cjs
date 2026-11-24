// Puts the design-shots.cjs screenshots side by side on one board.
//   node scripts/design-sheet.cjs [dir] [stage] [stage2]
const os = require('os');
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_DIR || path.join(os.homedir(), '.cache/womanie-ux/node_modules'), 'playwright'));

const DIR = process.argv[2] || path.join(os.homedir(), '.cache/womanie-ux/build4/round2');
const STAGES = process.argv.slice(3).length ? process.argv.slice(3) : ['pregnancy', 'menstrual-cycle'];
const SHOTS = [['records', 'Records'], ['records-flag-open', 'Records · flag opened'], ['records-documents', 'Records · Documents'], ['ask', 'Ask AI'], ['ask-answer', 'Ask AI · answer'], ['visits', 'Visits'], ['me', 'Me']];

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 40 + SHOTS.length * 420, height: 1000 }, deviceScaleFactor: 1.5 })).newPage();
  const img = (f) => `data:image/png;base64,${fs.readFileSync(path.join(DIR, f)).toString('base64')}`;
  const row = (stage) => `<div style="font:700 22px Figtree;margin:24px 0 10px">${stage}</div><div style="display:flex;gap:30px">${SHOTS.map(([s, t]) =>
    `<div><div style="font:600 17px Figtree;margin:0 0 8px 4px">${t}</div><img src="${img(`${stage}-${s}.png`)}" style="width:390px;height:844px;object-fit:cover;object-position:top;border-radius:30px;box-shadow:0 8px 24px rgba(0,0,0,.12)"></div>`).join('')}</div>`;
  await p.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&display=swap" rel="stylesheet"></head><body style="margin:0;background:#F4F1EE;padding:30px 40px;font-family:Figtree"><div style="font:700 30px Figtree">Womanie · idea 4 on Records, Ask AI, Visits and Me</div>${STAGES.map(row).join('')}</body></html>`);
  await p.waitForLoadState('networkidle');
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(DIR, 'all-pages.png'), fullPage: true });
  await b.close();
  console.log(path.join(DIR, 'all-pages.png'));
})();
