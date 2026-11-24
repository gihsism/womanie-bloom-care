// Design harness for the tab pages (Records, Ask AI, Visits, Me).
// Runs the REAL pages on a local Vite dev server with every /api call
// answered from the fixtures below (Playwright route interception), so
// nothing dev-only is added to the app or its production bundle.
//
//   npx vite --port 8093 &
//   node scripts/design-shots.cjs [baseUrl] [stage] [only] [outDir]
//
// Needs Playwright (PLAYWRIGHT_DIR, default ~/.cache/womanie-ux/node_modules).
const os = require('os');
const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_DIR || path.join(os.homedir(), '.cache/womanie-ux/node_modules'), 'playwright'));

const BASE = process.argv[2] || 'http://localhost:8093';
const STAGE = process.argv[3] || 'pregnancy';
const ONLY = process.argv[4] || '';
const OUT = process.argv[5] || path.join(os.homedir(), '.cache/womanie-ux/build4/round2');
const UID = 'u-demo';
const day = (n, h = 9, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); d.setDate(d.getDate() + n); return d; };
const ymd = (d) => d.toISOString().slice(0, 10);
const nextThu = (() => { const d = day(0, 10, 30); d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7)); return d; })();

const lab = (id, title, value, unit, range, status, panel, n = -12, doc = 'd1') => ({
  id, data_type: 'lab_result', title, value, unit, reference_range: range, status, date_recorded: ymd(day(n)), notes: null,
  created_at: day(n).toISOString(), document_id: doc, raw_data: { panel },
});

const FIX = {
  profiles: [{ id: UID, full_name: 'Anna Keller', first_name: 'Anna', life_stage: STAGE, pregnancy_due_date: ymd(day(70)), date_of_birth: '1993-04-12', email: 'anna@example.com' }],
  current_extracted_data: [
    lab('l1', 'Ferritin', '12', 'µg/L', '15-150', 'abnormal', 'Iron'),
    lab('l2', 'TSH', '4.8', 'mIU/L', '0.4-4.0', 'abnormal', 'Thyroid'),
    lab('l3', 'Haemoglobin', '118', 'g/L', '110-150', 'normal', 'Blood count'),
    lab('l4', 'White cells', '7.2', '10^9/L', '4.0-11.0', 'normal', 'Blood count'),
    lab('l5', 'Platelets', '240', '10^9/L', '150-400', 'normal', 'Blood count'),
    lab('l6', 'Iron', '9', 'µmol/L', '9-30', 'normal', 'Iron'),
    lab('l7', 'Free T4', '13', 'pmol/L', '12-22', 'normal', 'Thyroid'),
    lab('l8', 'Creatinine', '62', 'µmol/L', '45-90', 'normal', 'Liver and kidneys'),
    lab('l9', 'ALT', '18', 'U/L', '0-35', 'normal', 'Liver and kidneys'),
    lab('l10', 'Glucose (fasting)', '4.6', 'mmol/L', '3.9-5.5', 'normal', 'Sugar'),
  ],
  health_documents: [
    { id: 'd1', file_name: 'blood-test-nov.pdf', file_path: 'x/d1.pdf', mime_type: 'application/pdf', ai_suggested_name: 'Blood test · 12 Nov', ai_summary: 'Iron stores are low; thyroid slightly high. Everything else normal.', ai_suggested_category: 'lab_results', uploaded_at: day(-12).toISOString(), document_type: 'lab_results' },
    { id: 'd2', file_name: 'ultrasound-20w.pdf', file_path: 'x/d2.pdf', mime_type: 'application/pdf', ai_suggested_name: 'Anatomy scan · week 20', ai_summary: 'Baby growing as expected, placenta high.', ai_suggested_category: 'imaging', uploaded_at: day(-70).toISOString(), document_type: 'imaging' },
    { id: 'd3', file_name: 'prescription.jpg', file_path: 'x/d3.jpg', mime_type: 'image/jpeg', ai_suggested_name: 'Prescription · iron tablets', ai_summary: 'Ferrous sulfate 200 mg once a day.', ai_suggested_category: 'prescription', uploaded_at: day(-10).toISOString(), document_type: 'prescription' },
  ],
  user_roles: [{ role: 'patient' }],
};
FIX.medical_extracted_data = FIX.current_extracted_data;

const doctor = { doctor_name: 'Laura Meier', doctor_title: 'Dr.', doctor_specialties: ['Gynaecology & obstetrics'], doctor_avatar_url: null, doctor_verified: true };
const APPTS = [
  { id: 'a1', doctor_id: 'doc1', scheduled_at: nextThu.toISOString(), status: 'scheduled', consultation_type: 'in_person', duration: 30, payment_status: 'paid', notes: null, ...doctor },
  { id: 'a2', doctor_id: 'doc2', scheduled_at: day(24, 14, 0).toISOString(), status: 'scheduled', consultation_type: 'video', duration: 20, payment_status: 'paid', notes: null, ...doctor, doctor_name: 'Sara Rossi', doctor_specialties: ['Midwife'] },
  { id: 'a3', doctor_id: 'doc1', scheduled_at: day(-28, 9, 0).toISOString(), status: 'completed', consultation_type: 'in_person', duration: 30, payment_status: 'paid', notes: null, ...doctor },
];

