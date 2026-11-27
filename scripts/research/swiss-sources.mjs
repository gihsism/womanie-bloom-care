#!/usr/bin/env node
// Official Swiss sources as research-library items, so the AI chat can cite
// them (round 4, 2026-11-27).
//
//   node scripts/research/swiss-sources.mjs          # upsert into library.json
//   node scripts/research/swiss-sources.mjs --check  # validate only
//
// These pages have no PubMed record. Each item is a summary written by hand,
// in our own words, from the official page (read on the date in
// `fetchedAt`); no page text is copied or stored (admin.ch terms need
// written consent for reproduction; the SGGG letters are journal articles).
// Items use sourceType "guideline-page" with summariser "hand-written" and
// are checked by validateLibraryItem (api/_lib/research/guideline-page.ts,
// publishers BAG / BLV / SGGG = ingest "summary-only").
// build-library.mjs carries them over unchanged. After a change, re-run
// scripts/research/embed-library.mjs (offline).
//
// Needs Node 22.18+ / 23.6+ (imports the .ts module via type stripping).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const libFile = join(root, 'api', '_lib', 'research', 'library.json');
const { publisherFor, guidelineItemId, validateLibraryItem, fnv1a, HAND_WRITTEN_SUMMARISER, GUIDELINE_SOURCE_TYPE } = await import(
  join(root, 'api', '_lib', 'research', 'guideline-page.ts')
);

const FETCHED = '2026-11-27T12:00:00.000Z';

