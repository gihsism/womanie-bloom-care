// Design harness for the tab pages (Records, Ask AI, Visits, Me).
// Runs the REAL pages on a local Vite dev server with every /api call
// answered from the fixtures below (Playwright route interception), so
// nothing dev-only is added to the app or its production bundle.
//
//   npx vite --port 8093 &
//   node scripts/design-shots.cjs [baseUrl] [stage] [only] [outDir]
//   node scripts/design-shots.cjs [baseUrl] doctor [only] [outDir]   (doctor side)
//   node scripts/design-shots.cjs [baseUrl] first-run [only] [outDir] (log in, sign up, Welcome, onboarding)
//   node scripts/design-shots.cjs [baseUrl] public [only] [outDir]    (landing and the other public pages)
//
//   COLOR_SCHEME=dark node scripts/design-shots.cjs ...  (emulated system dark/light;
//     files get a -dark / -light suffix; night mode follows it by default)
//
// Needs Playwright (PLAYWRIGHT_DIR, default ~/.cache/womanie-ux/node_modules).
const os = require('os');
const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_DIR || path.join(os.homedir(), '.cache/womanie-ux/node_modules'), 'playwright'));

const BASE = process.argv[2] || 'http://localhost:8093';
const STAGE = process.argv[3] || 'pregnancy';
const ONLY = process.argv[4] || '';
const DOCTOR_SIDE = STAGE === 'doctor';
const FLOW_SIDE = STAGE === 'first-run' || STAGE === 'public';
const OUT = process.argv[5] || path.join(os.homedir(), '.cache/womanie-ux/build4', DOCTOR_SIDE ? 'doctor' : FLOW_SIDE ? 'round4' : 'round2');
const SCHEME = process.env.COLOR_SCHEME || ''; // '', 'light' or 'dark'
const SUFFIX = SCHEME ? `-${SCHEME}` : '';
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

// Public pages and the first run: a few doctors and library entries.
const DOCTORS = [
  { id: 'dp1', user_id: 'doc1', full_name: 'Laura Meier', title: 'Dr.', specialty: 'Gynaecology & obstetrics', specialties: ['Gynaecology & obstetrics'], bio: 'Gynaecologist in Zürich. Pregnancy care, cycle problems, menopause.', avatar_url: null, is_verified: true, years_experience: 14, languages: ['English', 'German'], rating: 4.9, review_count: 38, consultation_settings: { consultation_price: 120, currency: 'CHF', consultation_duration: 30, video_enabled: true, is_available: true } },
  { id: 'dp2', user_id: 'doc2', full_name: 'Sara Rossi', title: null, specialty: 'Midwife', specialties: ['Midwife'], bio: 'Midwife. Pregnancy, birth preparation and the weeks after birth.', avatar_url: null, is_verified: true, years_experience: 9, languages: ['English', 'Italian'], rating: 4.8, review_count: 21, consultation_settings: { consultation_price: 80, currency: 'CHF', consultation_duration: 20, video_enabled: true, is_available: true } },
];
const LIB_ITEM = (id, title, source, year, evidenceLevel, summary) => ({ id, pmid: id, title, source, year, evidenceLevel, certainty: 'moderate', landmark: false, url: 'https://example.org/' + id, summary, keyPoints: [], lifeStages: ['pregnancy'], topics: ['nutrition'], tags: [] });
const LIBRARY = { version: '1', disclaimer: '', stage: 'all', topic: null, total: 3,
  topics: [{ id: 'nutrition', label: 'Food and supplements', count: 2 }, { id: 'pain', label: 'Pain', count: 1 }],
  items: [
    LIB_ITEM('101', 'Iron supplements in pregnancy', 'Cochrane Review', 2024, 'systematic review', 'Daily iron lowers the chance of anaemia at birth; side effects such as constipation are common.'),
    LIB_ITEM('102', 'Caffeine and pregnancy outcomes', 'BMJ', 2022, 'systematic review', 'Up to about 200 mg of caffeine a day (two cups of coffee) is not linked to harm.'),
    LIB_ITEM('103', 'Antenatal care for a positive pregnancy experience', 'WHO guideline', 2016, 'guideline', 'Eight contacts with a midwife or doctor during pregnancy are recommended.'),
  ] };

