// Candidate guideline pages for scripts/research/guideline-pages.mjs.
// From docs/research-gap-candidates.md. Stages, topics, tags and keywords
// are curation (the free extractive summariser cannot infer them); the
// paid summariser may add tags/keywords on top.
//
// Gap questions (search-eval.ts AUDIT_QUESTIONS, gap: true):
//   1. "How long does it usually take to get pregnant?"
//   2. "When should we see a fertility doctor if we're not getting pregnant?"
//   3. "Is ibuprofen safe while breastfeeding?"
// The NICE NG257 pages listed for 1 and 2 need a NICE licence (see
// PUBLISHERS in api/_lib/research/guideline-page.ts), so they are listed
// here only to show the block; the NHS infertility page (OGL) stands in.

export const GAP_QUESTIONS = [
  { q: 'How long does it usually take to get pregnant?', stage: 'conception' },
  { q: "When should we see a fertility doctor if we're not getting pregnant?", stage: 'conception' },
  { q: 'Is ibuprofen safe while breastfeeding?', stage: 'postpartum' },
];

export const PAGES = [
  {
    url: 'https://www.nhs.uk/medicines/ibuprofen-for-adults/pregnancy-breastfeeding-and-fertility-while-taking-ibuprofen/',
    lifeStages: ['postpartum', 'pregnancy', 'conception'],
    topics: ['medicines-breastfeeding', 'nsaids-pregnancy'],
    tags: ['ibuprofen', 'breastfeeding', 'painkillers', 'nsaids'],
    keywords: ['ibuprofen', 'nurofen', 'advil', 'breastfeeding', 'nursing', 'painkiller', 'pain relief', 'lactation', 'nsaid'],
  },
  {
    url: 'https://www.ncbi.nlm.nih.gov/books/NBK500986/',
    hold: 'NCBI answered with a reCAPTCHA bot challenge on 2026-11-26 (not bypassed). Use the NLM LactMed bulk download or E-utilities instead of page scraping.',
    lifeStages: ['postpartum'],
    topics: ['medicines-breastfeeding'],
    tags: ['ibuprofen', 'breastfeeding', 'lactation', 'nsaids'],
    keywords: ['ibuprofen', 'nurofen', 'advil', 'breastfeeding', 'breast milk', 'nursing', 'painkiller', 'lactation', 'nsaid'],
  },
  {
    url: 'https://www.ncbi.nlm.nih.gov/books/NBK501194/',
    hold: 'NCBI answered with a reCAPTCHA bot challenge on 2026-11-26 (not bypassed). Use the NLM LactMed bulk download or E-utilities instead of page scraping.',
    lifeStages: ['postpartum'],
    topics: ['medicines-breastfeeding'],
    tags: ['paracetamol', 'acetaminophen', 'breastfeeding', 'lactation'],
    keywords: ['paracetamol', 'acetaminophen', 'tylenol', 'panadol', 'breastfeeding', 'breast milk', 'painkiller', 'lactation'],
  },
  {
    url: 'https://www.nhs.uk/conditions/infertility/',
    lifeStages: ['conception'],
    topics: ['infertility-evaluation', 'age-fertility'],
    tags: ['infertility', 'time to pregnancy', 'when to see a doctor', 'fertility tests'],
    keywords: ['infertility', 'trying to conceive', 'getting pregnant', 'how long', 'fertility doctor', 'gp', 'fertility tests', 'conceive', 'not getting pregnant'],
  },
  {
    url: 'https://www.cdc.gov/contraception/about/index.html',
    lifeStages: ['contraception'],
    topics: ['contraception-effectiveness'],
    tags: ['contraception', 'effectiveness', 'typical use', 'birth control'],
    keywords: ['contraception', 'birth control', 'most effective', 'implant', 'iud', 'coil', 'pill', 'condom', 'failure rate'],
  },
  // Blocked by licence (never fetched): shows the policy at work.
  {
    url: 'https://www.nice.org.uk/guidance/ng257/chapter/initial-advice-to-people-concerned-about-delays-in-conception',
    lifeStages: ['conception'],
    topics: ['age-fertility'],
    tags: ['time to pregnancy'],
    keywords: ['how long', 'getting pregnant'],
  },
];
