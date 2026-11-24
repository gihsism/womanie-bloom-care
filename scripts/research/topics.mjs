// Topic plan for the Womanie research library.
//
// Each topic becomes up to `max` PubMed records (guidelines first, then
// Cochrane reviews, then other systematic reviews / meta-analyses), all
// fetched live from NCBI E-utilities by build-library.mjs. The query is a
// plain PubMed search string; the build script adds the evidence-type,
// date, language and abstract filters.
//
// `stages` are Womanie life-stage ids (the profile.life_stage values),
// plus 'general' for topics that apply at any stage.
//
// `landmarks` are a handful of famous trials found by searching their
// title words; the fetched title must contain `mustInclude` or the record
// is rejected (so nothing is ever cited from memory).

export const STAGES = [
  'menstrual-cycle',
  'conception',
  'pregnancy',
  'postpartum',
  'contraception',
  'ivf',
  'menopause',
  'post-menopause',
  'general',
];

/** @type {{id:string,label:string,stages:string[],query:string,max?:number}[]} */
export const TOPICS = [
  // ── Menstrual cycle ────────────────────────────────────────────
  { id: 'pcos', label: 'Polycystic ovary syndrome (PCOS)', stages: ['menstrual-cycle', 'conception'], query: '"polycystic ovary syndrome"[mh] AND (management OR diagnosis OR lifestyle)', max: 6 },
  { id: 'endometriosis', label: 'Endometriosis', stages: ['menstrual-cycle', 'conception'], query: 'endometriosis[mh] AND (pain OR diagnosis OR treatment)', max: 6 },
  { id: 'pms-pmdd', label: 'PMS and PMDD', stages: ['menstrual-cycle'], query: '("premenstrual syndrome"[mh] OR "premenstrual dysphoric disorder"[mh])', max: 5 },
  { id: 'heavy-bleeding', label: 'Heavy menstrual bleeding', stages: ['menstrual-cycle'], query: '(menorrhagia[mh] OR "heavy menstrual bleeding"[tiab])', max: 5 },
  { id: 'period-pain', label: 'Period pain (dysmenorrhoea)', stages: ['menstrual-cycle'], query: 'dysmenorrhea[mh]', max: 5 },
  { id: 'irregular-cycles', label: 'Irregular or absent periods', stages: ['menstrual-cycle'], query: '(amenorrhea[mh] OR oligomenorrhea[mh] OR "irregular menstrual"[tiab] OR "menstrual cycle irregularity"[tiab])', max: 4 },
  { id: 'fibroids', label: 'Uterine fibroids', stages: ['menstrual-cycle', 'conception'], query: 'leiomyoma[mh] AND uterus', max: 3 },
  { id: 'cycle-tracking', label: 'Cycle tracking and fertility awareness', stages: ['menstrual-cycle', 'conception', 'contraception'], query: '("fertility awareness"[tiab] OR "natural family planning"[mh] OR "menstrual cycle tracking"[tiab] OR "ovulation detection"[mh])', max: 3 },

  // ── Conception / fertility ─────────────────────────────────────
  { id: 'intercourse-timing', label: 'Timing intercourse to conceive', stages: ['conception'], query: '("fertile window"[tiab] OR "timed intercourse"[tiab] OR "time to pregnancy"[tiab]) AND (conception OR fecundability)', max: 4 },
  { id: 'amh-ovarian-reserve', label: 'AMH and egg reserve', stages: ['conception', 'ivf'], query: '("anti-mullerian hormone"[tiab] OR "ovarian reserve"[mh]) AND (fertility OR fecundability OR prediction)', max: 5 },
  { id: 'folic-acid', label: 'Folic acid before and in pregnancy', stages: ['conception', 'pregnancy'], query: '"folic acid"[mh] AND ("neural tube defects"[mh] OR periconception OR preconception)', max: 5 },
  { id: 'age-fertility', label: 'Age and fertility', stages: ['conception', 'ivf'], query: '("maternal age"[mh] OR "female age"[tiab]) AND (fertility OR infertility OR "live birth")', max: 3 },
  { id: 'lifestyle-fertility', label: 'Lifestyle, weight and fertility', stages: ['conception'], query: '(infertility, female[mh] OR fecundability OR "time to pregnancy") AND (diet OR "body mass index" OR obesity OR smoking OR alcohol OR caffeine OR exercise)', max: 5 },
  { id: 'preconception-care', label: 'Preconception health', stages: ['conception'], query: '"preconception care"[mh]', max: 4 },
  { id: 'male-factor', label: 'Male fertility and sperm health', stages: ['conception', 'ivf'], query: '"infertility, male"[mh] AND (lifestyle OR antioxidants OR semen quality)', max: 3 },
  { id: 'miscarriage', label: 'Miscarriage and early pregnancy loss', stages: ['conception', 'pregnancy'], query: '("abortion, spontaneous"[mh] OR "recurrent pregnancy loss"[tiab] OR miscarriage[tiab])', max: 5 },
  { id: 'infertility-evaluation', label: 'Infertility investigations', stages: ['conception', 'ivf'], query: 'infertility[mh] AND (evaluation OR investigation OR "unexplained infertility")', max: 3 },

  // ── Pregnancy ──────────────────────────────────────────────────
  { id: 'pregnancy-nutrition', label: 'Nutrition in pregnancy', stages: ['pregnancy'], query: '("prenatal nutritional physiological phenomena"[mh] OR "maternal nutrition"[tiab] OR "diet in pregnancy"[tiab] OR "dietary supplements"[mh]) AND pregnancy[mh]', max: 5 },
  { id: 'caffeine-pregnancy', label: 'Caffeine and coffee in pregnancy', stages: ['pregnancy', 'conception'], query: '(caffeine[mh] OR coffee[mh]) AND pregnancy[mh]', max: 5 },
  { id: 'alcohol-pregnancy', label: 'Alcohol in pregnancy', stages: ['pregnancy', 'conception'], query: '("alcohol drinking"[mh] OR "prenatal alcohol exposure"[tiab] OR "fetal alcohol spectrum disorders"[mh]) AND pregnancy', max: 4 },
  { id: 'smoking-pregnancy', label: 'Smoking and vaping in pregnancy', stages: ['pregnancy', 'conception'], query: '("smoking cessation"[mh] OR "tobacco use"[tiab] OR "electronic nicotine delivery systems"[mh]) AND pregnancy[mh]', max: 3 },
  { id: 'exercise-pregnancy', label: 'Exercise in pregnancy', stages: ['pregnancy'], query: '(exercise[mh] OR "physical activity"[tiab]) AND pregnancy[mh] AND (guideline OR outcomes)', max: 5 },
  { id: 'weight-gain-pregnancy', label: 'Weight gain in pregnancy', stages: ['pregnancy'], query: '"gestational weight gain"[mh] OR "gestational weight gain"[tiab]', max: 4 },
  { id: 'gestational-diabetes', label: 'Gestational diabetes', stages: ['pregnancy'], query: '"diabetes, gestational"[mh] AND (screening OR management OR treatment OR prevention)', max: 6 },
  { id: 'pre-eclampsia', label: 'Pre-eclampsia and blood pressure', stages: ['pregnancy'], query: '("pre-eclampsia"[mh] OR "hypertension, pregnancy-induced"[mh]) AND (aspirin OR prevention OR management OR screening)', max: 6 },
  { id: 'anaemia-pregnancy', label: 'Anaemia and iron in pregnancy', stages: ['pregnancy'], query: '("anemia, iron-deficiency"[mh] OR iron[mh]) AND pregnancy[mh] AND (supplementation OR treatment OR screening)', max: 5 },
  { id: 'thyroid-pregnancy', label: 'Thyroid in pregnancy', stages: ['pregnancy', 'conception'], query: '("thyroid diseases"[mh] OR hypothyroidism[mh] OR "subclinical hypothyroidism"[tiab]) AND pregnancy[mh]', max: 4 },
  { id: 'vaccines-pregnancy', label: 'Vaccines in pregnancy', stages: ['pregnancy'], query: '(vaccination[mh] OR vaccines[mh]) AND pregnancy[mh] AND (influenza OR pertussis OR COVID-19 OR RSV OR safety)', max: 5 },
  { id: 'medications-pregnancy', label: 'Medicines in pregnancy (paracetamol, antidepressants)', stages: ['pregnancy'], query: '(acetaminophen[mh] OR "antidepressive agents"[mh] OR "drug safety"[tiab]) AND pregnancy[mh]', max: 4 },
  { id: 'prenatal-screening', label: 'Prenatal screening tests', stages: ['pregnancy'], query: '("prenatal diagnosis"[mh] OR "noninvasive prenatal testing"[mh] OR "cell-free DNA"[tiab] OR "nuchal translucency"[tiab]) AND screening', max: 4 },
  { id: 'nausea-pregnancy', label: 'Nausea and vomiting in pregnancy', stages: ['pregnancy'], query: '("morning sickness"[mh] OR "hyperemesis gravidarum"[mh] OR "nausea and vomiting of pregnancy"[tiab])', max: 4 },
  { id: 'sleep-position', label: 'Sleep and sleep position in pregnancy', stages: ['pregnancy'], query: '("sleep position"[tiab] OR "maternal sleep"[tiab] OR "supine going-to-sleep"[tiab]) AND (stillbirth OR pregnancy)', max: 3 },
  { id: 'fetal-movements', label: 'Baby movements in pregnancy', stages: ['pregnancy'], query: '"fetal movement"[mh] OR "reduced fetal movements"[tiab] OR "decreased fetal movement"[tiab]', max: 3 },
  { id: 'preterm-birth', label: 'Preterm birth prevention', stages: ['pregnancy'], query: '"premature birth"[mh] AND (prevention OR progesterone OR cerclage)', max: 4 },
  { id: 'food-safety-pregnancy', label: 'Food safety and fish in pregnancy', stages: ['pregnancy'], query: '(listeriosis OR toxoplasmosis OR "fish consumption" OR "omega-3") AND pregnancy[mh]', max: 4 },
  { id: 'vitamin-d-pregnancy', label: 'Vitamin D in pregnancy', stages: ['pregnancy'], query: '"vitamin d"[mh] AND pregnancy[mh] AND supplementation', max: 3 },
  { id: 'labour-birth', label: 'Labour, birth and pain relief', stages: ['pregnancy'], query: '("labor pain"[mh] OR "analgesia, obstetrical"[mh] OR "labor, induced"[mh] OR "intrapartum care"[tiab])', max: 5 },
  { id: 'caesarean', label: 'Caesarean birth and VBAC', stages: ['pregnancy', 'postpartum'], query: '("cesarean section"[mh] OR "vaginal birth after cesarean"[mh]) AND (outcomes OR recovery OR guideline)', max: 3 },
  { id: 'perinatal-mental-health-pregnancy', label: 'Mental health in pregnancy', stages: ['pregnancy'], query: '("depression"[mh] OR anxiety[mh]) AND ("pregnancy"[mh] OR antenatal OR prenatal) AND (screening OR intervention)', max: 3 },

  // ── Postpartum ─────────────────────────────────────────────────
  { id: 'breastfeeding', label: 'Breastfeeding', stages: ['postpartum'], query: '"breast feeding"[mh] AND (support OR benefits OR outcomes OR duration)', max: 6 },
  { id: 'breastfeeding-problems', label: 'Breastfeeding problems (mastitis, sore nipples, supply)', stages: ['postpartum'], query: '(mastitis[mh] OR "nipple pain"[tiab] OR "breast milk supply"[tiab] OR galactagogues[mh] OR "lactation"[mh]) AND (treatment OR management)', max: 4 },
  { id: 'postnatal-depression', label: 'Postnatal depression and EPDS', stages: ['postpartum'], query: '"depression, postpartum"[mh] AND (screening OR "Edinburgh Postnatal Depression Scale" OR treatment OR prevention)', max: 6 },
  { id: 'pelvic-floor', label: 'Pelvic floor recovery and incontinence', stages: ['postpartum', 'menopause', 'post-menopause'], query: '("pelvic floor"[mh] OR "pelvic floor muscle training"[tiab] OR "urinary incontinence"[mh]) AND (postpartum OR women)', max: 5 },
  { id: 'postpartum-contraception', label: 'Contraception after birth', stages: ['postpartum', 'contraception'], query: '("postpartum period"[mh] OR postpartum[tiab]) AND contraception[mh]', max: 4 },
  { id: 'baby-sleep', label: 'Safe baby sleep and SIDS', stages: ['postpartum'], query: '("sudden infant death"[mh] OR "infant sleep"[tiab] OR "bed sharing"[tiab]) AND (risk OR prevention OR safe)', max: 5 },
  { id: 'infant-feeding', label: 'Infant feeding and starting solids', stages: ['postpartum'], query: '("infant formula"[mh] OR "complementary feeding"[tiab] OR "infant nutritional physiological phenomena"[mh] OR "vitamin D supplementation" infant)', max: 4 },
  { id: 'postpartum-recovery', label: 'Recovery after birth (bleeding, perineum, exercise)', stages: ['postpartum'], query: '("postpartum period"[mh] OR postnatal) AND (perineum OR "postpartum hemorrhage" OR exercise OR "diastasis recti" OR fatigue)', max: 5 },
  { id: 'postpartum-thyroid-bp', label: 'Health checks after pregnancy complications', stages: ['postpartum'], query: '(postpartum OR "after pregnancy") AND ("gestational diabetes" OR "pre-eclampsia" OR "postpartum thyroiditis") AND (follow-up OR "long-term" OR screening)', max: 3 },
  { id: 'infant-colic-crying', label: 'Baby crying and colic', stages: ['postpartum'], query: '(colic[mh] OR "infant crying"[tiab]) AND (treatment OR probiotics OR management)', max: 3 },

  // ── Contraception ──────────────────────────────────────────────
  { id: 'contraception-effectiveness', label: 'Choosing contraception', stages: ['contraception'], query: 'contraception[mh] AND (effectiveness OR "medical eligibility" OR counseling)', max: 5 },
  { id: 'combined-pill', label: 'The combined pill', stages: ['contraception'], query: '"contraceptives, oral, combined"[mh] AND (risk OR "venous thromboembolism" OR "side effects" OR benefits)', max: 5 },
  { id: 'iud-implant', label: 'IUDs, coils and implants (LARC)', stages: ['contraception'], query: '("intrauterine devices"[mh] OR "contraceptive implant"[tiab] OR "long-acting reversible contraception"[tiab])', max: 5 },
  { id: 'progestogen-only', label: 'Progestogen-only methods', stages: ['contraception'], query: '("progestin-only"[tiab] OR "progestogen-only"[tiab] OR "medroxyprogesterone acetate"[mh]) AND contraception', max: 3 },
  { id: 'emergency-contraception', label: 'Emergency contraception', stages: ['contraception'], query: '"contraception, postcoital"[mh] OR "emergency contraception"[tiab]', max: 3 },
  { id: 'contraception-mood', label: 'Hormonal contraception, mood and weight', stages: ['contraception'], query: '"hormonal contraception"[tiab] AND (depression OR mood OR "weight gain" OR libido)', max: 3 },

  // ── IVF ────────────────────────────────────────────────────────
  { id: 'ivf-outcomes', label: 'IVF success and live birth', stages: ['ivf'], query: '("fertilization in vitro"[mh] OR "assisted reproductive techniques"[mh]) AND ("live birth" OR "success rate" OR "cumulative")', max: 5 },
  { id: 'ovarian-stimulation', label: 'Ovarian stimulation and OHSS', stages: ['ivf'], query: '("ovulation induction"[mh] OR "ovarian stimulation"[tiab] OR "ovarian hyperstimulation syndrome"[mh]) AND IVF', max: 5 },
  { id: 'embryo-transfer', label: 'Embryo transfer (fresh, frozen, single)', stages: ['ivf'], query: '"embryo transfer"[mh] AND (frozen OR "single embryo" OR "freeze-all" OR "endometrial preparation")', max: 5 },
  { id: 'ivf-add-ons', label: 'IVF add-ons', stages: ['ivf'], query: '(IVF OR "assisted reproduction") AND ("add-ons" OR "endometrial scratching" OR "embryo glue" OR "time-lapse" OR "preimplantation genetic testing" OR "assisted hatching")', max: 5 },
  { id: 'iui', label: 'IUI and ovulation induction', stages: ['ivf', 'conception'], query: '("insemination, artificial"[mh] OR letrozole OR clomiphene) AND (infertility OR "ovulation induction")', max: 4 },
  { id: 'egg-freezing', label: 'Egg freezing', stages: ['ivf', 'conception'], query: '"oocyte cryopreservation"[tiab] OR ("cryopreservation"[mh] AND oocytes[mh])', max: 3 },
  { id: 'ivf-lifestyle', label: 'Lifestyle, stress and supplements during IVF', stages: ['ivf'], query: '("fertilization in vitro"[mh]) AND (acupuncture OR "body mass index" OR stress OR "psychological" OR antioxidants OR "vitamin D")', max: 4 },
  { id: 'luteal-support', label: 'Progesterone and luteal support', stages: ['ivf'], query: '"luteal phase support"[tiab] OR ("progesterone"[mh] AND "luteal phase"[mh] AND IVF)', max: 3 },

  // ── Menopause ──────────────────────────────────────────────────
  { id: 'hrt-benefits-risks', label: 'HRT benefits and risks', stages: ['menopause', 'post-menopause'], query: '("hormone replacement therapy"[mh] OR "menopausal hormone therapy"[tiab]) AND (risk OR benefits OR "breast cancer" OR cardiovascular)', max: 7 },
  { id: 'hot-flushes', label: 'Hot flushes and night sweats', stages: ['menopause'], query: '("hot flashes"[mh] OR "vasomotor symptoms"[tiab]) AND (treatment OR "non-hormonal" OR fezolinetant OR CBT)', max: 6 },
  { id: 'bone-health', label: 'Bone health and osteoporosis', stages: ['menopause', 'post-menopause'], query: '("osteoporosis, postmenopausal"[mh] OR "bone density"[mh]) AND (prevention OR treatment OR screening OR calcium OR exercise)', max: 6 },
  { id: 'menopause-sleep', label: 'Sleep in menopause', stages: ['menopause'], query: '("sleep wake disorders"[mh] OR insomnia OR sleep) AND (menopause[mh] OR perimenopause[mh])', max: 3 },
  { id: 'menopause-mood', label: 'Mood and brain fog in menopause', stages: ['menopause'], query: '(depression OR anxiety OR mood OR cognition) AND (perimenopause[mh] OR menopause[mh])', max: 4 },
  { id: 'genitourinary', label: 'Vaginal dryness and genitourinary symptoms', stages: ['menopause', 'post-menopause'], query: '("genitourinary syndrome of menopause"[tiab] OR "vaginal atrophy"[tiab] OR "vulvovaginal atrophy"[tiab]) AND (treatment OR estrogen)', max: 4 },
  { id: 'perimenopause', label: 'Perimenopause and diagnosis', stages: ['menopause'], query: '(perimenopause[mh] OR "menopausal transition"[tiab]) AND (diagnosis OR symptoms OR management OR guideline)', max: 4 },
  { id: 'premature-ovarian-insufficiency', label: 'Early menopause (POI)', stages: ['menopause', 'conception'], query: '"primary ovarian insufficiency"[mh] OR "premature ovarian insufficiency"[tiab] OR "early menopause"[tiab]', max: 3 },
  { id: 'menopause-weight-heart', label: 'Weight, heart and metabolism after menopause', stages: ['menopause', 'post-menopause'], query: '(postmenopause[mh] OR menopause[mh]) AND ("cardiovascular diseases" OR "weight gain" OR "metabolic syndrome" OR lipids)', max: 4 },

  // ── Post-menopause ─────────────────────────────────────────────
  { id: 'postmenopausal-bleeding', label: 'Bleeding after menopause', stages: ['post-menopause'], query: '"postmenopausal bleeding"[tiab] OR ("uterine hemorrhage"[mh] AND postmenopause[mh])', max: 3 },
  { id: 'healthy-ageing', label: 'Exercise, strength and healthy ageing', stages: ['post-menopause', 'menopause'], query: '(postmenopause[mh] OR "older women"[tiab]) AND ("resistance training" OR exercise OR falls OR sarcopenia)', max: 4 },
  { id: 'cardiovascular-women', label: 'Heart health in women', stages: ['post-menopause', 'general'], query: '"cardiovascular diseases"[mh] AND women AND (prevention OR "risk factors" OR "sex differences")', max: 4 },
  { id: 'colorectal-screening', label: 'Bowel cancer screening', stages: ['post-menopause', 'general'], query: '"colorectal neoplasms"[mh] AND "early detection of cancer"[mh]', max: 2 },

  // ── General women's health ─────────────────────────────────────
  { id: 'iron-deficiency', label: 'Iron deficiency in women', stages: ['general', 'menstrual-cycle'], query: '("iron deficiencies"[mh] OR "anemia, iron-deficiency"[mh] OR ferritin) AND women AND (supplementation OR diagnosis OR treatment)', max: 5 },
  { id: 'vitamin-d', label: 'Vitamin D', stages: ['general'], query: '"vitamin d"[mh] AND supplementation AND (women OR adults) AND (fracture OR deficiency OR outcomes)', max: 4 },
  { id: 'vitamin-b12', label: 'Vitamin B12', stages: ['general'], query: '"vitamin b 12 deficiency"[mh] OR ("vitamin b 12"[mh] AND (deficiency OR supplementation))', max: 3 },
  { id: 'thyroid-general', label: 'Thyroid health', stages: ['general'], query: '(hypothyroidism[mh] OR hyperthyroidism[mh] OR "subclinical hypothyroidism"[tiab]) AND (treatment OR levothyroxine OR guideline)', max: 4 },
  { id: 'cervical-screening', label: 'Cervical screening and HPV', stages: ['general'], query: '("uterine cervical neoplasms"[mh] AND ("early detection of cancer"[mh] OR "papillomavirus infections"[mh])) OR "HPV vaccination"[tiab]', max: 5 },
  { id: 'breast-health', label: 'Breast screening and breast health', stages: ['general', 'menopause', 'post-menopause'], query: '"breast neoplasms"[mh] AND (mammography[mh] OR "early detection of cancer"[mh] OR "risk reduction")', max: 5 },
  { id: 'uti', label: 'Urinary tract infections', stages: ['general'], query: '"urinary tract infections"[mh] AND women AND (prevention OR treatment OR cranberry)', max: 3 },
  { id: 'vaginal-infections', label: 'Thrush and bacterial vaginosis', stages: ['general'], query: '("vaginosis, bacterial"[mh] OR "candidiasis, vulvovaginal"[mh]) AND (treatment OR recurrence OR probiotics)', max: 3 },
  { id: 'stis', label: 'Sexual health and STIs', stages: ['general', 'contraception'], query: '("sexually transmitted diseases"[mh] OR chlamydia OR gonorrhea) AND (screening OR prevention) AND women', max: 3 },
  { id: 'migraine-hormones', label: 'Migraine and hormones', stages: ['general', 'menstrual-cycle', 'menopause'], query: '"migraine disorders"[mh] AND ("menstrual migraine" OR estrogen OR contraception OR menopause OR pregnancy)', max: 3 },
  { id: 'anxiety-depression-women', label: 'Depression and anxiety in women', stages: ['general'], query: '(depression[mh] OR "anxiety disorders"[mh]) AND women AND ("exercise" OR "cognitive behavioral therapy" OR treatment) AND guideline', max: 3 },
  { id: 'weight-diet', label: 'Healthy weight and diet', stages: ['general'], query: '(obesity[mh] OR "weight loss"[mh] OR "mediterranean diet"[tiab]) AND women AND (intervention OR guideline)', max: 3 },
  // ── Added 2026-11-22 (library growth to ~2,000) ────────────────
  { id: 'adenomyosis', label: 'Adenomyosis', stages: ['menstrual-cycle', 'conception'], query: 'adenomyosis[mh] OR adenomyosis[tiab]', max: 3 },
  { id: 'ovarian-cysts', label: 'Ovarian cysts', stages: ['menstrual-cycle', 'general'], query: '"ovarian cysts"[mh] AND (management OR diagnosis)', max: 2 },
  { id: 'hypothalamic-amenorrhoea', label: 'Missed periods from stress, low weight or sport', stages: ['menstrual-cycle'], query: '("amenorrhea, hypothalamic"[tiab] OR "functional hypothalamic amenorrhea"[tiab] OR "relative energy deficiency in sport"[tiab] OR "female athlete triad"[mh])', max: 3 },
  { id: 'recurrent-miscarriage', label: 'Recurrent miscarriage', stages: ['conception', 'pregnancy'], query: '"abortion, habitual"[mh] OR "recurrent pregnancy loss"[tiab]', max: 4 },
  { id: 'ectopic-pregnancy', label: 'Ectopic pregnancy', stages: ['pregnancy', 'conception'], query: '"pregnancy, ectopic"[mh] AND (management OR diagnosis OR methotrexate)', max: 2 },
  { id: 'unexplained-infertility', label: 'Unexplained infertility', stages: ['conception', 'ivf'], query: '"unexplained infertility"[tiab] AND (treatment OR management)', max: 3 },
  { id: 'omega3-pregnancy', label: 'Omega-3 and fish in pregnancy', stages: ['pregnancy'], query: '("fatty acids, omega-3"[mh] OR "fish oil"[tiab] OR DHA[tiab]) AND pregnancy', max: 3 },
  { id: 'iodine-supplements-pregnancy', label: 'Iodine and pregnancy vitamins', stages: ['pregnancy', 'conception'], query: '(iodine[mh] OR "multiple micronutrient"[tiab] OR "prenatal vitamins"[tiab]) AND (pregnancy OR pregnant)', max: 3 },
  { id: 'heartburn-constipation-pregnancy', label: 'Heartburn, constipation and haemorrhoids in pregnancy', stages: ['pregnancy'], query: '(heartburn[mh] OR "gastroesophageal reflux"[mh] OR constipation[mh] OR hemorrhoids[mh]) AND pregnancy', max: 3 },
  { id: 'back-pelvic-pain-pregnancy', label: 'Back and pelvic girdle pain in pregnancy', stages: ['pregnancy', 'postpartum'], query: '("low back pain"[mh] OR "pelvic girdle pain"[mh] OR "pelvic girdle pain"[tiab]) AND pregnancy', max: 3 },
  { id: 'hypertension-pregnancy', label: 'High blood pressure in pregnancy', stages: ['pregnancy', 'postpartum'], query: '"hypertension, pregnancy-induced"[mh] AND (treatment OR antihypertensive OR management)', max: 4 },
  { id: 'twins-multiple', label: 'Twin pregnancy', stages: ['pregnancy', 'ivf'], query: '"pregnancy, twin"[mh] AND (outcomes OR management OR guideline)', max: 2 },
  { id: 'pain-relief-labour', label: 'Pain relief in labour', stages: ['pregnancy'], query: '("analgesia, obstetrical"[mh] OR "labor pain"[mh] OR epidural[tiab]) AND labour', max: 4 },
  { id: 'perineal-tears', label: 'Perineal tears and recovery', stages: ['pregnancy', 'postpartum'], query: '(perineum[mh] AND (laceration OR tear OR massage)) OR "obstetric anal sphincter injuries"[tiab] OR episiotomy[mh]', max: 3 },
  { id: 'birth-after-caesarean', label: 'Birth after a caesarean (VBAC)', stages: ['pregnancy'], query: '"vaginal birth after cesarean"[mh] OR VBAC[tiab]', max: 2 },
  { id: 'postpartum-haemorrhage', label: 'Bleeding after birth', stages: ['postpartum', 'pregnancy'], query: '"postpartum hemorrhage"[mh] AND (prevention OR treatment OR tranexamic)', max: 3 },
  { id: 'postpartum-exercise-weight', label: 'Exercise and weight after birth', stages: ['postpartum'], query: '(exercise[mh] OR "weight loss"[mh] OR "diastasis recti"[tiab]) AND (postpartum OR postnatal)', max: 3 },
  { id: 'postpartum-sleep-fatigue', label: 'Sleep and tiredness after birth', stages: ['postpartum'], query: '(sleep[mh] OR fatigue[mh]) AND (postpartum OR postnatal) AND (mothers OR women)', max: 3 },
  { id: 'medicines-breastfeeding', label: 'Medicines while breastfeeding', stages: ['postpartum'], query: '"lactation"[mh] AND ("drug safety" OR "breast milk" OR medications OR antidepressants)', max: 3 },
  { id: 'infant-vitamins-growth', label: 'Baby vitamins, growth and solids', stages: ['postpartum'], query: '("infant nutritional physiological phenomena"[mh] OR "complementary feeding"[tiab] OR "vitamin d"[tiab]) AND infant AND (guideline OR supplementation)', max: 3 },
  { id: 'menopause-non-hormonal', label: 'Non-hormonal treatment for menopause symptoms', stages: ['menopause', 'post-menopause'], query: '(fezolinetant OR SSRI OR gabapentin OR "cognitive behavioral therapy" OR acupuncture OR phytoestrogens) AND (menopause OR "hot flashes")', max: 5 },
  { id: 'menopause-cognition-joints', label: 'Memory, joints and skin at menopause', stages: ['menopause', 'post-menopause'], query: '(cognition[mh] OR arthralgia[mh] OR "skin aging"[mh]) AND menopause', max: 3 },
  { id: 'urinary-incontinence', label: 'Bladder leaks (urinary incontinence)', stages: ['general', 'postpartum', 'menopause', 'post-menopause'], query: '"urinary incontinence"[mh] AND women AND (treatment OR "pelvic floor muscle training")', max: 4 },
  { id: 'pelvic-organ-prolapse', label: 'Pelvic organ prolapse', stages: ['postpartum', 'menopause', 'post-menopause'], query: '"pelvic organ prolapse"[mh] AND (pessary OR treatment OR "pelvic floor")', max: 3 },
  { id: 'autoimmune-women', label: 'Autoimmune conditions and pregnancy', stages: ['general', 'pregnancy', 'conception'], query: '("lupus erythematosus, systemic"[mh] OR "arthritis, rheumatoid"[mh] OR "multiple sclerosis"[mh] OR "celiac disease"[mh]) AND (pregnancy OR women)', max: 4 },
  { id: 'sleep-insomnia-women', label: 'Sleep and insomnia in women', stages: ['general'], query: '"sleep initiation and maintenance disorders"[mh] AND women AND (treatment OR "cognitive behavioral therapy")', max: 3 },
  { id: 'sexual-health-libido', label: 'Low sex drive and painful sex', stages: ['general', 'menopause', 'postpartum'], query: '("sexual dysfunctions, psychological"[mh] OR dyspareunia[mh] OR "hypoactive sexual desire"[tiab]) AND women', max: 3 },
  { id: 'osteoporosis-treatment', label: 'Osteoporosis treatment', stages: ['post-menopause', 'menopause'], query: '"osteoporosis, postmenopausal"[mh] AND (bisphosphonates OR denosumab OR treatment)', max: 3 },
  { id: 'skin-hair-hormones', label: 'Acne and hair changes linked to hormones', stages: ['menstrual-cycle', 'general'], query: '(acne vulgaris[mh] OR hirsutism[mh] OR alopecia[mh]) AND women AND (hormonal OR treatment)', max: 3 },
  { id: 'physical-activity-women', label: 'Physical activity for women', stages: ['general'], query: '(exercise[mh] OR "physical activity"[tiab]) AND women AND (guideline OR "all-cause mortality" OR "mental health")', max: 3 },

  // ── Added 2026-11-24 (gaps found by scripts/research/citation-audit.mjs:
  //    0-1 relevant sources for the question; not built yet) ───────────
  { id: 'travel-pregnancy', label: 'Flying and travel in pregnancy', stages: ['pregnancy'], query: '("air travel"[mh] OR "air travel"[tiab] OR travel[mh] OR flying[tiab] OR "long-haul"[tiab] OR "travel medicine"[mh]) AND pregnancy[mh]', max: 3 },
  { id: 'ivf-cumulative-success', label: 'How many IVF cycles it takes', stages: ['ivf', 'conception'], query: '("fertilization in vitro"[mh] OR "assisted reproductive techniques"[mh]) AND ("cumulative live birth"[tiab] OR "cumulative pregnancy"[tiab] OR "number of cycles"[tiab] OR "repeated cycles"[tiab] OR "treatment discontinuation"[tiab])', max: 3 },
  { id: 'menopause-joint-pain', label: 'Joint and muscle aches at menopause', stages: ['menopause', 'post-menopause'], query: '(arthralgia[mh] OR "joint pain"[tiab] OR "musculoskeletal pain"[tiab] OR "musculoskeletal symptoms"[tiab] OR osteoarthritis[mh]) AND (menopause[mh] OR perimenopause[mh] OR menopaus*[tiab]) NOT "aromatase inhibitors"[mh]', max: 3 },

  // ── Added 2026-11-24, round 2 (borderline gaps: the broad topic existed
  //    but the specific question had few direct sources) ──────────────
  { id: 'partner-lifestyle-fertility', label: "Partner's drinking, smoking and fertility", stages: ['conception', 'ivf'], query: '("alcohol drinking"[mh] OR alcohol[tiab] OR smoking[mh] OR "tobacco use"[mh] OR cigarette*[tiab] OR "recreational drug*"[tiab] OR cannabis[tiab]) AND ("semen analysis"[mh] OR "sperm count"[mh] OR "semen quality"[tiab] OR "sperm quality"[tiab] OR "infertility, male"[mh] OR "male fertility"[tiab] OR "paternal smoking"[tiab] OR "paternal alcohol"[tiab] OR "male partner"[tiab])', max: 3 },
  { id: 'aspirin-pregnancy', label: 'Low-dose aspirin in pregnancy', stages: ['pregnancy', 'conception'], query: '(aspirin[mh] OR "low-dose aspirin"[tiab]) AND (pregnancy[mh] OR "pre-eclampsia"[mh] OR "fetal growth retardation"[mh] OR "abortion, habitual"[mh])', max: 3 },
  { id: 'pmdd-treatment', label: 'Treating PMDD', stages: ['menstrual-cycle'], query: '("premenstrual dysphoric disorder"[mh] OR "premenstrual dysphoric disorder"[tiab] OR PMDD[tiab]) AND ("serotonin uptake inhibitors"[mh] OR SSRI*[tiab] OR "contraceptives, oral"[mh] OR drospirenone[tiab] OR "cognitive behavioral therapy"[mh] OR therapy[sh] OR treatment[tiab])', max: 3 },
  { id: 'ovulation-tests', label: 'Ovulation tests and timing sex', stages: ['conception', 'menstrual-cycle'], query: '("ovulation detection"[mh] OR "ovulation prediction"[tiab] OR "ovulation test*"[tiab] OR "ovulation predictor*"[tiab] OR "ovulation kit*"[tiab] OR "urinary LH"[tiab] OR "urinary luteinizing hormone"[tiab] OR "LH surge"[tiab] OR "timed intercourse"[ti] OR "fertile window"[tiab]) NOT ("embryo transfer"[tiab] OR "precocious puberty"[tiab] OR letrozole[tiab] OR clomiphene[tiab] OR IVF[tiab])', max: 2 },
  { id: 'paracetamol-pregnancy', label: 'Paracetamol (acetaminophen) in pregnancy', stages: ['pregnancy'], query: '(acetaminophen[mh] OR paracetamol[tiab] OR acetaminophen[tiab]) AND ("prenatal exposure delayed effects"[mh] OR "prenatal exposure"[tiab] OR "during pregnancy"[tiab] OR "in pregnancy"[tiab] OR "pregnant women"[tiab]) NOT (cesarean[tiab] OR caesarean[tiab] OR postoperative[tiab])', max: 3 },

  // ── Added 2026-11-24, round 3 (named-medicine gaps: codeine while
  //    breastfeeding and ibuprofen in pregnancy had no drug-specific
  //    sources). Drug words are searched in the title so the MeSH
  //    explosions (opioid withdrawal in newborns, NSAIDs for tocolysis or a
  //    baby's ductus) stay out. Built with --only. ─────────────────────────
  { id: 'codeine-breastfeeding', label: 'Codeine and opioid painkillers while breastfeeding', stages: ['postpartum'], query: '(codeine[ti] OR opioid*[ti] OR tramadol[ti] OR oxycodone[ti] OR morphine[ti] OR analgesi*[ti] OR "pain relief"[ti]) AND (breastfeeding[tiab] OR "breast feeding"[mh] OR lactation[tiab] OR lactating[tiab] OR "breast milk"[tiab] OR "human milk"[tiab]) NOT ("neonatal abstinence"[ti] OR withdrawal[ti] OR "procedural pain"[ti] OR neonates[ti] OR newborn*[ti] OR infants[ti] OR sucrose[ti] OR glucose[ti] OR "heel prick"[ti] OR "milk odor"[ti])', max: 3 },
  { id: 'nsaids-pregnancy', label: 'Ibuprofen and NSAID painkillers in pregnancy', stages: ['pregnancy', 'conception'], query: '(ibuprofen[ti] OR NSAID*[ti] OR "non-steroidal anti-inflammatory"[ti] OR "nonsteroidal anti-inflammatory"[ti] OR diclofenac[ti] OR naproxen[ti] OR analgesic*[ti] OR "pain medication"[ti] OR "pain relievers"[ti]) AND (pregnan*[tiab] OR "prenatal exposure"[tiab] OR "in utero"[tiab] OR miscarriage[tiab]) NOT (ductus[tiab] OR tocoly*[tiab] OR "preterm labor"[tiab] OR "preterm labour"[tiab] OR abortion[ti] OR postpartum[ti] OR perineal[ti] OR cesarean[ti] OR caesarean[ti] OR labour[ti] OR labor[ti] OR "non-pregnant"[ti] OR intraepithelial[ti])', max: 3 },
  { id: 'antihistamines-pregnancy', label: 'Antihistamines and hay fever in pregnancy', stages: ['pregnancy'], query: '(antihistamine*[tiab] OR "histamine h1 antagonists"[mh] OR cetirizine[tiab] OR loratadine[tiab] OR "allergic rhinitis"[tiab] OR "hay fever"[tiab]) AND (pregnan*[ti] OR "during pregnancy"[tiab] OR "pregnant women"[tiab]) NOT (offspring[ti] OR children[ti] OR infants[ti] OR infant[ti] OR childhood[ti] OR progeny[ti] OR pediatric[ti] OR caesarean[ti] OR cesarean[ti] OR nausea[ti] OR hyperemesis[ti])', max: 1 },
];

