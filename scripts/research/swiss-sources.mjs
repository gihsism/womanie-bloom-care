#!/usr/bin/env node
// Official Swiss sources as research-library items, so the AI chat can cite
// them (round 4, 2026-11-27). Round 8 (2026-11-28) adds a few non-Swiss
// official sources the same way (OTHER_SOURCES: FSRH, CDC, HFEA, FIGO),
// for questions no PubMed abstract answers.
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
    title: 'Nutrition before and during pregnancy and while breastfeeding: Swiss federal advice (BLV page, FAQ and brochure of August 2025)',
    year: 2025,
    // Round 5: figures added from the BLV brochure "Ernährung rund um
    // Schwangerschaft und Stillzeit" (August 2025, order no. 341.801.D),
    // linked from this page; read 2026-11-28.
    fetchedAt: '2026-11-28T12:00:00.000Z',
    summary:
      'The Swiss Federal Food Safety and Veterinary Office (BLV) advises taking folic acid tablets (400 micrograms a day) already before a planned pregnancy, to lower the risk of birth defects, and eating a varied, balanced diet. In pregnancy almost all nutrients can come from food, except folic acid and vitamin D; sometimes a supplement for iron, iodine or omega-3 fats is needed, to be discussed with the gynaecologist. Women of childbearing age, pregnant and breastfeeding women in Switzerland often get too little iodine: the BLV advises iodised salt, dairy and sea fish, and asking the gynaecologist whether an iodine tablet is needed. While breastfeeding it recommends vitamin D drops, enough omega-3 fats and avoiding alcohol. Its brochure (August 2025) adds: weight gain by starting BMI (11.5 to 16 kg at normal weight), about 250 extra kcal a day from month 4 and 500 from month 7, 1.5 to 2 litres of drinks a day, caffeine in moderation (for example 1 to 2 cups of coffee or 4 cups of black or green tea a day), no alcohol in pregnancy, limits for some fish because of mercury, and about 30 minutes of movement a day.',
    keyPoints: [
      'Folic acid tablets, 400 micrograms a day, from before a planned pregnancy.',
      'In pregnancy, folic acid and vitamin D are the nutrients food alone does not cover; iron, iodine or omega-3 supplements only after talking with the gynaecologist.',
      'Iodine: use iodised salt, have dairy products and sea fish, and ask the gynaecologist about an iodine tablet when trying to conceive, pregnant or breastfeeding.',
      'Breastfeeding: vitamin D drops, omega-3 fats from oily fish, walnuts or rapeseed oil, and no alcohol (a small glass on a special occasion, then wait two hours before the next feed).',
      'Soft cheese should be avoided in pregnancy.',
      'Weight gain in pregnancy by BMI before pregnancy: under 18.5: 12.5 to 18 kg; 18.5 to 24.9: 11.5 to 16 kg; 25 to 29.9: 7 to 11.5 kg; 30 or more: 5 to 9 kg.',
      'Energy: about 250 extra kcal a day from month 4 and about 500 from month 7 (normal weight); eat twice as well, not twice as much.',
      'Drinks: 1.5 to 2 litres a day in pregnancy, at least 2 litres while breastfeeding; caffeine in moderation, for example 1 to 2 cups of coffee or 4 cups of black or green tea a day; avoid energy drinks and tonic.',
      'No alcohol in pregnancy.',
      'Fish: avoid marlin, swordfish, shark, Baltic salmon and Baltic herring; fresh or tinned tuna and imported pike at most once a week.',
      'Movement: about 30 minutes a day, avoiding overexertion; low-risk activities such as swimming, walking, gymnastics or yoga.',
    ],
    lifeStages: ['conception', 'pregnancy', 'postpartum'],
    topics: ['pregnancy-nutrition', 'folic-acid', 'iodine-supplements-pregnancy', 'vitamin-d-pregnancy'],
    tags: ['switzerland', 'nutrition', 'folic acid', 'iodine', 'vitamin d', 'breastfeeding'],
    keywords: ['switzerland', 'swiss', 'folic acid', 'folsäure', 'iodine', 'iodised salt', 'vitamin d', 'iron', 'supplement', 'diet', 'nutrition', 'breastfeeding', 'pregnancy', 'trying to conceive', 'before pregnancy', 'folic acid before pregnancy', 'caffeine', 'coffee', 'alcohol', 'tuna', 'mercury', 'fish', 'weight gain', 'calories', 'exercise'],
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
  // Round 5 (2026-11-28) held letter 68 (Gynäkologie 1/2020). Round 8
  // (2026-11-28): letter 94 of 7 January 2026 replaces it (sggg.ch,
  // "Expertenbriefe", read 2026-11-28): the baby's RhD test from week 16,
  // written consent (genetic test law GUMG), anti-D for early bleeding
  // only from 12+0 weeks and after a miscarriage managed at home or with
  // tablets only from 9+0 weeks. Same weeks 28 to 30 and 72 h / 14 days.
  {
    url: 'https://www.sggg.ch/fileadmin/user_upload/Dokumente/3_Fachinformationen/1_Expertenbriefe/DE/94_Empfehlungen_zur_Anti-D_Immunglobulin_Gabe_in_der_Schwangerschaft___Anti-D-Prophylaxe__ersetzt_No_68.pdf',
    title: 'Anti-D injections in pregnancy for RhD-negative women (SGGG expert letter 94, January 2026, replaces letter 68)',
    year: 2026,
    fetchedAt: '2026-11-28T12:00:00.000Z',
    summary:
      'The Swiss Society of Gynaecology and Obstetrics (SGGG) explains when a pregnant woman whose blood group is RhD negative needs an anti-D injection, which stops her body from making antibodies against an RhD-positive baby. At the first check-ups (weeks 8 to 12) every woman has her blood group, RhD status and an antibody screen checked. For RhD-negative women, a blood test between weeks 16 and 24 can read the baby\'s RhD status from the baby\'s DNA in the mother\'s blood; it is a genetic test, so she is counselled first and gives written consent on the lab form, and insurance pays for it once. If the baby is RhD positive, the woman gets an anti-D injection between weeks 28 and 30, and again after the birth. If the baby is RhD negative, no routine anti-D is needed in pregnancy, after bleeding or procedures, or after the birth; the letter says this spares about 40% of injections in pregnancy in Switzerland. Anti-D after the birth is given ideally within 72 hours, and can still be given up to 14 days later. This letter (January 2026) replaces letter 68 of 2020.',
    keyPoints: [
      'First check-ups (weeks 8 to 12): blood group, RhD status and a screen for blood group antibodies.',
      'RhD-negative women: a blood test between weeks 16 and 24 shows the baby\'s RhD status; the society advises against doing it before week 16. It needs counselling and written consent, and basic insurance pays for it once.',
      'Baby RhD positive: anti-D injection between weeks 28 and 30, and again after the birth, ideally within 72 hours (up to 14 days later if missed).',
      'Baby RhD negative: no routine anti-D in pregnancy or after the birth, and none needed after bleeding or procedures; the newborn\'s blood group then does not need testing.',
      'Without a known baby RhD status: anti-D after a surgical miscarriage treatment or termination, an ectopic or molar pregnancy, CVS or amniocentesis at any stage; after a miscarriage managed by waiting or with tablets, or a termination with tablets, from 9 weeks; for bleeding with an ongoing pregnancy only from 12 weeks; and after turning a breech baby or a blow to the belly.',
    ],
    lifeStages: ['pregnancy', 'postpartum'],
    topics: ['prenatal-screening'],
    tags: ['switzerland', 'anti-d', 'rhesus', 'rhd negative', 'blood group', 'prenatal care'],
    keywords: ['switzerland', 'swiss', 'anti-d', 'anti d', 'rhesus', 'rh negative', 'rhd negative', 'rhesus negative', 'blood group', 'rhophylac', 'rhesus injection', 'baby blood group', 'week 28'],
  },
  {
    url: 'https://www.sggg.ch/fileadmin/user_upload/86_Prophylaxe_GBS-Sepsis_des_Neugeborenen_englischVersion.pdf',
    title: 'Group B streptococcus (GBS): swab at weeks 35 to 37 and antibiotics in labour to protect the newborn (SGGG clinical practice recommendation 86, 2024)',
    year: 2024,
    fetchedAt: '2026-11-28T12:00:00.000Z',
    summary:
      'Group B streptococci (GBS) are bacteria that live harmlessly in the vagina or bowel of many women, about 20% of pregnant women in Switzerland. During birth they can pass to the baby and, rarely, cause a serious infection in the first week of life. The Swiss recommendation (SGGG, approved by the Swiss Academy for Feto-Maternal Medicine) is to test every pregnant woman at weeks 35 to 37 with one swab from the lower vagina and the skin around the anus; no speculum is needed and women can take the swab themselves. Women who test positive get antibiotics through a drip from the start of labour or when the waters break, which lowers early infections in the baby by 80 to 90%. Treating GBS before labour is not advised, because it usually comes back. Antibiotics are also given without a swab after GBS in the urine in this pregnancy or a previous baby with GBS infection, and when the result is unknown and there is a risk factor (birth before 37 weeks, waters broken 18 hours or more, fever in labour). A planned caesarean before labour and before the waters break does not need GBS antibiotics.',
    keyPoints: [
      'Every pregnant woman is offered a GBS swab at weeks 35 to 37; a result older than 5 weeks counts as unknown.',
      'One swab from the lower vagina and the skin around the anus; women can take it themselves.',
      'GBS found: antibiotics through a drip from the start of labour or when the waters break; this lowers early infection of the baby by 80 to 90%.',
      'No treatment before labour: the bacteria usually come back.',
      'Antibiotics without a swab: GBS in the urine in this pregnancy, or a previous baby with GBS infection.',
      'Unknown result: antibiotics if the birth is before 37 weeks, the waters have been broken 18 hours or more, or there is fever in labour.',
      'Tell your team about a penicillin allergy: the lab then tests which other antibiotics work.',
    ],
    lifeStages: ['pregnancy'],
    topics: ['prenatal-screening'],
    tags: ['switzerland', 'group b streptococcus', 'gbs', 'swab', 'antibiotics in labour', 'newborn infection'],
    keywords: ['switzerland', 'swiss', 'group b strep', 'group b streptococcus', 'gbs', 'strep b', 'swab', 'vaginal swab', 'antibiotics in labour', 'newborn sepsis', 'week 36', '35 to 37 weeks', 'penicillin'],
  },
  {
    url: 'https://www.bag.admin.ch/de/humane-papillomaviren-hpv',
    title: 'HPV vaccination in Switzerland: recommended ages, doses and costs (BAG and Federal Commission for Vaccination)',
    year: 2025,
    fetchedAt: '2026-11-28T01:00:00.000Z',
    summary:
      'The Swiss Federal Office of Public Health (BAG) and the Federal Commission for Vaccination recommend the HPV vaccine for all young people aged 11 to 14, girls and boys alike. It protects against cancers caused by human papillomaviruses, such as cervical cancer, and against genital warts. People aged 15 to 26 are advised to catch up. Before the 15th birthday two injections six months apart are needed; from the 15th birthday three injections over at least six months. In the cantonal vaccination programmes the vaccine is exempt from the deductible for people aged 11 to 26; the co-payment is still paid by the person.',
    keyPoints: [
      'Recommended for all young people aged 11 to 14, girls and boys.',
      'Catch-up vaccination is recommended from 15 to 26 years.',
      'Before the 15th birthday: two injections six months apart; from the 15th birthday: three injections over at least six months.',
      'In the cantonal vaccination programmes, no deductible for people aged 11 to 26; the co-payment remains.',
      'It protects against HPV-related cancers, such as cervical cancer, and genital warts.',
    ],
    lifeStages: ['menstrual-cycle', 'contraception', 'general'],
    topics: ['cervical-screening'],
    tags: ['switzerland', 'hpv vaccine', 'vaccination', 'cervical cancer', 'adolescents'],
    keywords: ['switzerland', 'swiss', 'hpv', 'hpv vaccine', 'hpv vaccination', 'papillomavirus', 'gardasil', 'vaccine', 'impfung', 'cervical cancer', 'genital warts', 'teenager', 'daughter', 'catch-up', 'kanton'],
  },
  // Round 8 (2026-11-28): Swiss cervical and breast screening (open gap of
  // the round-7 Ask AI audit).
  {
    url: 'https://www.sggg.ch/fileadmin/user_upload/Dokumente/3_Fachinformationen/1_Expertenbriefe/DE/97_Empfehlungen_fuer_die_Gebaermutterhalskrebsvorsorge.pdf',
    title: 'Cervical cancer screening in Switzerland: who, how often and with which test (SGGG expert letter 97, June 2026, replaces letter 50)',
    year: 2026,
    fetchedAt: '2026-11-28T12:00:00.000Z',
    summary:
      'The Swiss Society of Gynaecology and Obstetrics (SGGG) recommends cervical screening every 3 years from age 21 to 70. From 21 to 29 the test is a cell test (Pap smear, cytology); from 30 to 70 it can be a cell test or an HPV test, each every 3 years. Doing both tests at the same time (co-testing) is not recommended for routine screening. Basic insurance still does not pay for the HPV test as the first screening test; an application was made in 2025, so women who choose it usually pay for it themselves. Switzerland has no invitation programme: women book the check themselves. Screening is not done before 21, whatever the age at first sex. It can stop at 70 after normal results (three normal cell tests in 10 years or two negative HPV tests in 6 years) and no earlier high-grade changes. HPV-vaccinated women follow the same schedule, and a pregnancy does not change it.',
    keyPoints: [
      'Every 3 years from 21 to 70.',
      'Age 21 to 29: cell test (Pap smear) every 3 years; no HPV test or co-testing at this age.',
      'Age 30 to 70: cell test or HPV test, either one every 3 years; doing both together is not recommended.',
      'Basic insurance does not yet pay for the HPV test as the first screening test, so women usually pay for it themselves.',
      'Switzerland has no invitation programme for cervical screening: women book the check with their gynaecologist or family doctor.',
      'No screening before 21; screening can stop at 70 after normal results and no earlier high-grade changes.',
      'Vaccinated women follow the same schedule; if the last test was less than 3 years ago, no extra test is needed in pregnancy.',
    ],
    lifeStages: ['menstrual-cycle', 'contraception', 'menopause', 'post-menopause', 'general'],
    topics: ['cervical-screening'],
    tags: ['switzerland', 'cervical screening', 'pap smear', 'hpv test', 'cervical cancer'],
    keywords: ['switzerland', 'swiss', 'smear', 'smear test', 'pap', 'pap smear', 'pap test', 'cervical screening', 'cervical smear', 'hpv test', 'cytology', 'how often smear', 'every 3 years', 'gynaecologist check', 'cervical cancer screening', 'vorsorge', 'krebsabstrich'],
  },
  {
    url: 'https://www.fedlex.admin.ch/eli/cc/1995/4964_4964_4964/de',
    title: 'Cancer screening Swiss basic insurance pays for: cervical smear and breast screening mammography (KLV Art. 12e, version of 1 August 2026)',
    year: 2026,
    fetchedAt: '2026-11-28T12:00:00.000Z',
    summary:
      'The Swiss health insurance benefits ordinance (KLV, Article 12e) sets which screening tests basic insurance pays for. A gynaecological check-up with a cervical smear is covered once a year for the first two checks and then every three years if the results are normal; after an abnormal result the doctor decides the interval. An HPV test used for cervical screening is not covered. A screening mammogram is covered every two years from the 50th birthday, but only within a cantonal breast cancer screening programme that meets the federal quality rules; for these programme mammograms no deductible (franchise) is charged, while the co-payment still applies. Women with a moderately or strongly raised family risk of breast cancer can have mammography or breast MRI covered under separate rules (KLV Art. 12d).',
    keyPoints: [
      'Cervical smear: covered once a year for the first two checks, then every 3 years if the results are normal.',
      'After an abnormal smear, the doctor decides how often to check.',
      'An HPV test for cervical screening is not paid by basic insurance.',
      'Screening mammogram: covered every 2 years from age 50, only within a cantonal screening programme.',
      'No deductible (franchise) on programme mammograms; the co-payment still applies. Not every canton runs a programme.',
      'A raised family risk of breast cancer: mammography or breast MRI covered under separate rules (KLV Art. 12d).',
    ],
    lifeStages: ['menopause', 'post-menopause', 'general', 'menstrual-cycle'],
    topics: ['breast-health', 'cervical-screening'],
    tags: ['switzerland', 'mammography', 'breast screening', 'cervical screening', 'health insurance'],
    keywords: ['switzerland', 'swiss', 'mammogram', 'mammography', 'breast screening', 'breast cancer screening', 'screening programme', 'kanton', 'canton', 'smear', 'pap smear', 'hpv test', 'hpv', 'covered', 'insurance', 'krankenkasse', 'deductible', 'franchise', 'from 50', 'every two years', 'klv'],
  },
  // Round 9 (2026-11-28): which cantons run a breast screening programme
  // (Swiss Cancer Screening canton list and participation page; Aargau's
  // start date from the Krebsliga Aargau / Clario press release of 1 June
  // 2026). The eight cantons without a programme are those with no entry
  // in the umbrella association's canton list.
  {
    url: 'https://www.swisscancerscreening.ch/de/krebs-frueherkennung/brust/teilnahme',
    title: 'Breast cancer screening programmes in Swiss cantons: which cantons have one, who is invited and what it costs (Swiss Cancer Screening, 2026)',
    year: 2026,
    fetchedAt: '2026-11-28T12:00:00.000Z',
    summary:
      'Swiss Cancer Screening, the umbrella association of the cantonal screening programmes, lists which cantons run an organised breast cancer screening programme. In November 2026 these were 18 cantons: Aargau (since July 2026), Appenzell Ausserrhoden, Appenzell Innerrhoden, Basel-Stadt, Basel-Landschaft, Bern, Fribourg, Geneva, Graubünden, Jura, Lucerne, Neuchâtel, St. Gallen, Solothurn, Thurgau, Ticino, Valais and Vaud. Zurich, Schaffhausen, Zug, Glarus, Schwyz, Uri, Obwalden and Nidwalden had no programme on the list; women living there are advised to talk to their gynaecologist or family doctor about breast screening. In a programme, women who live in the canton and are aged 50 to 69 or 50 to 74, depending on the canton, get a letter with information on the benefits and drawbacks and decide for themselves whether to go; no doctor\'s referral is needed. After a normal result they are invited again two years later. Each mammogram is read separately by two specially trained radiologists, and the result arrives by letter after about eight working days. Basic insurance pays without the deductible; the woman pays only the 10% co-payment, about 20 francs. Most findings that need a closer look turn out to be harmless: about five in six, according to the association.',
    keyPoints: [
      '18 cantons ran a programme in November 2026: AG (since July 2026), AR, AI, BS, BL, BE, FR, GE, GR, JU, LU, NE, SG, SO, TG, TI, VS and VD.',
      'No programme on the list: Zurich, Schaffhausen, Zug, Glarus, Schwyz, Uri, Obwalden and Nidwalden; there, ask the gynaecologist or family doctor.',
      'Who is invited: women living in the canton aged 50 to 69 or 50 to 74, depending on the canton; taking part is her own choice and needs no referral.',
      'A new invitation every two years after a normal result; two radiologists read each mammogram; the result comes by letter in about eight working days.',
      'Costs: no deductible; the 10% co-payment, about 20 francs, remains.',
      'About five in six findings that need a closer look turn out to be harmless.',
    ],
    lifeStages: ['menopause', 'post-menopause', 'general'],
    topics: ['breast-health'],
    tags: ['switzerland', 'breast screening', 'mammography', 'screening programme', 'canton'],
    keywords: ['switzerland', 'swiss', 'canton', 'cantons', 'kanton', 'my canton', 'breast screening programme', 'screening programme', 'breast cancer screening', 'mammogram', 'mammography', 'invitation', 'invited', 'zurich', 'zürich', 'bern', 'geneva', 'genf', 'vaud', 'basel', 'lucerne', 'luzern', 'aargau', 'ticino', 'st. gallen', 'zug', 'co-payment', 'deductible', 'swiss cancer screening', 'donna'],
  },
  // Round 9 (2026-11-28): Swiss IVF figures, BFS tables T 14.03.07.01.01
  // to .03 (data as of 16 April 2026). The BFS gives the age mix of the
  // women treated but no success rates by age.
  {
    url: 'https://statistik.admin.ch/de/themen/gesundheit/reproduktive-perinatale-gesundheit',
    title: 'IVF in Switzerland in 2024: how many women were treated and how often treatment led to a birth (Federal Statistical Office, BFS)',
    year: 2026,
    fetchedAt: '2026-11-28T12:00:00.000Z',
    summary:
      'The Swiss Federal Statistical Office (BFS) collects figures from all Swiss fertility centres. In 2024, 6,533 women had IVF or ICSI treatment, over 12,573 started treatment cycles, and 2,475 babies were born alive after these treatments. Of all the women treated that year, 47% became pregnant and 37% gave birth. Counted per embryo transfer, about 30% led to a birth (26% after a fresh transfer, 32% after a frozen one); counted per started cycle, about 19%. About one pregnancy in five ended in a miscarriage. Twins made up about 2% of births and there were no triplets. Women in treatment were 36.8 years old on average: 6% were under 30, 27% were 30 to 34, 43% were 35 to 39, 23% were 40 to 44 and 1% were 45 or older. The BFS tables do not show success rates by the woman\'s age, so for the effect of age other sources are needed, such as the UK register. These are national averages, not a personal chance; the fertility clinic can explain what they mean for her.',
    keyPoints: [
      '2024: 6,533 women treated with IVF or ICSI, 12,573 started cycles, 2,475 babies born alive.',
      'Of the women treated in 2024, 47% became pregnant and 37% gave birth.',
      'Birth per embryo transfer: about 30% (fresh 26%, frozen 32%); per started cycle about 19%.',
      'About 1 in 5 pregnancies ended in a miscarriage; twins were about 2% of births, no triplets.',
      'Average age in treatment 36.8 years; 43% were 35 to 39 and 23% were 40 to 44.',
      'No Swiss success rates by age are published in these tables; national averages are not a personal chance.',
    ],
    lifeStages: ['ivf', 'conception'],
    topics: ['ivf-outcomes'],
    tags: ['switzerland', 'ivf statistics', 'national register', 'birth rate', 'bfs'],
    keywords: ['switzerland', 'swiss', 'schweiz', 'ivf in switzerland', 'ivf success', 'success rate', 'chance of success', 'birth rate', 'live birth', 'per embryo', 'statistics', 'how many women', 'bfs', 'federal statistical office', 'icsi', 'twins'],
  },
];