export const SWISS_SOURCES = [
  {
    url: 'https://www.bag.admin.ch/de/krankenversicherung-leistungen-bei-mutterschaft',
    title: 'Health insurance: maternity benefits (what Swiss basic insurance covers in pregnancy and after the birth)',
    year: 2026,
    summary:
      'The Swiss Federal Office of Public Health (BAG) explains what basic health insurance pays for in pregnancy and after the birth. In a normal pregnancy it covers seven check-ups with a doctor or midwife, one ultrasound scan at weeks 12 to 14 and one at weeks 20 to 23, and the first-trimester test for the risk of trisomy 21, 18 and 13. More scans are covered in a high-risk pregnancy when the gynaecologist finds them necessary. Maternity services cost nothing extra: no deductible or co-payment, and from week 13 until eight weeks after the birth other medical care is free of cost-sharing too.',
    keyPoints: [
      'A normal pregnancy: seven check-ups and two ultrasound scans (weeks 12 to 14 and weeks 20 to 23) are covered.',
      'The first-trimester test (nuchal scan at weeks 12 to 14 plus a blood test) for trisomy 21, 18 and 13 is covered.',
      'A NIPT blood test is covered from week 12 if the risk of a trisomy is 1 in 1000 or higher.',
      'Amniocentesis or a placenta biopsy (CVS) is covered if the first-trimester risk is 1 in 380 or higher, or if NIPT strongly suggests a trisomy.',
      'No deductible or co-payment for maternity services; from week 13 until eight weeks after the birth none for other medical care either.',
      'After the birth: a check between weeks 6 and 10, three breastfeeding-advice sessions and a 150-franc contribution to a birth-preparation course.',
    ],
    lifeStages: ['pregnancy', 'postpartum'],
    topics: ['prenatal-screening'],
    tags: ['switzerland', 'health insurance', 'prenatal care', 'ultrasound', 'nipt', 'first-trimester test'],
    keywords: ['switzerland', 'swiss', 'insurance', 'krankenkasse', 'covered', 'cost', 'pay', 'check-ups', 'scan', 'ultrasound', 'nipt', 'first trimester test', 'amniocentesis', 'midwife', 'deductible'],
  },
  {
    url: 'https://www.bag.admin.ch/dam/it/sd-web/hB7uwEMylr2J/Kommentar%20zu%20den%20%C3%84nderungen%20der%20KLV%20per%201.7.2026%20und%201.1.2027.pdf',
    title: 'Swiss basic insurance covers a first-trimester pre-eclampsia test from 1 July 2026 (KLV Art. 13 letter b quater)',
    year: 2026,
    summary:
      'From 1 July 2026, Swiss basic health insurance pays for a first-trimester test for the risk of pre-eclampsia, a pregnancy condition with new high blood pressure and organ involvement that can be serious for mother and baby. The test is done at the routine scan at weeks 12 to 14 for women expecting one baby. It combines the mother\'s risk factors, her blood pressure, a Doppler scan of the blood flow in the arteries of the womb and a blood test for placental growth factor (PlGF). Depending on the result, the doctor prescribes low-dose aspirin to lower the risk. Until now, women at risk were picked by their risk factors alone; the BAG says the combined test predicts better and is recommended in Swiss and international guidelines.',
    keyPoints: [
      'Covered by basic insurance from 1 July 2026 (EDI decision of 9 June 2026, new KLV Art. 13 letter b quater).',
      'Done at the routine weeks 12 to 14 scan, for every woman expecting one baby.',
      'Combines risk factors, blood pressure, a Doppler scan of the womb arteries and a PlGF blood test.',
      'Depending on the risk result, low-dose aspirin (acetylsalicylic acid) is prescribed to lower the risk of pre-eclampsia.',
      'Only doctors carry out this test; until now women at risk were picked by their risk factors alone.',
    ],
    lifeStages: ['pregnancy'],
    topics: ['pre-eclampsia', 'aspirin-pregnancy', 'prenatal-screening'],
    tags: ['switzerland', 'pre-eclampsia', 'screening', 'plgf', 'aspirin', 'health insurance'],
    keywords: ['switzerland', 'swiss', 'pre-eclampsia', 'preeclampsia', 'screening', 'first trimester', 'plgf', 'aspirin', 'covered', 'insurance', 'blood pressure', 'doppler'],
  },
  {
    url: 'https://www.bag.admin.ch/de/anhang-1-der-krankenpflege-leistungsverordnung-klv',
    title: 'Bone density scans (DXA): when Swiss basic insurance pays (KLV Annex 1, edition of 1 July 2026)',
    year: 2026,
    summary:
      'Annex 1 of the Swiss health insurance benefits ordinance (KLV) lists when basic insurance pays for a bone density scan (DXA). It is not a screening test for everyone: it is covered for set reasons, such as osteoporosis that has already caused a fracture after a minor fall, long-term cortisone treatment, low sex hormones (hypogonadism), gut diseases that reduce absorption (for example Crohn\'s disease, ulcerative colitis, coeliac disease), primary hyperparathyroidism, HIV, aromatase-inhibitor treatment and anti-epileptic medicines. Follow-up scans are covered while the risk lasts, as a rule at most every two years. Ultrasound and whole-body bone measurements and bone-turnover blood markers for early detection are not covered.',
    keyPoints: [
      'DXA bone density scans are covered only for listed reasons, not as a general screening test.',
      'Listed reasons include a fracture after a minor fall, long-term cortisone, low sex hormones, gut diseases with poor absorption, primary hyperparathyroidism, HIV, aromatase inhibitors and anti-epileptic medicines.',
      'Follow-up scans: covered while the risk lasts, as a rule at most every two years.',
      'Bone ultrasound, peripheral CT and bone-turnover markers for early detection of fracture risk are not covered.',
    ],
    lifeStages: ['menopause', 'post-menopause', 'general'],
    topics: ['bone-health', 'osteoporosis-treatment'],
    tags: ['switzerland', 'bone density', 'dxa', 'osteoporosis', 'health insurance'],
    keywords: ['switzerland', 'swiss', 'dexa', 'dxa', 'bone density', 'bone scan', 'osteoporosis', 'covered', 'insurance', 'how often', 'every two years'],
  },
  {
    url: 'https://www.bag.admin.ch/de/schweizerischer-impfplan',
    title: 'Swiss vaccination schedule 2026: vaccinations before and during pregnancy',
    year: 2026,
    summary:
      'The Swiss vaccination schedule (BAG and the Federal Commission for Vaccination) recommends checking and completing vaccinations before every pregnancy, especially measles-mumps-rubella, chickenpox and hepatitis B. In every pregnancy it recommends a flu vaccine (any trimester), a pertussis (whooping cough) vaccine in the second or third trimester, preferably the second, whatever the time since the last dose, and a COVID-19 vaccine in the second or third trimester. An RSV vaccine (Abrysvo) is recommended once, not in every pregnancy, between weeks 32+0 and 36+0 when the due date falls between early October and the end of March, as one of two options to protect the baby; the other is an antibody injection for the newborn. Every pregnant woman should be tested for hepatitis B in every pregnancy, with few exceptions.',
    keyPoints: [
      'Before every pregnancy: check and complete MMR, chickenpox and hepatitis B vaccination.',
      'In every pregnancy: flu vaccine in any trimester; pertussis (dTpa) in the second or third trimester, preferably the second; COVID-19 in the second or third trimester.',
      'RSV: one dose of Abrysvo between weeks 32+0 and 36+0 if the due date is between early October and end of March; once only, not in every pregnancy; the alternative is an antibody injection for the baby.',
      'Live vaccines such as MMR and chickenpox are not given in pregnancy; women who are not immune get them soon after the birth.',
      'Hepatitis B test (HBsAg) in every pregnancy, unless immunity is reliably documented.',
    ],
    lifeStages: ['pregnancy', 'conception', 'postpartum'],
    topics: ['vaccines-pregnancy'],
    tags: ['switzerland', 'vaccination', 'pertussis', 'flu', 'rsv', 'covid-19'],
    keywords: ['switzerland', 'swiss', 'vaccine', 'vaccination', 'impfung', 'whooping cough', 'pertussis', 'tdap', 'flu', 'influenza', 'rsv', 'abrysvo', 'covid', 'mmr', 'hepatitis b', 'pregnancy'],
  },
  {
    url: 'https://www.blv.admin.ch/de/ernaehrung-schwangere-und-stillende',
    title: 'Nutrition before and during pregnancy and while breastfeeding: Swiss federal advice (BLV)',
    year: 2018,
    summary:
      'The Swiss Federal Food Safety and Veterinary Office (BLV) advises taking folic acid tablets (400 micrograms a day) already before a planned pregnancy, to lower the risk of birth defects, and eating a varied, balanced diet. In pregnancy almost all nutrients can come from food, except folic acid and vitamin D; sometimes a supplement for iron, iodine or omega-3 fats is needed, to be discussed with the gynaecologist. Women of childbearing age, pregnant and breastfeeding women in Switzerland often get too little iodine: the BLV advises iodised salt, dairy and sea fish, and asking the gynaecologist whether an iodine tablet is needed. While breastfeeding it recommends vitamin D drops, enough omega-3 fats and avoiding alcohol.',
    keyPoints: [
      'Folic acid tablets, 400 micrograms a day, from before a planned pregnancy.',
      'In pregnancy, folic acid and vitamin D are the nutrients food alone does not cover; iron, iodine or omega-3 supplements only after talking with the gynaecologist.',
      'Iodine: use iodised salt, have dairy products and sea fish, and ask the gynaecologist about an iodine tablet when trying to conceive, pregnant or breastfeeding.',
      'Breastfeeding: vitamin D drops, omega-3 fats from oily fish, walnuts or rapeseed oil, and no alcohol (a small glass on a special occasion, then wait two hours before the next feed).',
      'Soft cheese should be avoided in pregnancy.',
    ],
    lifeStages: ['conception', 'pregnancy', 'postpartum'],
    topics: ['pregnancy-nutrition', 'folic-acid', 'iodine-supplements-pregnancy', 'vitamin-d-pregnancy'],
    tags: ['switzerland', 'nutrition', 'folic acid', 'iodine', 'vitamin d', 'breastfeeding'],
    keywords: ['switzerland', 'swiss', 'folic acid', 'folsäure', 'iodine', 'iodised salt', 'vitamin d', 'iron', 'supplement', 'diet', 'nutrition', 'breastfeeding', 'pregnancy', 'trying to conceive'],
  },
  {
    url: 'https://www.blv.admin.ch/de/naehrstoffzufuhr',
    title: 'Swiss reference values for nutrient intake (BLV, version of June 2022): calcium, vitamin D and folate for women',
    year: 2022,
    summary:
      'The BLV publishes the Swiss reference values for nutrient intake, based on a scientific report (HEdS Geneva) and the Federal Commission for Nutrition, mostly taken from EFSA. For women aged 18 to 65 they give calcium 950 mg a day, vitamin D 15 micrograms (600 IU) a day and folate 330 micrograms a day. For women over 65 they give calcium 1000 to 1200 mg a day, vitamin D 20 micrograms (800 IU) a day and folate 300 to 400 micrograms a day. These are amounts for healthy people; individual needs can differ, for example in pregnancy or with illness.',
    keyPoints: [
      'Women 18 to 65: calcium 950 mg a day, vitamin D 15 micrograms (600 IU) a day, folate 330 micrograms a day.',
      'Women over 65: calcium 1000 to 1200 mg a day, vitamin D 20 micrograms (800 IU) a day.',
      'The values describe the needs of healthy people; age, activity, pregnancy and genes can change individual needs.',
    ],
    lifeStages: ['menopause', 'post-menopause', 'general'],
    topics: ['bone-health', 'vitamin-d'],
    tags: ['switzerland', 'calcium', 'vitamin d', 'reference values', 'nutrition'],
    keywords: ['switzerland', 'swiss', 'calcium', 'how much calcium', 'vitamin d', 'how much vitamin d', 'iu', 'mg', 'daily amount', 'reference values', 'bones', 'menopause'],
  },
  {
    url: 'https://www.rosenfluh.ch/media/gynaekologie/2024/01/Screening-und-Management-der-Gestationsdiabetes.pdf',
    title: 'Screening and management of gestational diabetes (SGGG expert letter 81, Gynäkologie 1/2024)',
    year: 2024,
    summary:
      'The Swiss Society of Gynaecology and Obstetrics (SGGG) recommends an early check for diabetes that existed before the pregnancy at the first pregnancy check-up, with a fasting blood sugar or HbA1c test. Between weeks 24+0 and 28+0 all pregnant women are tested for gestational diabetes: the standard is a 75 g glucose drink test (OGTT) under set conditions, after at least 8 hours without food and starting between 6 and 9 am. Gestational diabetes is diagnosed if one value is at or above the limit: fasting 5.1 mmol/l, 1 hour 10.0 mmol/l or 2 hours 8.5 mmol/l. Women without risk factors can have a fasting blood sugar test first, which spares some of them the drink. After gestational diabetes, a diabetes test after the birth is advised.',
    keyPoints: [
      'First check-up: fasting blood sugar or HbA1c to look for diabetes that existed before the pregnancy.',
      'Weeks 24+0 to 28+0: a 75 g glucose drink test (OGTT) is the standard test, fasting for at least 8 hours and starting between 6 and 9 am.',
      'Limits for gestational diabetes: fasting 5.1 mmol/l, after 1 hour 10.0 mmol/l, after 2 hours 8.5 mmol/l; one value at or above the limit is enough.',
      'Without risk factors, a two-step approach can be used: a fasting blood sugar test first, and the drink test only if needed.',
      'After a pregnancy with gestational diabetes: a diabetes test after the birth, and support for breastfeeding.',
    ],
    lifeStages: ['pregnancy'],
    topics: ['gestational-diabetes'],
    tags: ['switzerland', 'gestational diabetes', 'ogtt', 'glucose test', 'screening'],
    keywords: ['switzerland', 'swiss', 'gestational diabetes', 'glucose test', 'sugar test', 'ogtt', 'glucose drink', 'blood sugar', 'hba1c', 'week 24', '24 to 28 weeks', 'fasting'],
  },
];