const unknown = new Set();
let anon = false; // log in / sign up / public pages: nobody is signed in
async function route(r) {
  const req = r.request();
  const p = new URL(req.url()).pathname;
  const json = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (p === '/api/auth/me' && anon) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Not signed in"}' });
  if (p === '/api/doctors/list') return json({ doctors: DOCTORS });
  if (p === '/api/research/library') return json(LIBRARY);
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
  ['home', '/dashboard'],
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
  // Sub-pages (one level below a tab): the stage page ("Track"), Me's rows,
  // and the pages Records links to.
  ['track', '/dashboard/stage'],
  ['me-profile', '/dashboard/settings#profile'],
  ['me-reminders', '/dashboard/settings#reminders'],
  ['attention', '/dashboard/notifications'],
  ['emergency', '/dashboard/emergency'],
  ['devices', '/dashboard/devices'],
  ['help', '/dashboard/help'],
  ['privacy', '/dashboard/privacy'],
  ['compare', '/dashboard/compare'],
  ['panel', '/dashboard/panel/iron'],
  ['baby', '/dashboard/baby'],
  ['birth', '/dashboard/birth'],
];

// ---- Doctor side: Dr. Laura Meier, three patients, a day of visits ----
const DOC_ID = 'doc1';
const soon = new Date(Date.now() + 90 * 60_000); // a visit later today
const DOCTOR_FIX = {
  user_roles: [{ role: 'doctor' }],
  doctor_profiles: [{ id: 'dp1', user_id: DOC_ID, full_name: 'Dr. Laura Meier', specialty: 'Gynaecology & obstetrics', is_verified: true, verification_status: 'approved', bio: 'Gynaecologist in Zürich. Pregnancy care, cycle problems, menopause.', consultation_price: 120, accepts_bookings: true }],
  appointments: [
    { id: 'v1', doctor_id: DOC_ID, patient_id: 'p1', scheduled_at: soon.toISOString(), status: 'scheduled', consultation_type: 'in_person', duration: 30, notes: null },
    { id: 'v2', doctor_id: DOC_ID, patient_id: 'p2', scheduled_at: day(2, 9, 0).toISOString(), status: 'scheduled', consultation_type: 'video', duration: 20, notes: null },
    { id: 'v3', doctor_id: DOC_ID, patient_id: 'p3', scheduled_at: day(-1, 11, 0).toISOString(), status: 'scheduled', consultation_type: 'in_person', duration: 30, notes: null },
    { id: 'v4', doctor_id: DOC_ID, patient_id: 'p1', scheduled_at: day(-28, 9, 0).toISOString(), status: 'completed', consultation_type: 'in_person', duration: 30, notes: null },
    { id: 'v5', doctor_id: DOC_ID, patient_id: 'p2', scheduled_at: day(-12, 16, 0).toISOString(), status: 'no_show', consultation_type: 'video', duration: 20, notes: null },
  ],
};
const CONNECTIONS = [
  { id: 'c1', patient_id: 'p1', status: 'approved', created_at: day(-120).toISOString(), connection_type: 'code', patient_full_name: 'Anna Keller', patient_life_stage: 'pregnancy', last_upload_at: day(-1).toISOString(), recent_doc_count: 2 },
  { id: 'c2', patient_id: 'p2', status: 'approved', created_at: day(-90).toISOString(), connection_type: 'code', patient_full_name: 'Sofia Brunner', patient_life_stage: 'menopause', last_upload_at: day(-20).toISOString(), recent_doc_count: 0 },
  { id: 'c3', patient_id: 'p3', status: 'approved', created_at: day(-60).toISOString(), connection_type: 'code', patient_full_name: 'Lea Frei', patient_life_stage: 'conception', last_upload_at: null, recent_doc_count: 0 },
  { id: 'c4', patient_id: 'p4', status: 'pending', created_at: day(-1).toISOString(), connection_type: 'code', patient_full_name: 'Mia Huber', patient_life_stage: null },
];
const CHART = {
  profile: { id: 'p1', full_name: 'Anna Keller', life_stage: 'pregnancy', pregnancy_due_date: ymd(day(70)), ivf_phase: null },
  healthSignals: [
    { id: 'h1', signal_date: ymd(day(-1)), symptoms: ['back pain', 'tiredness'], mood: ['calm'], discharge: null, notes: 'Worse in the evening.' },
    { id: 'h2', signal_date: ymd(day(-3)), symptoms: ['heartburn'], mood: ['tired'], discharge: null, notes: null },
  ],
  documents: FIX.health_documents,
  medicalData: FIX.current_extracted_data.map((r) => ({ ...r, status: r.status === 'abnormal' ? (r.title === 'Ferritin' ? 'low' : 'high') : r.status })),
  notes: [
    { id: 'n1', title: 'Iron supplement', content: 'Ferrous sulfate 200 mg once a day with orange juice. Recheck ferritin in 6 weeks.', note_type: 'recommendation', created_at: day(-10).toISOString(), is_visible_to_patient: true },
    { id: 'n2', title: 'TSH borderline', content: 'Repeat TSH and free T4 at the next visit before deciding on treatment.', note_type: 'follow_up', created_at: day(-10).toISOString(), is_visible_to_patient: false },
  ],
  appointments: [{ id: 'v1', scheduled_at: soon.toISOString(), status: 'scheduled', consultation_type: 'in_person', notes: null, duration: 30 },
    { id: 'v4', scheduled_at: day(-28, 9, 0).toISOString(), status: 'completed', consultation_type: 'in_person', notes: null, duration: 30 }],
  periodRecords: [],
  visitQuestions: [{ appointment_id: 'v1', scheduled_at: soon.toISOString(), updated_at: day(-1).toISOString(), questions: [
    { id: 'q1', text: 'Should I keep taking the iron tablets after the birth?', asked: false },
    { id: 'q2', text: 'Is the back pain at night normal?', asked: false },
  ] }],
};