// Round 8 (2026-11-28): non-Swiss official sources for questions the
// round-7 Ask AI audit could not answer from a PubMed abstract (missed
// pill, migraine with aura and the pill, typical-use effectiveness,
// normal cycle length, IVF success by age). Same rules: hand-written
// summaries in our own words with a link; no tag "switzerland", so they
// get no Swiss lift.
export const OTHER_SOURCES = [
  {
    url: 'https://www.cosrh.org/Common/Uploaded%20files/documents/fsrh-guideline-combined-hormonal-contraception-october-2023.pdf',
    title: 'Combined hormonal contraception (pill, patch, ring): effectiveness, missed pills and migraine (FSRH clinical guideline, January 2019, amended October 2023)',
    year: 2023,
    summary:
      'The UK Faculty (now College) of Sexual and Reproductive Healthcare guideline on the combined pill, patch and ring. Used perfectly, about 0.3% of users get pregnant in the first year; with typical use, which includes late or missed pills, about 9% do, because the method depends on being used correctly every day. Implants and coils (IUDs) stay below 1% either way, because they do not depend on the user, so women choosing the pill should hear about them too. A combined pill counts as missed when it is more than 24 hours late; missing pills next to the 7-day break matters most, because it makes the break longer; the detailed steps are in the separate FSRH guidance on incorrect use. Vomiting within 3 hours of a pill, or severe diarrhoea for more than 24 hours, counts like a missed pill. Women who have migraine with aura should not use combined methods (UKMEC category 4: an unacceptable health risk), because together they raise the risk of ischaemic stroke; with migraine without aura the combined method can usually be started (UKMEC 2), but new migraine after starting it is a reason to stop (UKMEC 3). The absolute stroke risk in young women stays low.',
    keyPoints: [
      'First-year pregnancy rate: about 0.3% with perfect use and about 9% with typical use (pill, patch and ring alike).',
      'Typical use, other methods: progestogen-only pill 9%, injection 6%, male condom 18%, copper coil 0.8%, hormonal coil 0.2%, implant 0.05%.',
      'A combined pill is missed when it is more than 24 hours late; pills missed next to the 7-day break matter most.',
      'Vomiting within 3 hours of a pill, or severe diarrhoea for more than 24 hours, counts as a missed pill.',
      'Migraine with aura: combined pill, patch or ring should not be used (UKMEC 4) because of the higher risk of ischaemic stroke.',
      'Migraine without aura: a combined method can usually be started (UKMEC 2); new migraine after starting it is a reason to stop (UKMEC 3).',
      'Women who often miss pills can consider a method that does not depend on daily use, such as an implant or coil.',
    ],
    lifeStages: ['contraception'],
    topics: ['combined-pill', 'contraception-effectiveness', 'migraine-hormones'],
    tags: ['combined pill', 'missed pill', 'typical use', 'migraine with aura', 'ukmec', 'contraception guideline'],
    keywords: ['pill', 'combined pill', 'missed pill', 'forgot pill', 'forgotten pill', 'late pill', 'typical use', 'perfect use', 'how effective', 'effectiveness', 'failure rate', 'migraine', 'aura', 'migraine with aura', 'stroke', 'ukmec', 'vomiting', 'diarrhoea', 'patch', 'ring'],
  },
  {
    url: 'https://www.cdc.gov/contraception/hcp/usspr/combined-hormonal-contraceptives.html',
    title: 'What to do after late or missed combined pills, a late patch or a late ring (CDC US Selected Practice Recommendations, 2024)',
    year: 2024,
    summary:
      'The US CDC practice recommendations (2024) say what to do when combined pills are taken late or missed. A pill counts as late when less than 24 hours have passed since it was due, and missed after 24 hours or more. If one pill is late or missed (less than 48 hours): take it as soon as possible and carry on as usual, even if that means two pills in one day; no extra protection is needed. If two or more pills in a row are missed (48 hours or more): take the most recent missed pill now, carry on as usual, and use condoms or avoid sex until seven hormone pills in a row have been taken. If the missed pills were in the last week of hormone pills, finish them and start the next pack straight away without the break. If pills were missed in the first week and there was sex without a condom in the previous 5 days, emergency contraception should be considered. Patch and ring follow the same 48-hour rule. The UK FSRH uses the same 24-hour and 48-hour limits; her own pack leaflet can be stricter and then applies, and a pharmacist can help.',
    keyPoints: [
      'Late = less than 24 hours after the pill was due; missed = 24 hours or more.',
      'One pill late or missed (under 48 hours): take it now, even two in one day, and carry on; no extra protection needed.',
      'Two or more missed in a row (48 hours or more): take the latest missed pill now, carry on, and use condoms or avoid sex until 7 hormone pills in a row have been taken.',
      'Missed in the last week of hormone pills: finish them and start the next pack without the break.',
      'Missed in the first week with sex without a condom in the previous 5 days: emergency contraception should be considered (ask a pharmacist).',
      'Patch or ring 48 hours or more late: put a new one on or in now and use condoms for 7 days; the pack leaflet can be stricter.',
    ],
    lifeStages: ['contraception'],
    topics: ['combined-pill', 'emergency-contraception'],
    tags: ['missed pill', 'combined pill', 'emergency contraception', 'patch', 'ring'],
    keywords: ['missed pill', 'forgot pill', 'forgot my pill', 'forget a pill', 'forget my pill', 'forgotten pill', 'late pill', 'two pills', 'pill late', 'what to do', 'emergency contraception', 'morning after pill', 'condoms', '7 days', 'patch', 'ring', 'pill-free break', 'combined pill'],
  },
  {
    url: 'https://www.hfea.gov.uk/about-us/publications/research-and-data/fertility-treatment-2024-trends-and-figures',
    title: 'Fertility treatment 2024: trends and figures, including IVF birth rates by age (HFEA, UK national register, June 2026)',
    year: 2026,
    summary:
      'The UK Human Fertilisation and Embryology Authority (HFEA) reports every IVF cycle done in the UK. In 2024 the average birth rate per embryo transferred, using the woman\'s own eggs and counting fresh and frozen transfers together, was 30%, up from 20% in 2014. Age makes the biggest difference: it was 38% for women aged 18 to 34 and 8% for women aged 43 to 44. Most transfers (84%) used a single embryo, and the multiple birth rate was about 3%. The average age at starting IVF was about 35. The 2024 birth figures are preliminary and not yet fully validated. These are UK averages per embryo transferred, not a personal chance; the clinic can explain what they mean for her.',
    keyPoints: [
      'Birth rate per embryo transferred (own eggs, fresh and frozen together): 30% on average in 2024, up from 20% in 2014.',
      'By age: 38% for women aged 18 to 34; 8% for women aged 43 to 44.',
      '84% of transfers used a single embryo; the multiple birth rate was about 3%.',
      'The average age at starting IVF was about 35.',
      'The 2024 birth figures are preliminary; averages per embryo transferred are not a personal chance.',
    ],
    lifeStages: ['ivf', 'conception'],
    topics: ['ivf-outcomes', 'age-fertility', 'ivf-cumulative-success'],
    tags: ['ivf success rates', 'age', 'national register', 'birth rate', 'single embryo transfer'],
    keywords: ['ivf success', 'ivf success rate', 'success rate', 'chance of success', 'by age', 'age', 'over 40', 'birth rate', 'live birth', 'per embryo', 'hfea', 'statistics', 'how likely', 'chances'],
  },
  {
    url: 'https://obgyn.onlinelibrary.wiley.com/doi/10.1002/ijgo.14946',
    title: 'What counts as a normal period: cycle length, bleeding days and regularity (FIGO System 1, International Journal of Gynecology & Obstetrics 2023)',
    year: 2023,
    summary:
      'The International Federation of Gynecology and Obstetrics (FIGO) defines normal menstrual bleeding in the reproductive years with four measures. A normal cycle, counted from the first day of one period to the first day of the next, lasts 24 to 38 days; shorter cycles count as frequent and longer ones as infrequent, and no bleeding at all is amenorrhoea. Normal bleeding lasts up to 8 days, spotting included. Cycles count as regular when the shortest and longest cycle differ by up to 7 to 9 days, depending on age (up to 9 days at 18 to 25 and 42 to 45, up to 7 days at 26 to 41); for girls under 18 and women over 45 there are no agreed limits. Flow is judged by the woman herself as light, normal or heavy. Bleeding between regular periods is not normal and is worth discussing with a doctor.',
    keyPoints: [
      'Normal cycle length: 24 to 38 days, from the first day of one period to the first day of the next.',
      'Normal bleeding: up to 8 days, spotting included.',
      'Regular: the shortest and longest cycle differ by up to 9 days at ages 18 to 25 and 42 to 45, and up to 7 days at ages 26 to 41.',
      'No agreed limits for regularity under 18 or over 45.',
      'Heavy flow is judged by the woman herself; bleeding between regular periods is not normal.',
    ],
    lifeStages: ['menstrual-cycle', 'general'],
    topics: ['irregular-cycles', 'cycle-tracking'],
    tags: ['normal cycle', 'cycle length', 'figo', 'abnormal uterine bleeding', 'regularity'],
    keywords: ['normal cycle', 'normal cycle length', 'cycle length', 'how long is a normal cycle', 'what is a normal period', 'how many days', 'irregular periods', 'regular cycle', 'period length', 'bleeding days', 'figo', '24 to 38 days', 'short cycle', 'long cycle'],
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
      fetchedAt: src.fetchedAt ?? FETCHED,
      published: null,
      lastUpdated: null,
      lastReviewed: null,
      nextReview: null,
      licence: { ...policy.licence, pageCopyright: null },
      attribution: policy.attribution ?? null,
      refreshDays: null,
      robots: { allowed: true, rule: null, checkedAt: src.fetchedAt ?? FETCHED },
      // Hash of our own summary text (no page text is stored).
      contentHash: fnv1a(text),
      summariser: HAND_WRITTEN_SUMMARISER,
      chunks: 0,
    },
  };
}

const lib = JSON.parse(readFileSync(libFile, 'utf8'));
const topicIds = new Set(lib.topics.map((t) => t.id));
const items = [...SWISS_SOURCES, ...OTHER_SOURCES].map(toItem);
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
  console.log(`${items.length} hand-written items valid`);
  process.exit(0);
}
// Round 8: letter 68 (anti-D) was replaced by letter 94 (new URL, new id).
const REMOVED = new Set(['gp-sggg-empfehlungen-zur-anti-d-immunglobulin-ga-d77009']);
const ids = new Set(items.map((i) => i.id));
lib.items = [...lib.items.filter((i) => !ids.has(i.id) && !REMOVED.has(i.id)), ...items];
writeFileSync(libFile, JSON.stringify(lib, null, 1) + '\n');
console.log(`Upserted ${items.length} hand-written items: ${[...ids].join(', ')}`);