/** Famous trials included by name. Search -> fetch -> title check. */
export const LANDMARKS = [
  { id: 'whi-2002', topic: 'hrt-benefits-risks', stages: ['menopause', 'post-menopause'], query: 'Risks[ti] AND benefits[ti] AND estrogen[ti] AND progestin[ti] AND healthy[ti] AND 2002[dp]', mustInclude: 'risks and benefits of estrogen plus progestin in healthy postmenopausal women' },
  { id: 'mrc-vitamin-1991', topic: 'folic-acid', stages: ['conception', 'pregnancy'], query: 'neural[ti] AND tube[ti] AND "Medical Research Council Vitamin Study"[ti]', mustInclude: 'medical research council vitamin study' },
  { id: 'aspre-2017', topic: 'pre-eclampsia', stages: ['pregnancy'], query: 'Aspirin[ti] AND Placebo[ti] AND Preterm[ti] AND Preeclampsia[ti] AND 2017[dp] AND "N Engl J Med"[ta]', mustInclude: 'aspirin versus placebo in pregnancies at high risk for preterm preeclampsia' },
  { id: 'arrive-2018', topic: 'labour-birth', stages: ['pregnancy'], query: 'Labor[ti] AND Induction[ti] AND Expectant[ti] AND Nulliparous[ti] AND 2018[dp] AND "N Engl J Med"[ta]', mustInclude: 'labor induction versus expectant management in low-risk nulliparous women' },
  { id: 'whi-calcium-vitd-2006', topic: 'bone-health', stages: ['menopause', 'post-menopause'], query: 'Calcium[ti] AND vitamin D[ti] AND fractures[ti] AND 2006[dp] AND "N Engl J Med"[ta]', mustInclude: 'calcium plus vitamin d supplementation and the risk of fractures' },
  { id: 'hapo-2008', topic: 'gestational-diabetes', stages: ['pregnancy'], query: '"Hyperglycemia and adverse pregnancy outcomes"[ti] AND "N Engl J Med"[ta]', mustInclude: 'hyperglycemia and adverse pregnancy outcomes' },
];