async function doctorRoute(r) {
  const req = r.request();
  const u = new URL(req.url());
  const p = u.pathname;
  const json = (o, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
  if (p === '/api/auth/me') return json({ user: { id: DOC_ID, email: 'laura.meier@example.com', name: 'Laura Meier', hasPassword: true, created_at: day(-400).toISOString() } });
  if (p === '/api/db') {
    let b = {};
    try { b = JSON.parse(req.postData() || '{}'); } catch { /* not JSON */ }
    if (b.operation && b.operation !== 'select') return json({ rows: [] });
    let rows = DOCTOR_FIX[b.table];
    if (!rows) { unknown.add(`db:${b.table}`); rows = []; }
    return json({ rows });
  }
  if (p === '/api/doctors/connections') return json({ connections: CONNECTIONS });
  // Same consent rule as the server: only an approved connection opens a chart.
  if (p === '/api/doctors/patient') return u.searchParams.get('id') === 'p1' ? json(CHART) : json({ error: 'no access' }, 403);
  unknown.add(`${req.method()} ${p}`);
  return json({});
}

// ---- First run: log in, sign up, Welcome, then the onboarding screens ----
// An entry's 4th field = signed out. Onboarding answers live in the
// onboarding context (localStorage), so each shot clicks through from
// the stage picker; the device starts with no stage remembered.
const pick = (label) => async (p) => { await p.getByRole('radio', { name: new RegExp(label) }).click(); };
const next = async (p) => { await p.getByRole('button', { name: /^Continue$/ }).click(); await p.waitForTimeout(400); };
const pickDay = async (p) => { // the 1st of this month
  await p.getByRole('button', { name: /Last period started/ }).click();
  await p.locator('button[role="gridcell"]:not([disabled])').first().click();
  await p.keyboard.press('Escape');
};
const pregnancyToAbout = async (p) => {
  await pick('Pregnancy')(p); await next(p);
  await p.getByRole('radio', { name: 'Current week' }).click();
  await p.getByLabel(/Week of pregnancy/).fill('24');
  await next(p);
  await p.getByRole('radio', { name: 'Yes' }).click();
  await next(p);
};
const FIRST_RUN_PAGES = [
  ['select-type', '/auth/select-type', null, true],
  ['login', '/auth/login', null, true],
  ['signup', '/auth/signup', null, true],
  ['welcome', '/welcome'],
  ['1-stage', '/onboarding/life-stage'],
  ['1-stage-picked', '/onboarding/life-stage', pick('Pregnancy')],
  ['2-pregnancy-date', '/onboarding/life-stage', async (p) => { await pick('Pregnancy')(p); await next(p); }],
  ['3-pregnancy-more', '/onboarding/life-stage', async (p) => {
    await pick('Pregnancy')(p); await next(p);
    await p.getByRole('radio', { name: 'Current week' }).click();
    await p.getByLabel(/Week of pregnancy/).fill('24');
    await next(p);
  }],
  ['2-cycle-date', '/onboarding/life-stage', async (p) => { await pick('Period tracking')(p); await next(p); await pickDay(p); }],
  ['3-cycle-focus', '/onboarding/life-stage', async (p) => {
    await pick('Period tracking')(p); await next(p);
    await pickDay(p);
    await next(p);
  }],
  ['3-cycle-focus-picked', '/onboarding/life-stage', async (p) => {
    await pick('Period tracking')(p); await next(p);
    await pickDay(p);
    await next(p);
    await p.getByRole('radio', { name: /Birth control/ }).click();
  }],
  ['4-about-you', '/onboarding/life-stage', async (p) => { await pregnancyToAbout(p); }],
  ['5-done', '/onboarding/life-stage', async (p) => { await pregnancyToAbout(p); await p.getByRole('button', { name: 'Skip for now' }).click(); }],
];
const PUBLIC_PAGES = [
  ['index', '/', null, true],
  ['product', '/product', null, true],
  ['for-patients', '/for-patients', null, true],
  ['pricing', '/pricing', null, true],
  ['about', '/about', null, true],
  ['blog', '/blog', null, true],
  ['install', '/install', null, true],
  ['community', '/community', null, true],
  ['library', '/library?stage=all', null, true],
  ['not-found', '/no-such-page', null, true],
  ['health-statistics', '/health-statistics'],
  ['find-doctor', '/find-doctor'],
];

const tab = (name) => async (p) => { await p.getByRole('tab', { name }).click(); };
const DOCTOR_PAGES = [
  ['dashboard', '/doctor/dashboard'],
  ['appointments', '/doctor/dashboard', tab('Appointments')],
  ['cancel-dialog', '/doctor/dashboard', async (p) => {
    await tab('Appointments')(p);
    await p.getByRole('button', { name: 'Cancel visit' }).first().click();
    await p.getByLabel(/Reason/).fill('I am unwell today. Please book another time.');
  }],
  ['patient-summary', '/doctor/patient/p1'],
  ['patient-results', '/doctor/patient/p1', tab('Results')],
  ['patient-notes', '/doctor/patient/p1', tab('Notes')],
  ['patient-documents', '/doctor/patient/p1', tab('Documents')],
  ['patient-visits', '/doctor/patient/p1', tab('Visits')],
  ['settings', '/doctor/dashboard', tab('Profile & settings')],
  ['login', '/auth/doctor-login'],
  ['for-doctors', '/for-doctors'],
];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: SCHEME || 'light' });
  // Doctor side: the device remembers a patient stage (pregnancy) to prove
  // the doctor pages switch to the clinic colours anyway.
  // First run / public: nothing remembered on the device.
  if (!FLOW_SIDE) await ctx.addInitScript((s) => { try { localStorage.setItem('womanie_stage_theme', s); } catch { /* blocked */ } }, DOCTOR_SIDE ? 'pregnancy' : STAGE);
  await ctx.route('**/api/**', DOCTOR_SIDE ? doctorRoute : route);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
  const list = DOCTOR_SIDE ? DOCTOR_PAGES : STAGE === 'first-run' ? FIRST_RUN_PAGES : STAGE === 'public' ? PUBLIC_PAGES : PAGES;
  for (const [name, url, act, signedOut] of list) {
    if (ONLY && !name.startsWith(ONLY)) continue;
    anon = Boolean(signedOut);
    if (FLOW_SIDE) { // a fresh device for every shot
      await p.goto(BASE + '/no-such-page', { waitUntil: 'domcontentloaded' });
      await p.evaluate(() => { localStorage.clear(); document.documentElement.removeAttribute('data-stage'); });
    }
    await p.goto(BASE + url, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1200);
    if (act) {
      try { await act(p); } catch (e) { console.log('ACTION FAILED', name, String(e).split('\n')[0]); }
      await p.waitForTimeout(600);
    }
    await p.mouse.move(1, 1); // no hover left over from the last click
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT, `${STAGE}-${name}${SUFFIX}.png`) });
    // Whole page with the tab bar at the bottom (a tall viewport, not fullPage,
    // so the fixed bar is not painted half-way down).
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.setViewportSize({ width: 390, height: Math.min(6000, Math.max(844, h)) });
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, `${STAGE}-${name}${SUFFIX}-full.png`) });
    await p.setViewportSize({ width: 390, height: 844 });
    console.log('shot', name);
  }
  console.log('unhandled:', [...unknown].join(', '));
  await b.close();
})();
