import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from './_lib/auth.js';
import { withSentry } from './_lib/sentry.js';

// Allow longer execution for AI analysis. Claude PDF analysis on a full
// lab panel with max_tokens: 8000 plus the per-result INSERTs routinely
// exceeds 60s; 300s is Vercel's ceiling on Pro and matches real latency.
export const config = {
  maxDuration: 300,
};

async function hashRequest(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Call Anthropic with bounded exponential backoff on 5xx/429. Returns the
// successful Response. Throws on persistent failure or any 4xx-except-429.
async function callAnthropicWithRetry(apiKey: string, body: unknown): Promise<Response> {
  const delays = [250, 1000, 4000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (resp.ok) return resp;
    const status = resp.status;
    const transient = status >= 500 || status === 429;
    const errText = await resp.text().catch(() => '');
    console.error(`Anthropic error (attempt ${attempt + 1}):`, status, errText.slice(0, 300));
    lastErr = new Error(`AI analysis failed: ${status}`);
    if (!transient || attempt === delays.length) throw lastErr;
    await new Promise(r => setTimeout(r, delays[attempt]));
  }
  throw lastErr ?? new Error('AI analysis failed');
}

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionUser = await getAuthUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const { documentId, userId, filePath, fileName, mimeType } = req.body;
    if (!documentId || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (userId !== sessionUser.id) {
      return res.status(403).json({ error: 'Cannot analyze a document owned by another user' });
    }

    // Download file from Vercel Blob URL
    let documentText = '';
    if (filePath && filePath.startsWith('http')) {
      try {
        const fileResp = await fetch(filePath);
        if (fileResp.ok) {
          const buffer = await fileResp.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');

          // Fetch patient context
          const profiles = await sql.query('SELECT life_stage, pregnancy_due_date, ivf_phase FROM profiles WHERE id = $1', [userId]);
          const profile = profiles[0];
          let patientContext = '';
          if (profile) {
            if (profile.life_stage) patientContext += `Patient life stage: ${profile.life_stage}. `;
            if (profile.pregnancy_due_date) patientContext += `Currently pregnant, due date: ${profile.pregnancy_due_date}. `;
          }

          const today = new Date().toISOString().split('T')[0];
          const dynamicHeader = buildDynamicHeader(today, patientContext);

          let userContent: any[];

          if (mimeType === 'application/pdf') {
            // Send PDF natively to Claude — it can read PDFs directly
            userContent = [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: `Analyze this medical document "${fileName}". Read every page carefully. Extract EVERY test result as a separate item — lab reports contain tables with many values. A typical blood test has 10-25 results.\n\n${patientContext}` },
            ];
          } else if (['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(mimeType)) {
            // Send image to Claude vision
            userContent = [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
              { type: 'text', text: `Analyze this medical document image "${fileName}". Extract EVERY test result you can see in the image.\n\n${patientContext}` },
            ];
          } else {
            documentText = await fileResp.text();
            // Fall through to text processing below
            userContent = [];
          }

          if (userContent.length > 0) {
            return await processWithAI(sql, ANTHROPIC_API_KEY, dynamicHeader, userContent, documentId, userId, fileName, res);
          }
        }
      } catch (e) {
        console.error('File download error:', e);
      }
    }

    if (!documentText || documentText.length < 10) {
      documentText = `[Document: ${fileName}, type: ${mimeType}. No text could be extracted.]`;
    }

    // Fetch patient context
    const profiles = await sql.query('SELECT life_stage, pregnancy_due_date, ivf_phase FROM profiles WHERE id = $1', [userId]);
    const profile = profiles[0];
    let patientContext = '';
    if (profile) {
      if (profile.life_stage) patientContext += `Patient life stage: ${profile.life_stage}. `;
      if (profile.pregnancy_due_date) patientContext += `Currently pregnant, due date: ${profile.pregnancy_due_date}. `;
    }

    const today = new Date().toISOString().split('T')[0];
    const dynamicHeader = buildDynamicHeader(today, patientContext);
    const userContent = `Analyze this medical document "${fileName}". Extract EVERY test result as a separate item.\n\n${patientContext}\n\nDocument text:\n${documentText}`;

    return await processWithAI(sql, ANTHROPIC_API_KEY, dynamicHeader, [{ type: 'text', text: userContent }], documentId, userId, fileName, res);

  } catch (error) {
    console.error('analyze-document error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
}

// The static, cacheable portion of the system prompt. Kept as a module
// constant so Anthropic prompt caching can hit on it across requests —
// only the dynamic header (today's date + patient context) varies.
const STATIC_RULES = `Return ONLY valid JSON with this structure:
{"name":"doc name (max 50 chars)","category":"lab_results|imaging|prescription|consultation_notes|other","summary":"3-5 sentences. Lead with most critical findings with specific values. Mention cross-referencing patterns between results. End with reassurance.","key_takeaways":["..."],"action_items":["..."],"extracted_data":[...],"cross_references":[{"pattern":"name","tests":["Test1","Test2"],"finding":"what this combination means","severity":"info|attention|urgent"}],"risk_screening":{"preeclampsia_risk":null,"gestational_diabetes_risk":null,"iron_deficiency_risk":null,"thyroid_disorder_risk":null,"pcos_risk":null,"osteoporosis_risk":null,"cardiovascular_risk":null,"autoimmune_risk":null},"cycle_data":{"cycle_length":null,"last_period_date":null,"period_length":null,"irregular":null}}

Each item in extracted_data:
{"data_type":"lab_result|condition|medication|allergy|procedure|risk_screening","title":"Standardized name (Hemoglobin not Hb)","value":"number","unit":"unit","reference_range":"low-high","status":"normal|abnormal|critical|expected|informational","priority":"high|medium|low","date_recorded":"YYYY-MM-DD","notes":"MANDATORY 1-2 sentences explaining what this means for this patient.","panel":"CBC|Thyroid Panel|Metabolic Panel|Hormone Panel|Coagulation|Autoimmune|Vitamins & Minerals|Immunology|Infection Screening|Liver Panel|Bone Markers|Lipid Panel|Fertility Panel|Tumor Markers|Urinalysis|STI Screening|Other","possible_conditions":["for abnormal only"],"is_repeat_test":false}

COMPREHENSIVE WOMEN'S HEALTH ANALYSIS RULES (2024-2026 clinical guidelines):

1. EXTRACT EVERY test result individually. A typical blood panel has 15-40 values. Never summarize — list each one.

═══ PREGNANCY-SPECIFIC RANGES ═══

2. TRIMESTER-SPECIFIC RANGES (ASH Blood Advances 2024, ACOG):
   - Ferritin: 1st tri <25.8 = iron deficient, 2nd tri <18.3, 3rd tri <19.0 μg/L. Old <15 threshold UNDERESTIMATES by ~10%
   - Hemoglobin: <11 g/dL = anemia (WHO). Hb naturally drops in 2nd tri (hemodilution)
   - TSH: 1st tri 0.1-2.5, 2nd tri 0.2-3.0, 3rd tri 0.3-3.5 mIU/L
   - HCG: elevated = "expected". Doubling time matters more than absolute value
   - Platelets: <150k = gestational thrombocytopenia (common). <100k = urgent (HELLP risk)
   - Serum creatinine >0.8 mg/dL is concerning in pregnancy (normal is lower due to 50% GFR increase)
   - Proteinuria >=300 mg/24h or protein/creatinine ratio >=0.3 = significant in pregnancy

3. LIVER CONDITIONS IN PREGNANCY:
   - Intrahepatic cholestasis (ICP): Bile acids >=10 μmol/L = diagnostic. >=40 = increased risk. >=100 = severe (deliver at 36wk)
   - HELLP (Tennessee): Platelets <100k + LDH >=600 + AST >=70
   - HELLP Mississippi Class I: Platelets <=50k. Class II: 50-100k. Class III: 100-150k
   - Acute fatty liver (AFLP): hypoglycemia + coagulopathy + leukocytosis distinguish from HELLP
   - Elevated liver enzymes + low platelets in pregnancy = ALWAYS flag as URGENT

4. GESTATIONAL diabetes (IADPSG 75g OGTT): fasting >=92, 1hr >=180, 2hr >=153 mg/dL. ANY ONE value = GDM
   - Pre-existing diabetes at first visit: fasting >=126, HbA1c >=6.5%, random >=200 with symptoms
   - GDM + elevated fasting insulin + HOMA-IR >2.5 = significant insulin resistance

5. IVF MONITORING:
   - Baseline estradiol <80 pg/mL (suppressed). Per mature follicle: 200-300 pg/mL
   - Pre-trigger progesterone: <1.0 ng/mL normal. >1.5 = premature luteinization
   - Beta-HCG day 14 post-retrieval: >25 = positive. Mean ~276. Day 16 mean ~621
   - HCG doubling: <1200 = 48-72h. 1200-6000 = 72-96h. Minimum 48h rise: 49% for <1200
   - Gestational sac visible at HCG 1000-2000. Heartbeat at 5000-10000

6. OBSTETRIC APS (2023 ACR/EULAR): >=1 fetal death >=10wk, or >=1 premature birth <34wk from eclampsia/preeclampsia, or >=3 consecutive miscarriages <10wk. Lab: Lupus anticoagulant + anticardiolipin >40 GPL/MPL + anti-beta2-glycoprotein I >=20 U/mL (confirmed 12wk apart). Triple-positive = highest risk.

═══ PCOS (2023 International Guideline) ═══

7. PCOS DIAGNOSIS (requires 2 of 3: hyperandrogenism, ovulatory dysfunction, polycystic ovaries/elevated AMH):
   - LH/FSH ratio >2:1 (often >3:1) = suggestive
   - Total testosterone >86 ng/dL, Free testosterone >3.6 pg/mL = biochemical hyperandrogenism
   - DHEA-S >200 μg/dL commonly elevated. Androstenedione >4.56 nmol/L
   - HOMA-IR >=2.0 (PCOS-specific cutoff). Formula: (fasting insulin × fasting glucose mg/dL) / 405
   - AMH >3.5 ng/mL elevated; >10.35 strongly suggestive (accepted as ultrasound alternative in adults)
   - Fasting insulin >20 μU/mL = insulin resistance
   - PCOS + elevated triglycerides + low HDL + HOMA-IR >2.5 = metabolic PCOS phenotype
   - Elevated DHEA-S alone without high testosterone = adrenal source → check 17-hydroxyprogesterone for late-onset CAH
   - Full workup per 2025 Endocrine Society: FSH, LH, estradiol, 17-OHP, testosterone, DHEAS, androstenedione, SHBG, prolactin

═══ ENDOMETRIOSIS ═══

8. ENDOMETRIOSIS MARKERS (supportive, not diagnostic):
   - CA-125 >35 U/mL (median 68 in endo vs 12 in controls). Most elevated in stages III-IV
   - IL-6 >1.98 pg/mL. hs-CRP elevated. NLR (Neutrophil-to-Lymphocyte Ratio) elevated
   - CA-125 + elevated NLR together = highest diagnostic performance
   - CA-125 also elevated by menstruation, ovarian cysts, PID, pregnancy — interpret in context
   - Elevated CA-125 + low AMH + pain = consider endometriosis impact on ovarian reserve

═══ FERTILITY & OVARIAN RESERVE ═══

9. FERTILITY MARKERS (ASRM):
   - AMH by age: 20-25 median 4.23, 26-30: 3.48, 31-35: 2.43, 36-40: 1.28, 40-44: 0.52 ng/mL
   - AMH <1.1 = low ovarian reserve at any age. AMH >3.5 = high (possible PCOS)
   - Day 3 FSH <10 normal. 10-15 concerning. >15 poor prognosis
   - Day 3 estradiol >80 pg/mL may falsely suppress FSH — always interpret together
   - Mid-luteal progesterone (Day 21): <3 = anovulatory. >3 = ovulatory. >10 = robust ovulation
   - Low AMH + high Day 3 FSH + low AFC = diminished ovarian reserve
   - AMH declines before FSH rises — more sensitive early marker
   - Anti-TPO >35 even with normal TSH = increased miscarriage risk → monitor TSH closely

═══ PERIMENOPAUSE & MENOPAUSE ═══

10. MENOPAUSE MARKERS (STRAW+10):
   - FSH >25 with erratic cycles + fluctuating estradiol = perimenopause
   - FSH >30 + estradiol <30 pg/mL + 12 months amenorrhea = confirmed menopause
   - Low AMH + rising FSH = declining ovarian reserve approaching menopause
   - Bone turnover: CTX (resorption) premenopausal 0.22-0.30, postmenopausal 0.34-1.04 ng/mL
   - P1NP (formation) 15-75 μg/L premenopausal
   - Elevated CTX + elevated P1NP = high bone turnover (increased fracture risk)
   - High CTX + low P1NP = net bone loss (resorption > formation) — urgent
   - Postmenopausal: recheck lipids including ApoB due to hormonal shift. Lp(a) rises ~17% postmenopause

═══ THYROID ═══

11. THYROID (pregnancy-adjusted and general):
   - General: TSH 0.4-4.0 mIU/L. Pregnancy: see trimester ranges above
   - High TSH + low FT4 = hypothyroidism. Affects cycle, fertility, pregnancy
   - Low TSH + high FT4 = hyperthyroidism. Can cause light/absent periods
   - Anti-TPO >35 IU/mL = Hashimoto's thyroiditis (4-10x more common in women)
   - Anti-Thyroglobulin >20 IU/mL = thyroid autoimmunity
   - Anti-TPO + elevated TSH + symptoms = Hashimoto's
   - Low ferritin + high TSH = ferritin predicts TSH levels (ASH 2024)

═══ AUTOIMMUNE CONDITIONS ═══

12. AUTOIMMUNE SCREENING (women are disproportionately affected):
   - ANA >=1:80 clinically relevant. >=1:160 more specific. Women are 9x more likely for SLE
   - Anti-dsDNA positive = ~30% of SLE. Anti-Smith positive = highly specific for SLE
   - ANA >=1:160 + anti-dsDNA + anti-Smith = high probability lupus
   - Rheumatoid Factor >14-20 IU/mL. Anti-CCP >5 U/mL (highly specific for RA)
   - APS antibodies (2023 ACR/EULAR): Anticardiolipin >40 GPL/MPL, Anti-beta2-glycoprotein I >=20 U/mL, Lupus anticoagulant positive
   - Triple-positive aPL = highest thrombotic risk
   - APS + pregnancy = increased miscarriage/clot risk → aspirin + LMWH
   - Anti-TPO positive + ANA positive + anti-dsDNA = polyautoimmunity (Hashimoto's + lupus overlap)

═══ IRON & BLOOD DISORDERS ═══

13. IRON & ANEMIA:
   - Ferritin <30 μg/L = iron deficiency (general). Use trimester-specific thresholds in pregnancy
   - Ferritin <30 + Hb <12 (non-pregnant) or <11 (pregnant) = iron deficiency anemia
   - Ferritin <30 + normal Hb = latent iron deficiency (will worsen without treatment)
   - THALASSEMIA: Low MCV <80 + low MCH <27 + normal/high RBC count + HbA2 >3.5% = beta-thalassemia trait
   - Iron deficiency vs thalassemia: check ferritin (low = iron) AND HbA2 (elevated = thalassemia). Both can coexist
   - Sickle cell: HbS 20-45% = trait. HbS 80-95% + HbA absent = disease

═══ CARDIOVASCULAR (WOMEN-SPECIFIC) ═══

14. CARDIOVASCULAR RISK:
   - Lp(a): <75 nmol/L low risk. 75-125 intermediate. >=125 high risk (17% higher in postmenopausal women)
   - ApoB: <80 mg/dL optimal. >100-130 high risk. Better predictor than LDL-C alone (2026 ACC/AHA)
   - hs-CRP: <1.0 low risk. 1.0-2.0 moderate. >=2.0 elevated CV risk
   - Homocysteine: <10 optimal. >15 μmol/L elevated → check B12, folate
   - Fibrinogen: >400 mg/dL elevated
   - High ApoB + normal LDL-C = discordant (ApoB is more accurate)
   - Elevated Lp(a) + elevated hs-CRP = compounded cardiovascular risk
   - LDL >130 mg/dL postmenopause = rising due to estrogen decline (common)
   - LDL/HDL ratio >3.5 = concerning

═══ OSTEOPOROSIS ═══

15. BONE HEALTH:
   - DEXA T-score >= -1.0 normal. -1.1 to -2.4 osteopenia. <=-2.5 osteoporosis
   - Vitamin D <20 ng/mL deficient. 20-29 insufficient. 30-100 sufficient
   - PTH rises when vitamin D <31 ng/mL (compensatory)
   - T-score <=-2.5 + low vitamin D + elevated PTH = secondary hyperparathyroidism driving bone loss
   - Low vitamin D + low calcium = impaired calcium absorption
   - Screen all women >=65. Younger postmenopausal with risk factors (USPSTF)

═══ SKIN, HAIR & ANDROGENS ═══

16. HYPERANDROGENISM (hirsutism, acne, hair loss):
   - Total testosterone >86 ng/dL, Free testosterone >3.6 pg/mL
   - DHEA-S >430 μg/dL. Androstenedione >4.56 nmol/L
   - SHBG <18 nmol/L = high free androgen even with normal total T
   - Prolactin >29 ng/mL = can increase DHEA-S → hirsutism. Check for prolactinoma
   - Elevated DHEA-S + normal testosterone = adrenal source → check 17-OHP
   - 2025 Endocrine Society workup: FSH, LH, estradiol, 17-OHP, testosterone, DHEAS, androstenedione, SHBG, prolactin

═══ METABOLIC & DIABETES ═══

17. BLOOD SUGAR:
   - Fasting glucose: normal <100, prediabetes 100-125, diabetes >=126 mg/dL
   - HbA1c: normal <5.7%, prediabetes 5.7-6.4%, diabetes >=6.5%
   - HOMA-IR: <1.0 optimal, <2.5 normal, >=2.5 insulin resistance
   - High glucose + high HbA1c = diabetes/prediabetes
   - High glucose + high testosterone = PCOS with insulin resistance
   - Gestational diabetes thresholds: see rule 4

═══ VITAMINS & MENTAL HEALTH ═══

18. NUTRITIONAL & MENTAL HEALTH:
   - Vitamin D <20 deficient. Linked to worse PMS, irregular cycles, reduced fertility, depression
   - Vitamin B12 <148 pg/mL deficient. 148-250 borderline (check MMA). Doubles depression risk in women
   - Folate <5 ng/mL low. Critical pre-conception (neural tube defects)
   - Always check B12 + folate + homocysteine together (elevated homocysteine + low B12 = functional deficiency)
   - Morning cortisol (8 AM): 10-20 μg/dL normal. >25 = Cushing's screening. <5 = adrenal insufficiency
   - DHEA-S/cortisol ratio: 0.03-0.07 optimal. >0.14 = stress overload
   - Low B12 + low vitamin D + elevated cortisol/DHEA-S ratio = biochemical contributors to depression
   - Magnesium <1.7 mg/dL = may worsen PMS, cramps, sleep

═══ INFECTION & STI SCREENING ═══

19. STI/INFECTION MARKERS (CDC):
   - Syphilis: RPR/VDRL + FTA-ABS/TP-PA both positive = active. RPR+ FTA- = false positive
   - HIV: 4th-gen Ag/Ab combo. Hepatitis B: HBsAg. Hepatitis C: anti-HCV
   - Chlamydia/Gonorrhea: NAAT. All women <25 annually
   - HSV: type-specific IgG (HSV-1, HSV-2). Not routine — test if symptomatic
   - CRP elevated + WBC elevated = active inflammation/infection
   - Universal pregnancy screening: HIV, syphilis, HBV, HCV early

═══ BREAST & CERVICAL HEALTH ═══

20. TUMOR MARKERS & SCREENING:
   - CA 15-3 >30 U/mL = breast cancer monitoring (NOT screening). Normal does not exclude cancer
   - CEA >5.0 ng/mL = elevated. Combined CA 15-3 + CEA monitoring for metastatic disease
   - CA-125 >35 U/mL = see endometriosis (rule 8). Also elevated in ovarian cancer
   - Pap: NILM normal. ASC-US + HPV negative = low risk. ASC-US + HPV positive = colposcopy. HSIL = urgent
   - HPV 16/18 positive = higher risk → colposcopy even with normal cytology
   - BRCA carriers: annual MRI from 25 + mammography from 30 (NCCN 2024-2025)

═══ HORMONAL CONTRACEPTION ═══

21. CONTRACEPTION MONITORING:
   - Blood pressure >140/90 = discontinue combined oral contraceptives
   - ALT/AST >2x upper limit = hepatic concern
   - Triglycerides >500 mg/dL = pancreatitis risk on COC
   - WHO Category 4 (absolute contraindication): uncontrolled HTN, active liver disease, VTE history, migraine with aura
   - COCs increase VTE risk via estrogen-mediated clotting factor changes

═══ URINARY & KIDNEY ═══

22. URINALYSIS:
   - Protein >=1+ on dipstick = follow up with quantitative
   - Protein/creatinine ratio >=0.3 in pregnancy = significant proteinuria (preeclampsia)
   - WBC >5/HPF + nitrites positive = UTI
   - Glucosuria in pregnancy may be physiologic (increased GFR) — not diagnostic of GDM

═══ CROSS-REFERENCING RULES ═══

23. ALWAYS populate the cross_references array when you detect:
   - Iron + Hemoglobin patterns (deficiency, anemia, latent)
   - Thyroid + cycle/fertility connections
   - PCOS pattern (LH/FSH + testosterone + insulin + AMH)
   - Metabolic syndrome markers clustering
   - Autoimmune overlap patterns
   - Bone health + vitamin D + calcium + PTH
   - Cardiovascular risk clustering (Lp(a) + ApoB + CRP + homocysteine)
   - Liver + platelets in pregnancy (HELLP/cholestasis)
   - APS antibodies + pregnancy complications
   - Nutritional deficiency combinations (B12 + folate + iron = triple gap)
   - Endometriosis markers + fertility impact
   - Depression biomarker patterns (B12 + D + cortisol)
   - Menopause transition markers + downstream risks

24. NOTES must be specific and actionable. For each result explain:
   - What this value means for THIS patient (considering life stage, pregnancy trimester, age)
   - Whether it's trending or is a repeat test
   - What the patient should do about it
   - For women-specific conditions, explain how this relates to their reproductive health

25. Standardize test names for cross-document matching.
26. Return ONLY the JSON object. No markdown fences.`;

function buildDynamicHeader(today: string, patientContext: string): string {
  return `You are an advanced women's health document analyzer using the latest 2024-2026 clinical research. Write for patients in plain language. Today: ${today}.
${patientContext || ''}`;
}

async function processWithAI(
  sql: any, apiKey: string, dynamicHeader: string, userContent: any,
  documentId: string, userId: string, fileName: string,
  res: VercelResponse
) {
  const contentStr = JSON.stringify(userContent);
  // Hash includes STATIC_RULES so a future prompt-rules revision invalidates
  // the llm_cache naturally. Model name is hashed in too.
  const cacheKey = await hashRequest(STATIC_RULES + dynamicHeader + contentStr + 'claude-sonnet-4-20250514');

  // Check cache
  const cached = await sql.query('SELECT response_text FROM llm_cache WHERE request_hash = $1', [cacheKey]);

  let aiContent: string;

  if (cached.length > 0 && cached[0].response_text) {
    console.log(`CACHE HIT for ${documentId}`);
    aiContent = cached[0].response_text;
    await sql.query('UPDATE llm_cache SET hit_count = hit_count + 1, last_hit_at = now() WHERE request_hash = $1', [cacheKey]).catch(() => {});
  } else {
    console.log(`CACHE MISS for ${documentId} — calling Anthropic`);

    const messages = Array.isArray(userContent) && userContent[0]?.type
      ? [{ role: 'user', content: userContent }]
      : [{ role: 'user', content: userContent }];

    // Retry on transient upstream failures (5xx and 429). A single flaky
    // response would otherwise dump the whole analysis onto the user.
    //
    // System is structured: STATIC_RULES first with cache_control so
    // Anthropic can return a cached prefix on repeat requests within 5
    // minutes; dynamic header (today's date + patient context) follows
    // and varies per request. The static block is well over the 1024-
    // token minimum required for caching on Sonnet.
    const aiResponse = await callAnthropicWithRetry(apiKey, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: [
        { type: 'text', text: STATIC_RULES, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dynamicHeader },
      ],
      messages,
      temperature: 0.2,
    });

    const aiData = await aiResponse.json();
    aiContent = aiData.content?.[0]?.text;

    if (aiContent) {
      await sql.query(
        'INSERT INTO llm_cache (request_hash, response_text, model) VALUES ($1, $2, $3) ON CONFLICT (request_hash) DO UPDATE SET response_text = $2',
        [cacheKey, aiContent, 'claude-sonnet-4-20250514']
      ).catch((e: any) => console.error('Cache store error:', e));
    }
  }

  if (!aiContent) throw new Error('No AI response');

  // Parse JSON
  let analysis: any;
  try {
    const cleaned = aiContent.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);
    console.log(`Parsed OK. extracted_data: ${analysis.extracted_data?.length || 0} items`);
  } catch {
    console.error('JSON parse failed. First 300:', aiContent.slice(0, 300));
    const start = aiContent.indexOf('{');
    const end = aiContent.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { analysis = JSON.parse(aiContent.slice(start, end + 1)); } catch {
        analysis = { name: fileName, category: 'other', summary: aiContent.slice(0, 1200), extracted_data: [] };
      }
    } else {
      analysis = { name: fileName, category: 'other', summary: aiContent.slice(0, 1200), extracted_data: [] };
    }
  }

  // Build summary
  let enhancedSummary = analysis.summary || 'Document analyzed.';
  if (analysis.key_takeaways?.length > 0) {
    enhancedSummary += '\n\n📋 Key Takeaways:\n' + analysis.key_takeaways.map((t: string) => `• ${t}`).join('\n');
  }
  if (analysis.action_items?.length > 0) {
    enhancedSummary += '\n\n⚡ Action Items:\n' + analysis.action_items.map((a: string) => `• ${a}`).join('\n');
  }
  if (Array.isArray(analysis.cross_references) && analysis.cross_references.length > 0) {
    enhancedSummary += '\n\n🔗 Cross-Referenced Patterns:\n' + analysis.cross_references.map((cr: any) => {
      const icon = cr.severity === 'urgent' ? '🚨' : cr.severity === 'attention' ? '⚠️' : 'ℹ️';
      return `${icon} ${cr.pattern}: ${cr.finding} (${cr.tests?.join(' + ') || ''})`;
    }).join('\n');
  }

  const analysisName = analysis.name || fileName;
  const analysisCategory = analysis.category || 'other';
  const model = 'claude-sonnet-4-20250514';

  // Step 1: create a new document_analyses row in a pending state
  // (is_current = FALSE). We only flip it to TRUE once all extracted
  // data is written — so a crash mid-write leaves the prior analysis
  // intact.
  const analysisRow = await sql.query(
    `INSERT INTO document_analyses (document_id, user_id, model, name, category, summary, is_current)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING id`,
    [documentId, userId, model, analysisName, analysisCategory, enhancedSummary]
  );
  const analysisId = analysisRow[0].id as string;

  // Step 2 + 3: collect every extracted_data row we want to write
  // (lab results, conditions, medications, plus risk_screening items)
  // and issue a single multi-row INSERT. This replaces the previous
  // 20–40 sequential round-trips to Neon — worth several seconds per
  // document.
  const rows: any[][] = [];
  if (Array.isArray(analysis.extracted_data)) {
    for (const item of analysis.extracted_data) {
      rows.push([
        userId, documentId, analysisId,
        item.data_type || 'other', item.title || 'Unknown',
        item.value ?? null, item.unit ?? null, item.reference_range ?? null,
        item.status ?? null, item.date_recorded ?? null, item.notes ?? null,
        JSON.stringify({
          priority: item.priority,
          panel: item.panel,
          possible_conditions: item.possible_conditions,
          is_repeat_test: item.is_repeat_test,
        }),
      ]);
    }
  }
  if (analysis.risk_screening) {
    const riskMap: Record<string, string> = {
      preeclampsia_risk: 'Preeclampsia Risk',
      gestational_diabetes_risk: 'Gestational Diabetes Risk',
      iron_deficiency_risk: 'Iron Deficiency Risk',
      thyroid_disorder_risk: 'Thyroid Disorder Risk',
      pcos_risk: 'PCOS Risk',
      osteoporosis_risk: 'Osteoporosis Risk',
      cardiovascular_risk: 'Cardiovascular Risk',
      autoimmune_risk: 'Autoimmune Risk',
    };
    for (const [key, label] of Object.entries(riskMap)) {
      const riskVal = analysis.risk_screening[key];
      if (riskVal && riskVal !== 'null' && riskVal !== null) {
        rows.push([
          userId, documentId, analysisId,
          'risk_screening', label,
          riskVal, null, null,
          riskVal === 'low' ? 'normal' : riskVal === 'moderate' ? 'abnormal' : riskVal === 'high' ? 'critical' : 'informational',
          null, `AI-assessed ${label.toLowerCase()} based on cross-referencing multiple test results.`,
          JSON.stringify({ risk_type: key, source: 'ai_analysis' }),
        ]);
      }
    }
  }
  if (rows.length > 0) {
    const colCount = 12;
    const placeholders = rows
      .map((_, rowIdx) =>
        `(${Array.from({ length: colCount }, (_, c) => `$${rowIdx * colCount + c + 1}`).join(', ')})`
      )
      .join(', ');
    const params = rows.flat();
    await sql.query(
      `INSERT INTO medical_extracted_data
         (user_id, document_id, analysis_id, data_type, title, value, unit, reference_range, status, date_recorded, notes, raw_data)
       VALUES ${placeholders}`,
      params
    );
  }

  // Step 4: atomically flip the current-flag and update the denormalized
  // summary/name/category on health_documents. Any prior analysis for
  // this document becomes history; its extracted data remains queryable
  // via document_analyses.
  await sql.transaction([
    sql`UPDATE document_analyses SET is_current = FALSE WHERE document_id = ${documentId} AND is_current = TRUE AND id != ${analysisId}`,
    sql`UPDATE document_analyses SET is_current = TRUE WHERE id = ${analysisId}`,
    sql`UPDATE health_documents SET ai_suggested_name = ${analysisName}, ai_suggested_category = ${analysisCategory}, ai_summary = ${enhancedSummary} WHERE id = ${documentId} AND user_id = ${userId}`,
  ]);

  return res.status(200).json({
    success: true,
    analysis_id: analysisId,
    extracted: analysis.extracted_data?.length || 0,
    crossReferences: analysis.cross_references?.length || 0,
    name: analysis.name,
    category: analysis.category,
    summaryLength: enhancedSummary.length,
    cached: false,
  });
}

export default withSentry(handler);
