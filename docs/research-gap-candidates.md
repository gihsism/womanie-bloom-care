# Candidate sources for the 10 library gaps

Companion to `docs/research-gaps.md`. For each of the top 10 gaps, 1-4
authoritative, freely readable sources, found by web search and read on
2026-11-26. **None of them is in `library.json`.** Adding them needs a paid
summarise run of `scripts/research/build-library.mjs` and the founder's OK
(see "Cost to add" at the end).

The key points below were written from the pages themselves. They are
working notes for choosing sources, not library summaries: the build
writes those from the PubMed abstract.

Column "Pipeline" says whether the existing build can take the source:
**yes** = PubMed record from 2015 on with an abstract; **landmark** = PubMed
record before 2015, which can only enter as a `LANDMARKS` entry in
`topics.mjs`; **no** = a web page without a PMID. The build cannot take
these today: it would need a new "web source" path, which is engineering
work, not API spend.

Newer versions than the gap list names: NICE CG156 was replaced by
**NICE NG257** (31 March 2026); the ASRM amenorrhoea opinion of 2008 was
replaced in **2024**; the ASRM fertility-evaluation opinion has a new
version of **October 2026** (PMID 42901815, abstract only).

---

## 1. Ibuprofen and other painkillers while breastfeeding (High)

| Source | Publisher, year | PMID | Pipeline |
|---|---|---|---|
| [ABM Clinical Protocol #15: Analgesia and Anesthesia for the Breastfeeding Mother, revised 2017](https://www.e-Lactancia.org/media/papers/AnalgesiaAnestesiaBM-ABMProtocol15-BFM2017.pdf) | Academy of Breastfeeding Medicine, *Breastfeed Med* 2017 | 29624435 | yes |
| [LactMed: Ibuprofen](https://www.ncbi.nlm.nih.gov/books/NBK500986/) | NLM / NIH, revised Aug 2025 | 30000045 (Bookshelf) | check abstract |
| [LactMed: Acetaminophen](https://www.ncbi.nlm.nih.gov/books/NBK501194/) | NLM / NIH | none found | no |
| [NHS: Ibuprofen, pregnancy, breastfeeding and fertility](https://www.nhs.uk/medicines/ibuprofen-for-adults/pregnancy-breastfeeding-and-fertility-while-taking-ibuprofen/) | NHS, reviewed Aug 2025 | none | no |

Why: the library has only codeine as a lactation-specific painkiller topic.
The ABM protocol covers NSAIDs, paracetamol and opioids; LactMed is the
standard drug-by-drug reference.

Key points (ABM #15):
- NSAIDs are generally safe while breastfeeding, very little passes into milk; ibuprofen is described as ideal.
- Avoid NSAIDs if the baby has a duct-dependent heart condition; naproxen is fine for short use, long courses upset some babies.
- Paracetamol: the baby gets at most about 2% of the mother's dose.
- Opioids are the main concern (sleepiness, breathing pauses in the baby): shortest reasonable course; the FDA advised against codeine in 2017.

Key points (LactMed ibuprofen and acetaminophen):
- Ibuprofen is a preferred painkiller for nursing mothers: milk levels are extremely low, it clears quickly.
- Across 13 women the baby received under 0.38% of the mother's weight-adjusted dose.
- Paracetamol is "a good choice"; after 1 g the baby gets about 1.1% (at most 1.8%) of the mother's weight-adjusted dose.
- Side effects in breastfed babies are rare for both.

## 2. How long it normally takes to get pregnant (High)

| Source | Publisher, year | PMID | Pipeline |
|---|---|---|---|
| [NICE NG257 Fertility problems, 1.4 Chance of conception](https://www.nice.org.uk/guidance/ng257/chapter/initial-advice-to-people-concerned-about-delays-in-conception) | NICE, 2026 | none | no |
| [Wesselink et al. Age and fecundability in a North American preconception cohort](https://pubmed.ncbi.nlm.nih.gov/28917614/) | *Am J Obstet Gynecol* 2017 | 28917614 | yes |
| [Gnoth et al. Time to pregnancy: German prospective study](https://pubmed.ncbi.nlm.nih.gov/12923157/) | *Hum Reprod* 2003 | 12923157 | landmark |

Why: the library has timing and lifestyle studies but no figures for the
normal time to pregnancy.

Key points:
- NICE: over 80% of couples conceive within 1 year (woman under 40, regular sex); over 90% within 2 years.
- NICE (by age, within 1 / 2 years): 19-26: 92% / 98%; 30-34: 86% / 94%; 35-39: 82% / 90%.
- Wesselink: pregnant within 6 cycles fell from 62% (age 28-30) to 28% (40-45); within 12 cycles from 79% (25-27) to 56% (40-45).
- Wesselink: chance per cycle relative to age 21-24 was 0.60 at 37-39 and 0.40 at 40-45; the male partner's age mattered little.
- Gnoth (timed intercourse): 38%, 68%, 81% and 92% pregnant after 1, 3, 6 and 12 cycles.

## 3. When to see a fertility doctor (High)

| Source | Publisher, year | PMID | Pipeline |
|---|---|---|---|
| [ASRM: Definition of infertility, committee opinion](https://www.asrm.org/practice-guidance/practice-committee-documents/definition-of-infertility/) | ASRM, *Fertil Steril* 2023 | 40991339 | yes |
| [ASRM: Fertility evaluation of infertile women (2021)](https://www.asrm.org/practice-guidance/practice-committee-documents/fertility-evaluation-of-infertile-women-a-committee-opinion-2021/) | ASRM, 2021 (new version Oct 2026, PMID 42901815) | 34607703 | yes (take the 2026 one) |
| [NICE NG257, 1.16 Defining infertility and initial assessment](https://www.nice.org.uk/guidance/ng257/chapter/defining-infertility-and-initial-assessment) | NICE, 2026 | none | no |

Why: nothing in the library covers when and how the woman is assessed.

Key points:
- ASRM: start tests after 12 months of trying under 35, after 6 months at 35 or over; over 40, test and treat sooner.
- ASRM: test straight away with known risk factors (irregular or absent periods, endometriosis or tubal disease, past chemotherapy, suspected male factor).
- ASRM: assess the male partner at the same time, with at least one semen analysis.
- NICE: tests after 1 year of unprotected sex; refer at once if the woman is 36 or over or a cause is known; a miscarriage in that year does not restart the clock.

## 4. Which contraception is most effective (High)

| Source | Publisher, year | PMID | Pipeline |
|---|---|---|---|
| [WHO Family Planning Global Handbook 2022, Appendix A](https://cdn.who.int/media/docs/default-source/reproductive-health/contraception-family-planning/family-planning-a-global-handbook-for-providers-2022.pdf) | WHO / JHU, 2022 | none | no |
| [CDC: Contraception and birth control methods](https://www.cdc.gov/contraception/about/index.html) | CDC, 2024 | none | no |
| [US MEC for Contraceptive Use, 2024](https://pubmed.ncbi.nlm.nih.gov/39106314/) | CDC, *MMWR Recomm Rep* 2024 | 39106314 | yes |

Why: the library has eligibility rules (2016 MEC) but no typical- vs
perfect-use failure table. The 2024 MEC replaces the 2016 updates.

Key points (pregnancies per 100 women in year 1, perfect vs typical use, WHO):
- Implant 0.1 vs 0.1; hormonal IUD 0.5 vs 0.7; copper IUD 0.6 vs 0.8; female sterilisation 0.5 vs 0.5.
- Injectable 0.2 vs 4; pill, patch and ring 0.3 vs 7.
- Male condom 2 vs 13; withdrawal 4 vs 20; fertility awareness 3-5 vs 12-23; no method 85.
- CDC typical-use rates agree (implant 0.1%, pill 7%, condom 13%).
- MEC 2024: replaces 2016; revises advice for breastfeeding, postpartum, obesity and clotting conditions.

## 5. Birth spacing after a birth (Medium)

| Source | Publisher, year | PMID | Pipeline |
|---|---|---|---|
| [ACOG/SMFM Obstetric Care Consensus No. 8: Interpregnancy care](https://journals.lww.com/greenjournal/fulltext/10.1097/aog.0000000000003025~obstetric-care-consensus-no-8-interpregnancy-care) | *Obstet Gynecol* 2019 | 30575677 | yes |
| [Report of a WHO Technical Consultation on Birth Spacing](https://www.who.int/publications/i/item/WHO-RHR-07.1) | WHO, 2007 | none | no |
| [Conde-Agudelo et al. Birth spacing and adverse perinatal outcomes: meta-analysis](https://pubmed.ncbi.nlm.nih.gov/16622143/) | *JAMA* 2006 | 16622143 | landmark |

Key points:
- ACOG: avoid a new pregnancy within 6 months of a birth; discuss risks and benefits before 18 months.
- ACOG: after a caesarean, a birth interval of 18-24 months or less raises the risk of uterine rupture.
- WHO: wait at least 24 months after a live birth before trying again, and at least 6 months after a miscarriage or abortion.
- Conde-Agudelo: compared with 18-23 months, an interval under 6 months raised the odds of preterm birth (1.40) and low birth weight (1.61).
- Both: very long intervals (over 5 years) also carry some risk.

## 6. Periods stopped, not pregnant: secondary amenorrhoea work-up (Medium)

| Source | Publisher, year | PMID | Pipeline |
|---|---|---|---|
| [ASRM: Current evaluation of amenorrhea, committee opinion](https://www.asrm.org/practice-guidance/practice-committee-documents/current-evaluation-of-amenorrhea/) | ASRM, *Fertil Steril* 2024 | 38456861 | yes |
| [NICE CKS: Amenorrhoea](https://cks.nice.org.uk/topics/amenorrhoea/) | NICE, revised Feb 2024 | none | no |

Key points:
- NICE: secondary amenorrhoea = no periods for 3 cycles or 6 months or more.
- Common causes: PCOS, functional hypothalamic amenorrhoea (stress, weight, exercise), premature ovarian insufficiency, high prolactin.
- ASRM: rule out pregnancy first, then FSH, LH, oestradiol, prolactin and TSH.
- NICE: refer if FSH/LH are raised under 40, after recent uterine surgery, or if an eating disorder is suspected.

## 7. What a normal period is (Medium)

| Source | Publisher, year | PMID | Pipeline |
|---|---|---|---|
| [Munro et al. The two FIGO systems for normal and abnormal uterine bleeding, 2018 revisions](https://obgyn.onlinelibrary.wiley.com/doi/full/10.1002/ijgo.12666) | FIGO, *Int J Gynaecol Obstet* 2018 | 30198563 | yes |
| [ACOG Committee Opinion 651: Menstruation as a vital sign](https://journals.lww.com/greenjournal/fulltext/10.1097/aog.0000000000001215~committee-opinion-no-651-menstruation-in-girls-and) | ACOG, 2015 | 26595586 | yes |
| [NHS: Periods](https://www.nhs.uk/conditions/periods/) | NHS, reviewed Jan 2023 | none | no |

Key points:
- FIGO: a normal cycle is 24-38 days; bleeding lasts up to 8 days.
- FIGO: regular = shortest and longest cycle differ by 7-9 days or less, depending on age.
- FIGO: heavy bleeding is defined by its impact on quality of life, not by a measured volume.
- ACOG: average loss is about 30 mL; over 80 mL is linked to anaemia; changing a pad every 1-2 hours is too heavy.
- NHS: cycles of 21-35 days and 2-7 days of bleeding are common.

## 8. Antibiotics for a symptomatic UTI in pregnancy (Medium)

| Source | Publisher, year | PMID | Pipeline |
|---|---|---|---|
| [ACOG Committee Opinion 717: Sulfonamides, nitrofurantoin and birth defects](https://pubmed.ncbi.nlm.nih.gov/28832488/) | ACOG, *Obstet Gynecol* 2017 | 28832488 | yes |
| [NICE NG109 UTI (lower): antimicrobial prescribing](https://www.nice.org.uk/guidance/ng109/chapter/Recommendations) | NICE, 2018 | none | no |
| [NICE NG111 Pyelonephritis (acute): antimicrobial prescribing](https://www.nice.org.uk/guidance/ng111/chapter/Recommendations) | NICE, 2018 | none | no |

Key points:
- NICE: always treat a UTI in pregnancy at once, after sending a urine culture.
- NICE first choice: nitrofurantoin 100 mg modified-release twice daily for 7 days; avoid at term (risk of neonatal haemolysis).
- NICE second choice: amoxicillin (only if the culture shows it works) or cefalexin, each for 7 days; cefalexin is first choice for a kidney infection.
- ACOG: in the 2nd and 3rd trimester nitrofurantoin and sulfonamides can stay first-line; in the 1st trimester they are appropriate when no suitable alternative exists.
- ACOG: never leave a UTI in pregnancy untreated.

## 9. Returning to exercise after a caesarean (Medium)

| Source | Publisher, year | PMID | Pipeline |
|---|---|---|---|
| [Goom, Donnelly, Brockwell. Returning to running postnatal: guidelines](https://absolute.physio/wp-content/uploads/2019/09/returning-to-running-postnatal-guidelines.pdf) | 2019 (BJSM infographic PMID 32376675) | none for the guideline | no (infographic: check abstract) |
| [NHS: Caesarean section, recovery](https://www.nhs.uk/conditions/caesarean-section/recovery/) | NHS, reviewed Jan 2023 | none | no |

Key points:
- Goom: low-impact exercise for the first 3 months; return to running from 3-6 months at the earliest.
- Goom: delay running if there is leaking, heaviness or bulging, bleeding or pain; offer a pelvic-health check from 6 weeks.
- Goom: after a caesarean the abdominal wall has about 51-59% of its strength at 6 weeks.
- NHS: walk daily; exercise, lifting and driving may be uncomfortable for about 6 weeks, restart when they do not hurt.

## 10. IVF success rates by age (Medium)

| Source | Publisher, year | PMID | Pipeline |
|---|---|---|---|
| [HFEA: Fertility treatment 2024, trends and figures](https://www.hfea.gov.uk/about-us/publications/research-and-data/fertility-treatment-2024-trends-and-figures) | HFEA (UK regulator), June 2026 | none | no |
| [CDC National ART Surveillance: 2023 success rates](https://www.cdc.gov/art/success-rates/index.html) | CDC, Nov 2026 | none | no |

Key points:
- HFEA: average IVF birth rate 30% per embryo transferred; 38% at 18-34, 8% at 43-44 (2024 figures are provisional).
- HFEA: 84% of transfers used one embryo; multiple births 3.2%.
- CDC 2023 (own eggs, live birth per planned egg collection): under 35: 49%; 35-37: 36%; 38-40: 22%; over 40: 8%.
- CDC: comparing clinics may mislead because they treat different patients.

Registry figures are exactly what this gap needs, but neither registry is on
PubMed. Options: a web-source path in the build, or a short hand-written
"registry figures" note shown with its link.

---

## Cost to add

From `scripts/research/build-library.mjs`: `BUDGET_USD` defaults to **$28**
per run (a spend cap, not a cost). Summaries use `claude-sonnet-5-5` priced
in the script at **$2 / $10 per million input / output tokens**. One record
sends the ~16 KB system prompt (~4,000 tokens) plus title and abstract
(~500), and gets back ~600-900 tokens of JSON. That is about
**$0.02 per new item**. Cached summaries (3,033 in the main repo's
`scripts/research/.cache/`) are not paid for again.

| What | Items | Estimated cost |
|---|---|---|
| PubMed-ready candidates (marked "yes": 29624435, 28917614, 40991339, 42901815, 39106314, 30575677, 38456861, 30198563, 26595586, 28832488) | 10 | about $0.20 |
| Plus the two pre-2015 landmarks (12923157, 16622143) | 2 | about $0.04 |
| **Total** | **12** | **about $0.25** (under $1 even with retries) |

How they would go in:
- **PubMed-ready candidates:** a new topic per gap whose query names the PMIDs, run with `--only <topic ids>`. Only those records are fetched and summarised.
- **Landmarks:** `--only` skips landmarks, so they need a full run. A full run with the caches still costs only the new records, but it also re-runs every topic search. Any record that appeared on PubMed since 24 Nov would be summarised and paid for as well.
- **Afterwards:** re-run `node scripts/research/embed-library.mjs`. It runs offline at no cost and takes about 8 minutes.

The 15 web-only pages (marked "no": NICE, NICE CKS, NHS, CDC, WHO, HFEA,
LactMed acetaminophen, Goom) cannot be added with the existing pipeline at
any cost. LactMed ibuprofen (PMID 30000045) and the BJSM running infographic
(PMID 32376675) can go in only if their PubMed records carry an abstract.
