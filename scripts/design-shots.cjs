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
//   WIDTH=768 ...  (tablet width; files get a -768 suffix)
//   AUDIT=1 ...    (print overflow, clipped text, tap targets <44px, contrast, focus rings)
//   FULL=0 ...     (skip the tall whole-page shot)
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
const WIDTH = Number(process.env.WIDTH || 390);
const SUFFIX = (WIDTH !== 390 ? `-${WIDTH}` : '') + (SCHEME ? `-${SCHEME}` : '');
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
  if (p === '/api/push/config') return json({ enabled: true, publicKey: 'BDemoKeyDemoKeyDemoKeyDemoKeyDemoKeyDemoKeyDemoKeyDemoKeyDemoKeyDemoKey' });
  if (p === '/api/push/subscription') return json({ subscribed: false });
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
  // Dev-only fixture Home (src/dev/HomePreview): a full day of data for the stage.
  ['home-preview', `/dashboard/dev-home?stage=${STAGE}`],
  ['home-preview-fresh', `/dashboard/dev-home?stage=${STAGE}&fresh=1`],
  ['records', '/dashboard/medical-history'],
  ['records-documents', '/dashboard/medical-history', async (p) => { await p.getByRole('tab', { name: 'Documents' }).first().click(); }],
  ['ask', '/dashboard/ai-doctor'],
  ['ask-answer', '/dashboard/ai-doctor', async (p) => {
    await p.getByPlaceholder(/ask (about|anything)/i).fill('Is back pain normal at 30 weeks?');
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
    { id: 'v6', doctor_id: DOC_ID, patient_id: 'p3', scheduled_at: day(1, 8, 15).toISOString(), status: 'scheduled', consultation_type: 'in_person', duration: 30, notes: null },
    { id: 'v7', doctor_id: DOC_ID, patient_id: 'p4', scheduled_at: day(1, 14, 0).toISOString(), status: 'scheduled', consultation_type: 'video', duration: 20, notes: null },
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
  if (p === '/api/doctors/day') return json({ visits: [
    { appointment_id: 'v1', patient_id: 'p1', scheduled_at: soon.toISOString(), approved: true, life_stage: 'pregnancy', pregnancy_due_date: ymd(day(70)), open_questions: 2, last_visit_at: day(-28, 9, 0).toISOString(), new_docs: 2, new_abnormal: 2, low_mood_streak: 0 },
    { appointment_id: 'v6', patient_id: 'p3', scheduled_at: day(1, 8, 15).toISOString(), approved: true, life_stage: 'conception', open_questions: 0, last_visit_at: null, new_docs: 0, new_abnormal: 0, low_mood_streak: 0 },
    { appointment_id: 'v7', patient_id: 'p4', scheduled_at: day(1, 14, 0).toISOString(), approved: false },
  ] });
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


// ---- AUDIT=1: the round-7 visual QA checks, run in the page after each shot ----
// Horizontal overflow, text clipped without an ellipsis, tap targets under
// 44px, text contrast under WCAG AA, and keyboard focus with no visible ring.
async function audit(p) {
  const found = await p.evaluate(() => {
    const out = [];
    const vw = document.documentElement.clientWidth;
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
    const label = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
    if (document.documentElement.scrollWidth > vw + 1) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') {
          let a = el.parentElement, clipped = false;
          while (a) { const o = getComputedStyle(a).overflowX; if (o !== 'visible') { clipped = true; break; } a = a.parentElement; }
          if (!clipped) { out.push(`OVERFLOW ${label(el)} right=${Math.round(r.right)} vw=${vw}`); if (out.length > 3) break; }
        }
      }
    }
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el) || el.children.length > 0 && !el.textContent.trim()) continue;
      const cs = getComputedStyle(el);
      const hid = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      if (hid && el.clientWidth > 2 && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && !cs.webkitLineClamp?.match?.(/\d/) && el.textContent.trim() && !el.closest('[role="tablist"],[data-radix-scroll-area-viewport],.overflow-x-auto,svg') && cs.whiteSpace !== 'normal') {
        out.push(`CLIPPED ${label(el)} ${el.scrollWidth}>${el.clientWidth}`);
      }
    }
    const tappable = 'a[href],button,[role="button"],[role="tab"],[role="switch"],[role="radio"],[role="checkbox"],input:not([type="hidden"]),select,textarea,[role="combobox"]';
    for (const el of document.querySelectorAll(tappable)) {
      if (!vis(el) || el.closest('[aria-hidden="true"]') || el.disabled) continue;
      const r = el.getBoundingClientRect();
      // Inline links inside running text are exempt (WCAG 2.5.8 inline exception).
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && /^(P|LI|SPAN)$/.test(el.parentElement.tagName)) continue;
      // A Radix switch/checkbox/radio inside a label or a row: the row is the target.
      const box = el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
      const lr = box ? box.getBoundingClientRect() : null;
      // A pseudo-element tap area (.hit-44, .tap-target, before:-inset-3) counts.
      let ph = 0, pw = 0;
      for (const ps of ['::after', '::before']) {
        const a = getComputedStyle(el, ps);
        if (a.content === 'none' || a.position !== 'absolute') continue;
        ph = Math.max(ph, parseFloat(a.height) || 0, parseFloat(a.minHeight) || 0);
        pw = Math.max(pw, parseFloat(a.width) || 0, parseFloat(a.minWidth) || 0);
      }
      const h = Math.max(r.height, lr ? lr.height : 0, ph);
      const w = Math.max(r.width, lr ? lr.width : 0, pw);
      if (h < 43.5 || w < 43.5) out.push(`TAP ${Math.round(w)}x${Math.round(h)} ${label(el)}`);
    }
    // Contrast: text colour against the first opaque background behind it.
    const rgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
    const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const bgOf = (el) => {
      let stack = [];
      for (let a = el; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradient/image: skip
        const c = rgb(cs.backgroundColor);
        if (c && c.a > 0) { stack.push(c); if (c.a >= 0.99) break; }
      }
      let base = { r: 255, g: 255, b: 255 };
      if (!stack.length || stack[stack.length - 1].a < 0.99) base = document.documentElement.classList.contains('dark') ? { r: 20, g: 16, b: 18 } : base;
      for (let i = stack.length - 1; i >= 0; i--) { const c = stack[i]; base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) }; }
      return base;
    };
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el) || el.closest('svg,[aria-hidden="true"],[disabled],[data-disabled],input::placeholder')) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const cs = getComputedStyle(el);
      let op = 1; for (let a = el; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
      if (op < 0.95) continue; // deliberately dimmed (past visits, disabled)
      const fg = rgb(cs.color); const bg = bgOf(el); if (!fg || !bg) continue;
      const f = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
      const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const px = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
      const need = px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;
      if (ratio < need) { const k = `CONTRAST ${ratio.toFixed(2)}<${need} ${label(el)} ${cs.color} on rgb(${bg.r|0},${bg.g|0},${bg.b|0})`; if (!seen.has(k)) { seen.add(k); out.push(k); } }
    }
    return out;
  });
  // Focus rings: tab through the first 25 stops and look for a visible ring.
  await p.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  for (let i = 0; i < 25; i++) {
    await p.keyboard.press('Tab');
    const f = await p.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
      return ring ? '' : `NOFOCUS ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${el.getAttribute('type') || ''}] "${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
    });
    if (f) found.push(f);
  }
  await p.keyboard.press('Escape');
  return [...new Set(found)];
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2, colorScheme: SCHEME || 'light' });
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
    if (process.env.NAMES && !process.env.NAMES.split(',').includes(name)) continue;
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
    if (process.env.AUDIT) { for (const f of await audit(p)) console.log(`  ${name}${SUFFIX}: ${f}`); await p.mouse.move(1, 1); }
    if (process.env.FULL === '0') { console.log('shot', name); continue; }
    // Whole page with the tab bar at the bottom (a tall viewport, not fullPage,
    // so the fixed bar is not painted half-way down).
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.setViewportSize({ width: WIDTH, height: Math.min(6000, Math.max(844, h)) });
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, `${STAGE}-${name}${SUFFIX}-full.png`) });
    await p.setViewportSize({ width: WIDTH, height: 844 });
    console.log('shot', name);
  }
  console.log('unhandled:', [...unknown].join(', '));
  await b.close();
})();