function toItem(src) {
  const policy = publisherFor(src.url);
  if (!policy) throw new Error(`no publisher policy for ${src.url}`);
  const text = [src.title, src.summary, ...src.keyPoints].join('\n');
  return {
    id: guidelineItemId(src.url, policy.publisher),
    pmid: '',
    doi: null,
    title: src.title,
    source: policy.publisher,
    journal: policy.publisher,
    organisation: policy.publisher,
    year: src.year,
    publicationTypes: [policy.publicationType],
    evidenceLevel: policy.evidenceLevel,
    url: src.url,
    summary: src.summary,
    keyPoints: src.keyPoints,
    certainty: 'not stated',
    lifeStages: [...new Set(src.lifeStages)],
    topics: src.topics,
    tags: src.tags,
    keywords: src.keywords,
    sourceType: GUIDELINE_SOURCE_TYPE,
    page: {
      publisher: policy.publisher,
      url: src.url,
      fetchedAt: FETCHED,
      published: null,
      lastUpdated: null,
      lastReviewed: null,
      nextReview: null,
      licence: { ...policy.licence, pageCopyright: null },
      attribution: policy.attribution ?? null,
      refreshDays: null,
      robots: { allowed: true, rule: null, checkedAt: FETCHED },
      // Hash of our own summary text (no page text is stored).
      contentHash: fnv1a(text),
      summariser: HAND_WRITTEN_SUMMARISER,
      chunks: 0,
    },
  };
}

const lib = JSON.parse(readFileSync(libFile, 'utf8'));
const topicIds = new Set(lib.topics.map((t) => t.id));
const items = SWISS_SOURCES.map(toItem);
let bad = 0;
for (const it of items) {
  const errs = validateLibraryItem(it, topicIds);
  if (errs.length) {
    bad++;
    console.error(it.id, errs);
  }
}
if (bad) process.exit(1);
if (process.argv.includes('--check')) {
  console.log(`${items.length} Swiss items valid`);
  process.exit(0);
}
const ids = new Set(items.map((i) => i.id));
lib.items = [...lib.items.filter((i) => !ids.has(i.id)), ...items];
writeFileSync(libFile, JSON.stringify(lib, null, 1) + '\n');
console.log(`Upserted ${items.length} Swiss items: ${[...ids].join(', ')}`);