// Extra answers per API path (filled in as the pages need them).
const API = {
  '/api/me/appointments': { appointments: APPTS },
  '/api/me/doctor-notes': { notes: [
    { id: 'n1', doctor_id: 'doc1', title: 'Iron supplement', content: 'Take ferrous sulfate 200 mg once a day with orange juice; recheck ferritin in 6 weeks.', note_type: 'treatment_plan', created_at: day(-10).toISOString(), ...doctor },
  ] },
};

// Ask AI: one streamed answer with two numbered sources.
const ANSWER = 'Yes, it is common. Your bump shifts your balance and hormones loosen the joints in your pelvis [1].\n\n'
  + 'A pillow between your knees at night and a warm bath often help [2].\n\n'
  + '**Call your midwife today** if the pain comes in waves, or with bleeding or fever [1].';
const SOURCES = [
  { n: 1, id: 's1', pmid: '1', title: 'Low back and pelvic pain in pregnancy', source: 'Cochrane Review', year: 2015, url: 'https://example.org/1' },
  { n: 2, id: 's2', pmid: '2', title: 'Exercise and comfort measures for back pain during pregnancy', source: 'BMC Pregnancy', year: 2021, url: 'https://example.org/2' },
];
const sse = () => [
  `data: ${JSON.stringify({ sources: SOURCES })}`,
  ...ANSWER.match(/.{1,40}/gs).map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}`),
  'data: [DONE]', '',
].join('\n\n');

const unknown = new Set();
async function route(r) {
  const req = r.request();
  const p = new URL(req.url()).pathname;
  const json = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (p === '/api/auth/me') return json({ user: { id: UID, email: 'anna@example.com', name: 'Anna Keller', hasPassword: true, created_at: day(-200).toISOString() } });
  if (p === '/api/db') {
    let b = {};
    try { b = JSON.parse(req.postData() || '{}'); } catch { /* not JSON */ }
    if (b.operation && b.operation !== 'select') return json({ rows: [] });
    let rows = FIX[b.table];
    if (!rows) { unknown.add(`db:${b.table}`); rows = []; }
    if (b.limitCount) rows = rows.slice(0, b.limitCount);
    return json({ rows });
  }
  if (p === '/api/ai-doctor-chat') return r.fulfill({ status: 200, contentType: 'text/event-stream', body: sse() });
  if (p === '/api/chat/messages' && req.method() === 'GET') return json({ messages: [], hasMore: false });
  if (API[p]) return json(typeof API[p] === 'function' ? API[p](req) : API[p]);
  unknown.add(`${req.method()} ${p}`);
  return json({});
}

const PAGES = [
  ['records', '/dashboard/medical-history'],
  ['records-documents', '/dashboard/medical-history', async (p) => { await p.getByRole('tab', { name: 'Documents' }).first().click(); }],
  ['ask', '/dashboard/ai-doctor'],
  ['ask-answer', '/dashboard/ai-doctor', async (p) => {
    await p.getByPlaceholder(/ask about/i).fill('Is back pain normal at 30 weeks?');
    await p.getByRole('button', { name: 'Send' }).click();
    await p.waitForTimeout(1500);
  }],
  ['records-flag-open', '/dashboard/medical-history', async (p) => { await p.getByRole('button', { name: /Ferritin · 12/ }).click(); }],
  ['visits', '/dashboard/appointments'],
  ['me', '/dashboard/settings'],
];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((s) => { try { localStorage.setItem('womanie_stage_theme', s); } catch { /* blocked */ } }, STAGE);
  await ctx.route('**/api/**', route);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
  for (const [name, url, act] of PAGES) {
    if (ONLY && !name.startsWith(ONLY)) continue;
    await p.goto(BASE + url, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1200);
    if (act) { await act(p); await p.waitForTimeout(600); }
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT, `${STAGE}-${name}.png`) });
    // Whole page with the tab bar at the bottom (a tall viewport, not fullPage,
    // so the fixed bar is not painted half-way down).
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.setViewportSize({ width: 390, height: Math.min(6000, Math.max(844, h)) });
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, `${STAGE}-${name}-full.png`) });
    await p.setViewportSize({ width: 390, height: 844 });
    console.log('shot', name);
  }
  console.log('unhandled:', [...unknown].join(', '));
  await b.close();
})();
