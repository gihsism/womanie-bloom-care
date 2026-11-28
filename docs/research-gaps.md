# Research library gaps

From the citation-accuracy audit of November 2026 (library of 2,507 items,
40 everyday questions, listed in `api/_lib/research/search-eval.ts` as
`AUDIT_QUESTIONS`). A gap means the library holds **no source that answers
the question as asked**. The chat then either cites sources that are only
nearby, or (better) says the research it has does not cover the question.
Gaps are listed here for the next library build. This audit did not buy or
add any items.

How to read the priority: **High** = a common question where the chat
currently leans on sources that are only nearby. **Medium** = the chat finds
related evidence, but no source gives the direct answer. **Low** = a source
exists but is old or narrow.

## Gaps (top 10 first)

| # | Topic / question | What the library has instead | What would close it | Priority |
|---|---|---|---|---|
| 1 | **Ibuprofen and other painkillers while breastfeeding** ("Is ibuprofen safe while breastfeeding?") | NSAIDs for perineal pain after birth (efficacy, not passage into milk), EULAR antirheumatic-drug guidance. The only lactation-specific painkiller topic is codeine. | A lactation-safety review or guideline covering NSAIDs and paracetamol (e.g. the ABM analgesia protocol, LactMed-based reviews). | High |
| 2 | **How long it normally takes to get pregnant** (chance per cycle, % pregnant within 6 and 12 months) | Timed intercourse, fertility awareness, BMI and fecundability, pollutants and fecundability. | A cohort review or guideline on time to pregnancy by age (fecundability per cycle). | High |
| 3 | **When to see a fertility doctor** (after 12 months of trying, or 6 months at 35+) | Unexplained-infertility guideline (ESHRE 2023), preconception lifestyle advice, male-infertility guideline. Nothing on the evaluation of the female partner. | ASRM committee opinion on fertility evaluation of infertile women, or NICE fertility guideline (CG156 / update). | High |
| 4 | **Which contraception is most effective** (typical-use vs perfect-use failure rates across all methods) | LARC practice bulletin (2017), French CNGOF contraception guideline (2019), US MEC 2016 updates (eligibility, not effectiveness), US SPR 2024. | A comparative-effectiveness review or the WHO / CDC effectiveness tables; also the US MEC 2024 (the library only has the 2016 updates). | High |
| 5 | **Birth spacing / how soon to get pregnant again after a birth** (interpregnancy interval) | Interpregnancy interval and recurrent pre-eclampsia, interpregnancy weight change. Postpartum contraception is well covered. | WHO birth-spacing recommendation or a meta-analysis of short interpregnancy interval and outcomes. | Medium |
| 6 | **Amenorrhoea work-up in general** ("my periods stopped for 4 months and I'm not pregnant") | Functional hypothalamic amenorrhoea guideline (Endocrine Society 2017) and reviews, PCOS guidelines. The top keyword match is still the lactational amenorrhoea method. | A general guideline on evaluating secondary amenorrhoea (ACOG / ASRM practice committee, or RCOG). | Medium |
| 7 | **What a normal period is** (length, cycle length, how much blood loss is normal) | Heavy-menstrual-bleeding guidelines (NICE 2026, SOGC No. 292), Cochrane HMB overview. | FIGO AUB System 1 (normal menstrual parameters) or a review of normal menstrual cycle characteristics. | Medium |
| 8 | **Antibiotics for a symptomatic UTI in pregnancy** (which antibiotics are safe, by trimester) | Antibiotics for asymptomatic bacteriuria in pregnancy (Cochrane 2019), IDSA asymptomatic-bacteriuria guideline, cranberries. | A guideline or review on treating cystitis / pyelonephritis in pregnancy and the safety of nitrofurantoin, cephalexin, trimethoprim by trimester. | Medium |
| 9 | **Returning to exercise after a caesarean** (when to start, return to running) | ACOG Committee Opinion 804 (exercise in pregnancy and postpartum, general), ERAS caesarean guidelines (in-hospital recovery only). | Postnatal return-to-exercise guidance (e.g. the UK return-to-running guideline) or a review on exercise after caesarean. | Medium |
| 10 | **IVF success rates by age** (live birth per cycle at 38, 40, 42) | Meta-analyses of advanced maternal age in IVF, euploid-transfer outcomes by age, AMH by age group. No registry figures. | National registry summaries (SART, HFEA, ESHRE ART monitoring) as a reviewed source. | Medium |

### Further gaps (lower priority)

| Topic | What the library has instead | What would close it | Priority |
|---|---|---|---|
| First signs of perimenopause (cycle changes, STRAW+10 staging) | Perimenopausal depression guideline, FIGO mental-health recommendations, ESE menopause guideline 2025, perimenopause hormonal toolkit. Symptoms are covered, staging is not. | STRAW+10 staging paper or a review of early perimenopause symptoms. | Low |
| Non-hormonal treatment of hot flushes: current NAMS position | ACP 2026 guideline, European Society of Gynecology statement 2026, NAMS position statement of **2015**. | NAMS 2023 non-hormone therapy position statement. | Low |
| Heartburn treatment in pregnancy | Cochrane "Interventions for heartburn in pregnancy" (**2015**), PPI-safety meta-analyses. | A current review or guideline on antacids, alginates, H2 blockers and PPIs in pregnancy. | Low |
| Continuing levothyroxine in pregnancy (dose increase) | ATA 2026 and ACOG PB 223 guidelines are in the library, but their keywords do not name levothyroxine, so reviews of IVF women and subclinical hypothyroidism outrank them. | Re-run the keyword step for these two items (adds "levothyroxine", "thyroid medication dose"). A data fix, not a new item. | Low |
| Combined pill and breast milk | Cochrane 2015 and a 2016 systematic review. | Nothing newer; check for an update at the next build. | Low |

## Gaps filled on 2026-11-27 (no API spend)

14 PubMed records added to `library.json` with summaries written by hand
from the PubMed abstract only (same fields and rules as the build; the next
build keeps them, since it reuses every existing item's summary).
Embeddings re-built offline.

| Gap | Added | Status |
|---|---|---|
| 1 Ibuprofen / painkillers while breastfeeding | LactMed (NLM) entries for ibuprofen (`pmid-30000045`), paracetamol (`pmid-30000253`), naproxen (`pmid-30000103`) | **Closed** |
| 2 Time to pregnancy | Wesselink 2017 preconception cohort (`pmid-28917614`): % pregnant at 6 and 12 cycles by age | **Closed** (NICE NG257 figures stay out: licence) |
| 3 When to see a fertility doctor | ASRM 2026 fertility evaluation (`pmid-42901815`) | Partly: the abstract has no 12 / 6-month timings. The ASRM 2023 definition (`40991339`) has no usable abstract. The app's own rule (`src/lib/ttc.ts`) cites NICE NG257 / ASRM. |
| 4 Contraception effectiveness | US MEC 2024 (`pmid-39106314`), replaces the 2016 updates | Partly: eligibility only; no typical- vs perfect-use table on PubMed |
| 5 Birth spacing | ACOG/SMFM Obstetric Care Consensus 8 (`pmid-30575677`) | Partly: the abstract does not state the 6 / 18-month advice |
| 6 Amenorrhoea work-up | ASRM 2024 (`pmid-38456861`) | Partly: abstract lists no tests |
| 7 Normal period | FIGO AUB systems 2018 (`pmid-30198563`), ACOG CO 651 (`pmid-26595586`) | Partly: abstracts give no 24-38 day figures (the cycle card cites FIGO directly) |
| 8 UTI antibiotics in pregnancy | ACOG CO 717 (`pmid-28832488`) | **Closed** for nitrofurantoin / sulfonamides by trimester |
| Low: NAMS non-hormone position | NAMS 2023 (`pmid-37252752`) | **Closed** |
| 9, 10 | nothing on PubMed with a usable abstract | Open |

Stale guidelines with a newer version now in the library (added to
`SUPERSEDED` in `library.ts`, so the old one steps back): NAMS hormone
therapy 2017 -> 2022 (`pmid-35797481`, added), NAMS non-hormonal 2015 ->
2023, ACOG CO 623 -> CO 767 (`pmid-30575639`, added), ACOG CO 757 -> CPG 4
(already present), US MEC 2016 updates -> 2024, ACOG CO 637 -> CO 722,
ACOG CO 656 -> CO 723.

Still stale, newer version not addable for free: NICE "Menopause: full
guideline" 2015 (`pmid-26598775`; NICE NG23 was updated in 2024, but NICE
terms forbid retrieval use outside the UK).

Build fixes: `evidenceLevel` now counts network meta-analyses as reviews
(4 items were labelled "study") and society documents PubMed does not tag
as guidelines (consensus statements, committee opinions, position
statements, US MEC) as guidelines. LactMed chapters (a living Bookshelf
database) get the book name in the title and the year last revised, not
2006.

## Hand-written app guidance: unsourced claims (resolved 2026-11-27, round 2)

Listed in round 1 as having no adequate source. No free source gave the
exact figures, so each claim was softened or removed; nothing new is
claimed without a source.

| Where | Claim | Done |
|---|---|---|
| `AmhAgeContext` | "typical 10-20%/yr decline" of AMH | Removed. The trend line now says AMH falls gradually with age and that results vary between tests and labs; a fall of more than 25%/yr says "worth raising with your doctor or a fertility specialist" without calling it faster than "typical". |
| `PersonalizedInsights` | HOMA-IR "normal <2.0, PCOS-specific cutoff >=2.0", "Insulin resistance detected", "root driver" | Title is now "a possible sign of insulin resistance"; text says HOMA-IR is a rough estimate with no single agreed cut-off and lab-dependent insulin tests. Trigger (>= 2.0) unchanged. |
| `PersonalizedInsights` | CA-125 "median ~68 in endometriosis vs ~12"; "may indicate endometriosis" | Medians removed; cites ESHRE endometriosis guideline 2022 (PMID 35350465, free): CA-125 and other blood tests should not be used to diagnose endometriosis; a normal value does not rule it out. |
| `PersonalizedInsights` | homocysteine "normal <10"; "increases risk"; "increases neural tube defect risk" | Now "many labs give about 15 as the upper limit"; association wording ("is linked with"); NTD link backed by library item `pmid-27633659`, with "folic acid lowers that risk". |
| `PersonalizedInsights` | prolactin "increase DHEA-S production leading to hair loss or hirsutism" | Replaced by "sometimes a milky discharge from the nipples" (standard hyperprolactinaemia symptom). |
| `PersonalizedInsights` | magnesium "Many women are deficient"; "supplement ... can help with both PMS and sleep" | Removed. Now "some small studies link low magnesium with cramps, PMS and headaches, but the evidence is limited"; supplement only after asking a doctor or pharmacist (kidney disease, interactions). |
| `PersonalizedInsights` | "Recheck in 3 months" (vitamin D + PTH, homocysteine) | Labelled in the UI text as "an app reminder, not a guideline". |
| `LabFreshnessCard` | reminder intervals; AMH every 12 months while trying to conceive; "most clinics want AMH within 6 months"; "Day-3 FSH is part of standard IVF screening" | Card subtitle now "App reminders for your current mode, not guideline intervals"; each row says "app reminder every ...". AMH removed from the conception list (ASRM: AMH does not predict natural fertility). IVF reasons now say the clinic decides how recent tests must be. |
| `api/analyze-document.ts` (AI lab-reading prompt) | same HOMA-IR, CA-125, homocysteine and prolactin/DHEA-S figures | Same corrections in the prompt, so the AI write-up does not bring them back. |

Still open: `hormone-reference.ts` FSH, LH, estradiol and progesterone
phase ranges are lab reference ranges (Mayo / LabCorp style), not guideline
values; they are labelled as lab ranges, no change made.

## Summary content check (2026-11-27, round 2)

168 library items checked: the summary, every key point and the certainty
label, each against its PubMed abstract (fetched free from E-utilities).
The sample is the most-shown items: every evidence-note pick next to lab
results and trackers, plus the top 5 chat sources for 177 everyday questions
(all eval and audit questions plus 43 pregnancy, cycle, menopause and lab
questions), ranked by how often and how high they appear. Two more in the
top 170 (a LactMed chapter and `pmid-42932433`) have no PubMed abstract and
were skipped.

157 were fair paraphrases. 12 fixes in 11 items (text only; ids, topics
and evidence-note picks unchanged; embeddings rebuilt offline):

| Item | Problem | Fix |
|---|---|---|
| `pmid-29388196` flu vaccine (Cochrane) | "protected about half of mothers and babies against flu" came from one trial of a vaccine with the 2009 pandemic strain; no trial data on seasonal flu in pregnancy | Names the strain and says no seasonal-flu trial data |
| `pmid-31616947` vaccines in pregnancy | certainty "high" for all vaccines; abstract rates only the flu vaccine as high quality | certainty set to "not stated" |
| `pmid-37341141` GnRH analogues, endometriosis | bone loss attributed to the placebo comparison | Bone loss now attributed to comparisons with other treatments |
| `pmid-30480773` omega-3 (Cochrane), 2 key points | percentages in reverse order read as the wrong direction | Reordered, "without" added |
| `pmid-31236916` thyroxine in fertility treatment | "made little difference" for low-quality evidence | "may make little difference" |
| `pmid-41031541` FIGO anaemia in pregnancy | anaemia defined as "low iron or low haemoglobin" | low haemoglobin only |
| `pmid-39651609` IV vs oral iron | "probably" after birth for low-certainty evidence | "may" |
| `pmid-28837037` freeze-all embryos | "fewer miscarriages" on a borderline result | "possibly fewer, borderline" |
| `pmid-26068707` diet/exercise in pregnancy | "helped higher-risk women" on a borderline result | borderline wording, outcomes split correctly |
| `pmid-27353385` school sex education | "Several programs led to" when one trial showed it | names the one trial and the second finding |
| `pmid-26482110` intermittent iron | "weekly-intermittent"; abstract says 2-3 times a week | corrected |

## Swiss context in the pregnancy checklist (2026-11-27, round 2)

Added next to the US / ACOG text (nothing removed), all from free official
Swiss sources:

| Item | Swiss note added | Source |
|---|---|---|
| Pertussis (Tdap) | one dose in every pregnancy, ideally in the second trimester | BAG-Bulletin 35/2025 (pertussis) |
| Flu | any trimester and the 4 weeks after birth, mid-October until the flu season starts | BAG-Bulletin 36/2025, table of autumn/winter vaccinations |
| RSV (Abrysvo) | weeks 32+0 to 36+0 if the due date falls between early October and end of March; informed choice vs nirsevimab for the baby | BAG-Bulletin 36/2025; bag.admin.ch "Der Einsatz der RSV-Impfung bei schwangeren Frauen" (June 2025) |
| COVID-19 | one dose, preferably in the second or third trimester | BAG-Bulletin 36/2025 |
| First-trimester test, scans | basic insurance covers the first-trimester test and two scans (12-14 and 20-23 weeks) | bag.admin.ch "Krankenversicherung: Leistungen bei Mutterschaft" |
| NIPT | covered from week 12 when the first-trimester risk is 1:1000 or higher | same BAG page; SGGG expert letter 52 |
| Quad screen | marked as mainly US practice | same BAG page |
| Anti-D (Rhogam) | fetal RhD from maternal blood at 18-24 weeks; 28-week anti-D only if the baby is RhD-positive | SGGG expert letter 68 (Anti-D prophylaxis) |
| Visits | seven check-ups covered in a normal pregnancy | same BAG page |
| Group B strep | swab at 35-37 weeks | SGGG Clinical Practice Recommendation 86 (May 2024) |

The vaccine nudge windows (`windowStartWeek` / `windowEndWeek`) were left
as they are; only the explanatory text carries the Swiss timing. Also
replaced "Start daily kick counts" (week 28 text) with "Get to know your
baby's usual pattern of movements", matching the movements milestone.

## Round 3 (2026-11-27)

### Vitamin D cards

Checked against the Swiss BLV recommendation (Eidg. Ernährungskommission:
600 IU a day for ages 3-60, pregnancy and breastfeeding, 800 IU from 60),
the Endocrine Society guideline 2024 (`pmid-38828931`: for adults 19-74
without an established reason it suggests no routine 25(OH)D testing and no
vitamin D above the everyday amount; it sets no 30 ng/mL target) and the
adult upper limit of 4,000 IU a day (EFSA, US NIH ODS).

| Where | Claim | Done |
|---|---|---|
| `PersonalizedInsights` (low D + low calcium; low D + high PTH) | "Start vitamin D supplementation (2000-4000 IU daily)" | The app no longer names a treatment dose: for a confirmed deficiency the doctor sets the dose (often above the everyday amount). The BLV everyday amounts and the 4,000 IU limit are given instead. |
| same, PTH card | "stop the calcium drain from your bones"; "below ~31, PTH rises"; "bring your levels above 30 ng/mL" | "Raising vitamin D usually lowers PTH again, which can reduce the pull on your bones"; "when vitamin D is low, PTH can rise"; target level left to the doctor. |
| `PersonalizedInsights` (menopause) | calcium 1200 mg, vitamin D 1000-2000 IU | Ask your doctor; everyday amounts: calcium about 1000-1200 mg, vitamin D 600 / 800 IU (BLV). |
| `MedicalHistory` (vitamin D low) | "can affect ... fertility"; "usually 1000-4000 IU daily" | Removed; dose left to the doctor, 4,000 IU limit. |
| `MenopauseNutrition`, `PostpartumNutrition` | 800-2000 / 1000-2000 IU; "baby pulls from your stores" | BLV amounts; breastfed babies get their own vitamin D drops. |
| `api/analyze-document.ts` prompt | "30-100 sufficient", "PTH rises when vitamin D <31" | 20 ng/mL covers bone needs (NIH, EFSA, BLV), no agreed 30 target; no dose for a deficiency. |

`PregnancyNutrition` (600-2000 IU, "discuss with your provider") was left:
the Endocrine Society 2024 suggests vitamin D above the everyday amount in
pregnancy, and the BLV advises daily drops with the dose agreed with a
professional.

### Summary content check, next 150 items

The next 150 items by app exposure (ranks 171-321 of the round-2 ranking;
`pmid-37871145` skipped, no PubMed abstract) were checked the same way:
summary, every key point and the certainty label against the PubMed
abstract. 145 were fair paraphrases. 5 fixes (text only, embeddings rebuilt
offline):

| Item | Problem | Fix |
|---|---|---|
| `pmid-30570133` myo-inositol in PCOS (Cochrane) | "pregnancy rate may be higher"; abstract: uncertain, not significant, very low quality | "uncertain whether it increases" |
| `pmid-40985300` misoprostol before IUD placement | "little to no difference to pain during or after"; abstract: high certainty only for after, "may" for during | split |
| `pmid-29384406` micronised progesterone and breast cancer (expert panel) | certainty "low"; no graded certainty in the abstract | "not stated" |
| `pmid-33078388` pain relief for after-pains (Cochrane) | NSAIDs "worked better"; abstract: "probably" (moderate certainty) | "probably" |
| `pmid-34382733` perceived low milk supply | "knowing more ... went along with less worry"; abstract gives an association (OR 7.10) without direction | direction removed |

### Swiss sources

| Where | Added | Source (free, official) |
|---|---|---|
| Check-ups and scans card | Swiss note per step: scans at 12-14 and 20-23 weeks covered, first-trimester test covered, NIPT from week 12 at risk 1:1000 or higher, seven check-ups and no cost-sharing for maternity services (week 13 to 8 weeks after birth for all care) | BAG "Krankenversicherung: Leistungen bei Mutterschaft" (KLV Art. 13) |
| same, glucose test | 75 g OGTT for every pregnant woman at 24-28 weeks | SGGG expert letter 81 (Gynäkologie 1/2024, free on rosenfluh.ch) |
| `PregnancyNutrition` | folic acid 400 µg as a tablet, from before pregnancy until at least the end of week 12 (was 400-600 µg and a garbled "other tube" sentence); new iodine tip (iodised salt, ask about a tablet); iron tablets only when prescribed | BLV brochure "Ernährung rund um Schwangerschaft und Stillzeit" (2020, on sge-ssn.ch) |
| `IVFNutrition` | folic acid 400 µg (was 600-800 µg "3 months before", "neural tube starts on implantation") | same |
| Pregnancy vaccinations card | link to the BAG Swiss vaccination schedule next to the ACOG/CDC reference | bag.admin.ch/de/schweizerischer-impfplan |

Still open (resolved in round 4): the Swiss sources sat in the app text,
not in the research library, so the chat could not cite them; the KLV
change of 1 July 2026 was not checked.

## Round 4 (2026-11-27)

### Menopause, bone and heart screens

Checked against free official sources: USPSTF osteoporosis screening 2025
(women 65+, and younger postmenopausal women at higher risk after a risk
check; repeat interval not set, repeating within 4-8 years added no
accuracy), the Swiss reference values for nutrient intake (BLV, June 2022:
women 18-65 calcium 950 mg, vitamin D 15 µg = 600 IU; over 65 calcium
1000-1200 mg, vitamin D 20 µg = 800 IU), KLV Annex 1 (edition 1 July 2026:
DXA covered only for listed reasons, follow-ups "as a rule at most every
two years" while the risk lasts), NAMS 2021 (calcium 1000-1200 mg total),
NOGG (UK 700 mg), NAMS 2023 non-hormone therapy (CBT and clinical hypnosis
recommended; yoga and mindfulness not), WHO activity guidance.

| Where | Claim | Done |
|---|---|---|
| `MenopauseDashboard` wellness tips (2) | "1200mg calcium daily", "DEXA scan every 2 years" | BLV amounts by age, food first; DXA from 65 or earlier with risk factors, repeat depends on the result (USPSTF 2025) |
| `ScreeningTracker` DEXA | "Recommended every 2 years post-menopause" | USPSTF 2025 wording; the 24-month reminder is labelled an app reminder; Swiss coverage rule (KLV Annex 1) added |
| `ScreeningTracker` other rows | mammogram "every 1-2 years from 40, every 1-2 years through 74"; thyroid "every 5 years"; lipids "every 5 years"; HbA1c "every 3 years from 35" | mammogram every 2 years 40-74 (USPSTF 2024) + Swiss cantonal programmes from 50; thyroid: USPSTF finds not enough evidence for routine tests, 5 years = app reminder; lipids = app reminder; HbA1c ADA / USPSTF 2021; colonoscopy row adds Swiss coverage from 50; header says which intervals are guideline and which are app reminders |
| `MenopauseNutrition`, `ModeLabInsights`, `PersonalizedInsights` | calcium "1200 mg/day", "need 1200mg/day", "about 1000-1200 mg (Swiss BLV)" | 950 mg up to 65, 1000-1200 mg from 66 (BLV table) |
| `MenopauseDashboard` | "Meditation and yoga can reduce hot flash frequency by up to 40%" | stress and sleep only; CBT and clinical hypnosis for hot flushes (NAMS 2023) |
| `MenopauseDashboard` | "Strong social ties lower dementia risk by 50%"; hot flushes "most resolve within 2-7 years"; "Accelerated bone loss in first 5-7 years. DEXA scans are critical" | association wording; "a large US study found a median of about 7 years" (SWAN); bone loss fastest around and just after the last period, ask about DXA |

Open: the app says vitamin D 800 IU "from 60" (EEK 2012 report, round 3);
the current BLV table gives 20 µg from over 65. Left unchanged; decide which
Swiss source the app follows.

### KLV change of 1 July 2026 (confirmed)

BAG "Kommentar zu den Änderungen der KLV per 1.7.2026 und 1.1.2027" (EDI
decision 9 June 2026, AS 2026 336), section 2.9: new KLV Art. 13 letter
b quater covers a first-trimester pre-eclampsia test (risk factors, blood
pressure, uterine-artery Doppler, PlGF) at the routine weeks 12-14 scan for
all singleton pregnancies; aspirin depending on the risk. The Annex 3
commentary adds analysis 1779.00 (PlGF). The BAG maternity page does not
list it yet. Added as a second Swiss note (`swissMore`) on the
first-trimester scan step of the check-ups card. The SGGG glucose note now
also mentions the two-step option (fasting glucose first without risk
factors) from expert letter 81.

### Swiss sources in the research library (chat can cite them)

The library format already allows non-PubMed items (`sourceType:
"guideline-page"`, `pmid: ""`, a `page` block, checked by
`validateLibraryItem`). admin.ch terms require written consent to
reproduce content and the SGGG letters are journal articles, so the new
publishers BAG, BLV and SGGG have `ingest: "summary-only"`: never fetched
or stored; each item is a hand-written summary in our own words with a link
(`summariser: "hand-written"`, `chunks: 0`). Seven items, built by
`scripts/research/swiss-sources.mjs` (upsert + validate):

| Item | Source |
|---|---|
| Maternity benefits (scans, first-trimester test, NIPT 1:1000, seven check-ups, no cost-sharing) | BAG page |
| First-trimester pre-eclampsia test covered from 1 July 2026 | BAG KLV commentary |
| When DXA bone density scans are covered | BAG, KLV Annex 1 |
| Vaccinations before and during pregnancy | BAG Swiss vaccination schedule 2026 |
| Nutrition before/during pregnancy and breastfeeding (folic acid 400 µg, iodine, vitamin D) | BLV page + FAQ (2018) |
| Reference values: calcium, vitamin D, folate for women | BLV (June 2022) |
| Gestational diabetes screening (OGTT 24-28 weeks, limits) | SGGG expert letter 81 |

Also: `build-library.mjs` carries `sourceType` items over unchanged; the
chat's saved sources footer now keeps non-PubMed links; the chat prompt and
/library footer mention the Swiss sources. Embeddings rebuilt offline.
Regression tests in `guideline-page.test.ts` (validation, Swiss questions
pick the Swiss item, other questions keep PubMed sources) and
`research-sources.test.ts`.

Not added: SGGG expert letter 68 (anti-D) and CPR 86 (GBS swab), whose
free URLs were not confirmed this round.

### Summary content check, next 150 items

Ranks 322-471 of the round-2 exposure ranking (none skipped; all had
PubMed abstracts), checked the same way. 143 fair. 7 fixes, all text only:

| Item | Problem | Fix |
|---|---|---|
| `pmid-37095519` risk factors, high inherited breast-cancer risk | certainty "low", abstract grades nothing | "not stated" |
| `pmid-36948440` endometriosis / adenomyosis and pregnancy | same | "not stated" |
| `pmid-27636867` combined hormonal contraception and mood | same (narrative review) | "not stated" |
| `pmid-30633132` DMPA side effects | only per-study risk of bias, no overall grade | "not stated" |
| `pmid-25304764` migraine and vascular events in pregnancy | grades nothing | "not stated" |
| `pmid-27121239` labour epidural and breastfeeding | grades nothing | "not stated" |
| `pmid-30577080` iron-fortified maize flour (Cochrane) | "only 3 studies, so very low certainty"; abstract gives other reasons | "and" |

Left as is (judgement calls): `pmid-41732035` ESHRE 2025 stimulation
guideline labelled "low" (most of its graded evidence is very low; the
summary says "low or very low"); four "low" labels whose abstracts call the
evidence weak without a formal grade (`pmid-30461693`, `pmid-40577932`,
`pmid-26641959`, `pmid-27132058`).

## Round 5 (2026-11-28)

### Vitamin D: the app follows the current BLV table

Decision: the app uses the current BLV reference values (June 2022):
600 IU (15 µg) a day up to 65, 800 IU (20 µg) over 65. The older "800 IU
from 60" (EEK 2012 report) is gone from `MenopauseNutrition`,
`MenopauseDashboard`, `PersonalizedInsights` (3 places) and the AI
lab-reading prompt (`api/analyze-document.ts`). The library's BLV
reference-values item already said "over 65". Also replaced in
`PersonalizedInsights`: "most adults need 1000-4000 IU daily, test again in
3 months" with "ask your doctor; BLV everyday amount; 4,000 IU limit".
Tests: `src/lib/healthClaims.test.ts`.

### SGGG anti-D (letter 68) and GBS (recommendation 86): found, added

| Item | Free link | Used for |
|---|---|---|
| SGGG expert letter 68, anti-D in pregnancy (Gynäkologie 1/2020, German) | rosenfluh.ch PDF (sggg.ch hosts only the French and Italian versions) | library item + new checklist step "Baby's RhD blood group test" (weeks 18 to 24; anti-D at 28 to 30 and after the birth only if the baby is RhD positive) |
| SGGG clinical practice recommendation 86, GBS (May 2024, English) | sggg.ch PDF | library item + new checklist step "Swab for group B streptococcus" (weeks 35 to 37) |

Both are hand-written summaries in our own words (`summary-only`, never
stored), built by `scripts/research/swiss-sources.mjs`. The two new steps
cite them as their library source, so the check-ups card now has six
steps. Note: the Swiss transfusion service announced (25 Nov 2025) a
revised letter 68 that adds written consent for the fetal blood group
test; the new text was not published when checked, so the 2020 letter is
the source.

### Pregnancy and postpartum screens: numeric claims

Checked against free sources: BLV brochure "Ernährung rund um
Schwangerschaft und Stillzeit" (August 2025, linked from the BLV page; now
in the BLV library item's key points), BLV FAQ (July 2026), EFSA dietary
reference values, IOM 2009, ACOG CO 804 (2020), WHO, NHS ("Your body after
the birth", "Keeping fit and healthy with a baby"), CDC Hear Her warning
signs, Cochrane PFMT 2020, perineal-massage reviews in the library, RCOG
2024 nausea guideline, Tommy's / MiNESS on sleep position.

| Where | Claim | Now |
|---|---|---|
| `PregnancyWeightTracker` | IOM 2009 ranges (12.5-18 / 11.5-16 / 7-11.5 / 5-9 kg; weekly rates) | correct, unchanged; note that the BLV brochure uses the same ranges |
| `PregnancyNutrition` caffeine | "~200 mg/day (1 large coffee)" | 1-2 cups of coffee or up to 4 cups of tea a day (BLV); 200 mg limit (EFSA, NHS); avoid energy drinks |
| `PregnancyNutrition` fish | US high-mercury list; "low-mercury fish 2-3×/week" | no shark, swordfish, marlin; fresh or tinned tuna at most once a week (BLV 2025); oily fish regularly |
| `PregnancyNutrition` alcohol | "no safe known threshold" | none in pregnancy; no safe amount known (BLV, NHS) |
| `PregnancyNutrition` vitamin D | "600-2000 IU, many practitioners now recommend 1000-2000 IU" | 600 IU drops daily, dose agreed with midwife/doctor (BLV); 4,000 IU limit |
| `PregnancyNutrition` other amounts | fluids 2.3 L; iron 27 mg; calcium 1000 mg; DHA ~300 mg; +300-500 kcal in T3; B6 "~25 mg" | 1.5-2 L (BLV); iron-rich food (27 mg US vs 16 mg EFSA), tablets only if prescribed; ~950 mg, no extra in pregnancy (BLV); DHA +100-200 mg (EFSA); +250 kcal from month 4, +500 from month 7 (BLV), NICE ~200 in the last 3 months; B6 dose from doctor/pharmacist |
| `PregnancyExercise` | "ACOG 150 min/week"; "stop supine after ~20 weeks"; Kegels "pay off for labour"; perineal massage "reduces tearing"; "most evidence-backed labour-prep" | 150 min (ACOG, WHO) + 30 min a day (BLV); keep lying flat short from ~20 weeks; PFMT lowers urine leakage (Cochrane); massage from ~34 weeks lowered tears in trials, mainly first births; staying active linked to fewer caesarean/assisted births |
| `PregnancyTracker` week notes | combined screen "weeks 10 and 13"; "sleep on your left side from now on" (week 20); "visits every 2 weeks" / "weekly visits"; Rhogam at 28 | weeks 11 to 14 (Swiss 12 to 14); side sleeping, either side, from 28 weeks; "check-ups often more frequent, ask your midwife"; anti-D at 28 to 30, Swiss RhD test 18 to 24 (SGGG) |
| `PostpartumDashboard`, `PostpartumLochiaCard` | bleeding "over 4-6 weeks"; "soaked pad/hour or clots larger than a golf ball, call your provider"; re-bleeding "often a sign of activity overdone" | several weeks, often 4 to 6, sometimes longer (NHS "a few weeks"); pad in an hour or clots bigger than an egg = urgent (CDC), get help now (144); re-bleeding can follow a busier day but can also mean retained tissue or infection |
| `PostpartumPelvicFloor`, dashboard | "Kegels from week 2; after the 6-week visit if C-section" | NHS: gentle exercise incl. pelvic floor as soon as she feels up to it after a straightforward birth; caesarean: ask first; running / high impact after the 6-week check; swimming 7 days after the bleeding stops |
| `PostpartumNutrition`, dashboard tips | fluids 2.5-3 L; protein 1.5 g/kg; iron 18 mg; calcium 1000-1300 mg; DHA ~300 mg; B12 2.8 µg; "stores low 6-12 months"; "sleep deprivation the single biggest risk factor" | at least 2 L while breastfeeding, no drink raises milk supply (BLV FAQ); protein +19 g/day while breastfeeding (EFSA); iron-rich food + blood test after heavy loss; ~950 mg, no extra (BLV); DHA +100-200 mg (EFSA); B12 from food, supplement if vegan; "months to refill"; "too little sleep makes recovery and mood harder" |

Tests: `src/lib/healthClaims.test.ts`, `pregnancySchedule.test.ts`,
`PregnancyCheckupsCard.test.tsx`.

### Summary content check, next 150 items

Ranks 472-621 of the round-2 exposure ranking (none skipped; all had
PubMed abstracts), checked the same way. 138 fair. 12 fixes in 11 items,
text only (10 re-embedded offline):

| Item | Problem | Fix |
|---|---|---|
| `pmid-38901794` SOGC endometrial thickening | key point "often not serious"; abstract does not say so | "often found on ultrasound" |
| `pmid-41470910` fish and depression (observational) | "a clear benefit appeared" | "a clear link" |
| `pmid-36744416` vitamin D for asthma | calcidiol trial called "small" | "one trial" |
| `pmid-37188442` early postpartum OGTT | "wrongly flagged some women"; specificity 56% | "about 44%" |
| `pmid-31318420` endometriosis and IVF | "ovarian endometriosis reduced egg numbers most" | "also linked to fewer eggs" |
| `pmid-38197853` abstinence time and sperm | firm "more benefit ... mostly within 4 days"; authors say "could be" | "possibly", "may" |
| `pmid-36302159` immediate postpartum IUD/implant (Cochrane) | "were more likely to come out" on low-certainty evidence | "may be" |
| `pmid-34449251` acupuncture after breast cancer | "many trials" at high risk of bias (abstract: "some"); certainty "low" ungraded | "some"; "not stated" |
| `pmid-25722103` | certainty "low", abstract grades nothing | "not stated" |
| `pmid-41147529` acupuncture for PCOS (Cochrane) | "made little or no difference" on low certainty | "may make" |
| `pmid-29168557` probiotics for thrush | "improved short-term cure" on low quality | "may have improved" |

Left as is (judgement calls): about 30 labels where the abstract gives a
range ("moderate to low") or calls the evidence weak without a formal
grade, e.g. `pmid-30342643`, `pmid-28237870`, `pmid-29910107`,
`pmid-27534637`, `pmid-42372649`, `pmid-27364100`, `pmid-28276140`,
`pmid-35325124`, `pmid-25864059`, `pmid-36449274` (could be "not stated"
under a strict reading).

## Round 6 (2026-11-28)

### Cycle, contraception, IVF and first-period screens: numeric claims

Checked against free sources: FIGO 2018 menstrual definitions, NHS
("Heavy periods", contraception pages), ACOG FAQ "Premenstrual Syndrome",
ACOG CO 651 (menstruation in girls and adolescents), AASM sleep
consensus, FSRH CEU "Recommended actions after incorrect use of CHC"
(2020/2021) and FSRH "Drug interactions with hormonal contraception",
NuvaRing and Evra package leaflets (DE/EU text), Mirena label (8 years),
HFEA and RCOG OHSS patient pages, ESHRE lifestyle evidence, BLV and EFSA
for fluids, caffeine and vitamin D.

| Where | Claim | Now |
|---|---|---|
| `healthOverview` (Health overview tile), `patientTrends` + doctor `PatientTrends` | cycle length judged against 21-35 days | FIGO 24-38, the same range `cycleInsights` and `CycleExplainedCard` already use |
| `CyclePhaseNutrition`, `PMSForecastCard` | magnesium "strongest evidence for PMS"; "magnesium + B6 the most evidence-backed levers"; follicular eating "reduces PMS later"; "one extra hour of sleep helps" | calcium has some of the better evidence, magnesium and B6 mixed (ACOG); ask a pharmacist before supplements; no unsupported claims |
| `PeriodFlowCard` | "heavy flow for more than 2-3 days" worth flagging | NHS signs: pad/tampon every 1-2 hours, clots over ~2.5 cm, bleeding more than 7 days, sudden change |
| `PreMenstrualDashboard` | "periods last 3-7 days, every 21-35 days"; sleep 9-11 h; help line "bleeding ... after a year of regular periods" | first years: up to 7 days, every 21-45 days, often irregular (ACOG); menarche about 12; sleep 9-12 h to age 12, 8-10 h as a teen (AASM); see a doctor for bleeding before 8, a period over 7 days, more than 3 months without one, no period by 15 or 3 years after breast growth |
| `ContraceptionDashboard` methods | implant "3-5 years"; copper IUD "10-12 years, up to 12"; ranges like "91-99%" unexplained | implant licensed 3 years; hormonal IUD 3, 5 or 8 years by type; copper 5-10 years by type; insertion card gives the date; new line: lower number = typical use, higher = perfect use (NHS, FSRH). Percentages unchanged (they match NHS typical / perfect use) |
| `ContraceptionDashboard` reminders | "antibiotics, St John's Wort can interfere" | enzyme inducers (rifampicin, some epilepsy medicines, St John's wort); most antibiotics do not (FSRH) |
| `ContraceptionDashboard` (new, ring / patch users) | no rule for a ring out or a patch off | ring under 3 hours: rinse and put back; patch under 24 hours: stick back or new one; longer: 7 days of condoms, ask a pharmacist about EC (`missedPill.ts`; leaflets are stricter than FSRH's 48 h and win) |
| `IVFNutrition` | Mediterranean diet "largest RCT evidence base"; protein 1.2-1.5 g/kg; vitamin D "aim 30+ ng/mL"; water 2.5-3 L "to reduce OHSS thirst"; "stop fluids 6+ h"; alcohol evidence "consistently negative" | weak evidence (ESHRE); protein at each meal, no proven amount; BLV 600 IU, doctor advises on a low test; drink to thirst ~1.5-2 L plus OHSS warning signs (call the clinic straight away); clinic fasting rules (often food 6 h, clear drinks 2 h); alcohol advised against, some studies link it to lower success |
| `ivfPhases` | "start CoQ10"; "fast from midnight"; "one or two embryos"; transfer "painless" | folic acid, ask the clinic before other supplements; clinic fasting rules; usually one embryo; feels like a smear test; OHSS warning signs after retrieval |

The IVF screens make no success-rate percentages (checked); the TTC
"see a doctor after 12 / 6 months" text was already sourced (ASRM 2023).
Missed-pill rules were checked on 2026-11-27 and are unchanged. Tests:
`src/lib/healthClaims.test.ts`, `src/lib/missedPill.test.ts`.

### Ask AI system prompt

`buildChatSystemPrompt` (`api/_lib/research/chat-prompt.ts`) had the
dose rules only in the sources block (`MEDICINE_RULES`), said "consult a
healthcare professional" without naming who, and nothing about Swiss
sources. Added three rules: name who to ask (doctor or gynaecologist,
midwife, pharmacist) and never diagnose; never say how much of a medicine
or supplement to take or when to change it, except reporting a dose a
numbered source states with "check the label or ask your pharmacist or
doctor"; Womanie is a Swiss app, so for insurance, vaccine, nutrition and
care questions prefer BAG, BLV, SGGG and Swissmedic sources, say when a
figure is from another country, emergency number 144. Note: the
"source-stated dose" exception from the November QA is kept on purpose (a
flat "never give doses" would undo it). Tests:
`api/_lib/research/chat-prompt.test.ts`.

### Summary content check, next 150 items

The round-2 exposure list was used up (all 623 items with any top-5
exposure were done). New ranking: top-10 hybrid hits for 268 questions
(138 new everyday questions on periods,
contraception, IVF, first periods and the other stages, plus the audit and eval questions), weighted by
position, minus everything checked before. The first 150 with PubMed
abstracts were checked (4 Swiss hand-written guidance items skipped; they
were checked in rounds 3-5). 127 fair. 30 fixes in 23 items, text only
(14 re-embedded offline; label-only changes need no re-embed):

- Certainty "low"/"moderate" -> "not stated" where the abstract grades
  nothing: `pmid-39419587`, `pmid-30818414`, `pmid-30348046`,
  `pmid-40979395`, `pmid-37966517`, `pmid-30389956`, `pmid-29694506`,
  `pmid-40992413`, `pmid-39536912` (study-quality checklist, not GRADE).
- Hedges restored to match the GRADE level: `pmid-31486548` (stimulation
  with IUI / IVF, "probably", "may"), `pmid-38242565` (non-drug period
  pain treatments, "may"), `pmid-31425626` (progestogen tablets for heavy
  periods, 3 places), `pmid-33305822` (vitamin D for babies, 3 places),
  `pmid-37815094` (tighter diabetes control, "probably"),
  `pmid-39868519` (caesarean myomectomy), `pmid-40476466` (contraception
  and HIV; implant vs copper IUD moderate, not high).
- Wrong number or scope: `pmid-30742315` (combined pill for heavy
  periods: 12% to 77%, not "about 77%"), `pmid-40335351` (all 13
  recommendations strong, not "most"), `pmid-40927887` (FIGO fibroids:
  GnRH analogs, not the approved antagonists, are mainly used before
  surgery), `pmid-37464357` ("several" add-ons, not "none"),
  `pmid-34339927` ("some", not "many").
- Causal wording on observational data: `pmid-34536325` (caesarean
  "linked to" lower odds of painful sex). One-sided reassurance:
  `pmid-31989588` (HRT evidence too limited "to say whether or not" it is
  very harmful).

Left as is: 33 judgement calls (labels where the abstract grades a range
or only the main outcome), e.g. `pmid-30064002`, `pmid-37753821`,
`pmid-27153744`, `pmid-28694152`, `pmid-34339416`, `pmid-40803331`,
`pmid-28432791`, `pmid-41689846`, `pmid-39887989`.

## Round 7 (2026-11-28)

### Summary content check, next 150 items

Next 150 items on the round-6 exposure ranking that had PubMed abstracts.
Skipped: 2 BAG hand-written items (checked in rounds 3-5) and 2 records
with no abstract (`pmid-30000103`, `pmid-31393678`). 130 fair. 29 fixes
in 20 items, text only (17 re-embedded offline with the incremental script;
label-only changes need no re-embed):

- Certainty "low"/"moderate" -> "not stated" where the abstract grades
  nothing: `pmid-26544652` ("moderate" was risk of bias, not GRADE),
  `pmid-38950419`, `pmid-35716207`.
- Hedges restored to match the GRADE level ("probably" for moderate,
  "may" for low): `pmid-28236310` (clomiphene and OHSS, 2 places),
  `pmid-32666584` (induction at 37+ weeks, caesareans), `pmid-28472859`,
  `pmid-42746921` (vitamin D doses), `pmid-26031211`, `pmid-31647106`
  (letrozole vs clomiphene, 3 places), `pmid-26342714` (laxatives in
  pregnancy, 4 places), `pmid-34187385`, `pmid-30288727` (pelvic floor
  training), `pmid-29656433` (tranexamic acid, 2 places),
  `pmid-37839720`.
- Wrong scope or attribution: `pmid-38364208` (all remaining
  recommendations rest on low or very low evidence, not "most"),
  `pmid-31264709` (dizziness, nausea and bruising came from other
  comparisons, not sham acupuncture), `pmid-36884238` ("many", not
  "some", may worry or be induced unnecessarily), `pmid-30747971` (would
  benefit, not "benefit most"), `pmid-31425838` (studies not described as
  small, 2 places).
- Claim not in the abstract: `pmid-34360381` (egg freezing "may help"
  women feel in control, not "many women feel").

Left as is: 49 judgement calls (labels where the abstract grades a range
or only the main outcome), e.g. `pmid-26092137`, `pmid-40335350`,
`pmid-31867625`, `pmid-36592455`, `pmid-34148587`, `pmid-30609970`.

### Ask AI answer audit (offline, no paid calls)

40 of the 268 ranking questions (spread over all stages: 6 cycle, 8
contraception, 6 IVF, 3 first periods, 3 postpartum, 5 pregnancy, 3
menopause, 2 conception, 4 general), run through the chat's real source
selection (`selectChatSourcesHybrid`) with the bundled model, no AI call.
For each, the six sources the chat would send were read for topic,
guideline version and Swiss alternatives.

| Question | Problem | Fix |
|---|---|---|
| Whooping cough vaccine in pregnancy; gestational diabetes test | Swiss source (BAG schedule, SGGG letter 81) ranked 3rd / 2nd behind US documents or prevention reviews | Swiss items (tag `switzerland`) that match a subject word of the question and its topic get x1.25 (`SWISS_SOURCE_FACTOR`); now first. Context words such as "pregnant" do not count, so the vaccine schedule no longer rides into "soft cheese when pregnant" |
| Folic acid before pregnancy | BLV advice (400 µg from before a planned pregnancy) not sent; a malaria review first | Swiss lift + BLV keywords "before pregnancy"; BLV now 2nd |
| When should girls get the HPV vaccine? | Non-Swiss only; no Swiss source in the library | New hand-written item from the BAG HPV page (11 to 14 years, catch-up 15 to 26, 2 doses before 15 / 3 after, no deductible in cantonal programmes, co-payment remains); now first, not sent for smear-test questions |
| How to prevent osteoporosis after menopause? | ACP 2017 guideline sent; replaced by the ACP 2023 living guideline | `pmid-36592456` added (summary from the abstract), 2017 version in `SUPERSEDED` |
| Natural remedies for hot flashes | Only supplement reviews; NAMS 2023 (supplements and herbal remedies not recommended) missing | NAMS 2023 keywords "natural remedies"; now among the sources |
| Contraception after 40 | Education-intervention reviews; Italian consensus on contraception beyond 40 missing | keywords "contraception after 40 / over 40"; now 3rd |

No change needed (on-topic, current): heavy periods (NICE 2026),
endometriosis diagnosis, tranexamic acid, blood clots, antibiotics,
breastfeeding contraception (US MEC 2024), OHSS, frozen transfer, HRT
safety (NAMS 2022), fertility doctor (ASRM 2026), vitamin D (BLV first),
ferritin, soft cheese (BLV), nausea (RCOG 2024).

Left open (gaps, no free source with a usable abstract): what to do after
a forgotten pill and migraine with aura on the pill (the US SPR / MEC
2024 abstracts do not state the rules; the app's own missed-pill card
cites FSRH); typical-use pill effectiveness; normal cycle length (FIGO
abstract gives no figures); thyroid and the menstrual cycle (no review);
no period at 15 (no primary amenorrhoea guideline; a dysmenorrhoea
guideline ranks first); returning to running after birth; IVF success by
age; Swiss cervical screening and mammography programmes (no free SGGG /
Swiss Cancer Screening text checked yet). Tests:
`api/_lib/research/ask-ai-audit.test.ts`; the existing search evals are
unchanged (hybrid main set, audit set and no-source questions pass).

### AI lab-reading prompt (`api/analyze-document.ts`)

The prompt carried about 150 numeric cut-offs from memory (trimester TSH
0.1-2.5 from ATA 2011, trimester ferritin 25.8 / 18.3 / 19.0, IVF hCG
"means", AMH age medians, IL-6, cortisol ratios, CTX / P1NP, Lp(a),
ApoB, hs-CRP, fibrinogen, B12, magnesium, tumour markers, Cushing's /
adrenal limits ...), several contradicting each other (HOMA-IR "no
agreed cut-off" next to "HOMA-IR >= 2.5 = insulin resistance") and
diagnostic shortcuts ("Anti-TPO > 35 = Hashimoto's", "discontinue
combined pills", "aspirin + LMWH"). Most had no source in the library.

Now:
- **Status follows the lab's own reference range**, the same rule every
  screen uses (`api/_lib/lab-flags.ts`): the lab's flag or printed range
  decides normal / abnormal; "critical" only when the lab or doctor marks
  it; no range and no listed figure = "informational", with a note that
  her doctor can say what it means. No figure in the prompt can override
  the lab's range.
- **Four reference figures kept**, each with a library source, used only
  when the lab printed no range: haemoglobin below 11 g/dL in pregnancy
  (FIGO 2025), ferritin below 30 µg/L (Cochrane 2021), 75 g OGTT limits
  5.1 / 10.0 / 8.5 mmol/L (SGGG letter 81), vitamin D below 50 nmol/L
  (guideline review 2018; BLV everyday amounts unchanged).
- Reading rules without numbers: hCG trend, pregnancy thyroid ranges (ATA
  2026), no blood test for endometriosis (Cochrane 2016), HOMA-IR,
  cycle-day hormones, tumour markers are not screening tests.
- Notes: plain language, never a diagnosis, name who to ask (doctor or
  gynaecologist, midwife, pharmacist), no doses; "possible conditions"
  are possibilities only (the Records screen already says so).

Tests: `src/lib/healthClaims.test.ts` (lab range wins; 20 removed
cut-offs stay out; every number in the reference block is on an
allow-list of sourced figures).

## Round 8 (2026-11-28)

### Round-7 open topics: sources added (all free, no API spend)

Hand-written summaries in our own words with a link (`summariser:
"hand-written"`, `chunks: 0`, built by `scripts/research/swiss-sources.mjs`),
plus PubMed items whose summaries were written from the abstract. New
summary-only publishers in `guideline-page.ts`: Fedlex (Swiss federal
law, no copyright, URG Art. 5), FSRH / CoSRH, HFEA, FIGO. Only the
Swiss items carry the `switzerland` tag, so the others get no Swiss lift.

| Topic | Source added |
|---|---|
| Forgotten pill | CDC US SPR 2024 page (late under 24 h, missed 24 h+, 2+ missed = 7 pills of condoms, skip the break after week 3, EC after week 1; same limits as FSRH, the app's missed-pill card); FSRH CHC guideline (missed = more than 24 h late, vomiting within 3 h) |
| Migraine with aura and the combined pill | FSRH CHC guideline 2019 / amended 2023 (UKMEC 4 with aura, 2 to start without aura, 3 for new migraine on it); `pmid-29086160` EHF / ESC consensus 2017; `pmid-43058720` review 2026 (guidelines agree: no combined methods with aura; progestogen-only considered safe) |
| Typical-use effectiveness | FSRH table (pill 9% typical / 0.3% perfect; implant 0.05%, hormonal coil 0.2%, copper 0.8%, condom 18%); `pmid-28245088` US survey 2006-2010; `pmid-27018154` 43 countries. A WHO page was not used (licence-required) |
| Normal cycle length | FIGO System 1 (IJGO 2023, CC BY): 24 to 38 days, bleeding up to 8 days, regularity 7 to 9 days by age; `pmid-31482137` 612,613 cycles, mean 29.3 days |
| Thyroid and the cycle | `pmid-20938101` (2,000+ women: period problems only more common in severe thyroid disease); `pmid-33613678` narrative review (infrequent periods the commonest change) |
| No period by 15 | `pmid-31259490` AFP 2019 and `pmid-33687345` EJE 2021: check if no period by 15, or 3 years after breast development (no puberty signs by 13). No ACOG primary-amenorrhoea document was free with a usable abstract |
| Running after birth | `pmid-38148108` and `pmid-38191239` BJSM 2024 international Delphi consensus (minimum 3 weeks rest, screening, walk-run start, strength work) |
| IVF success by age | HFEA "Fertility treatment 2024" (June 2026, preliminary): 30% per embryo transferred, 38% at 18-34, 8% at 43-44; `pmid-21558332` 400,135 UK cycles by age and egg number. Swiss figures by age: not found as text (BAG / BFS give only totals; charts without numbers) |
| Swiss cervical screening | SGGG expert letter 97 (30 June 2026, replaces 50): every 3 years 21 to 70; cytology 21-29, cytology or HPV 30-70; no co-testing; HPV screening still not covered |
| Swiss breast screening and smear coverage | KLV Art. 12e (fedlex, version 1 Aug 2026, unchanged in the 1 Jan 2027 text): smear yearly for the first two then every 3 years; HPV screening test not covered; programme mammography every 2 years from 50, no deductible |

Found on the way: **SGGG letter 94 (7 January 2026) replaced letter 68**
(anti-D). The library item now summarises letter 94 (fetal RhD test from
week 16, not 18; written consent, genetic test; insurance pays once;
anti-D for early bleeding only from 12+0 weeks; after a miscarriage
managed at home or with tablets from 9+0). The old item is removed. App
text updated: pregnancy schedule (weeks 16 to 24, consent note, source
letter 94) and two pregnancy-tracker lines.

App text also updated: the screening tracker's cervical line was the US
schedule ("Pap + HPV co-test every 5 years through 65"); now SGGG 97 and
KLV 12e. The mammogram line adds "no deductible, co-payment applies".

### Ask AI retrieval audit, rerun (40 round-7 questions + 20 new)

Offline, `selectChatSourcesHybrid` with the bundled model. On the 40
round-7 questions, 14 changed, all because a new source joined; nothing
on-topic was lost. The new sources lead for: forgotten pill (CDC), typical
use (FSRH), IVF at 35 (HFEA), running after birth, cervical smear (SGGG
97), mammogram (KLV); they are among the six for migraine with aura,
thyroid, 35-day cycle and no period at 15. All 20 new questions get an
on-topic source first. One ranking fix: "forget a pill" did not match
"forgot / forgotten" (different stems), so the Cochrane period-pain
review led; keywords added, the CDC item now leads.

Side effects accepted: the SGGG cervical item is 2nd for the two Swiss
mammography questions (it matches "screening" and the Swiss lift; no
Swiss breast-screening programme text is in the library yet) and 4th for
"When should girls get the HPV vaccine?"; the FIGO item joins "Why are my
periods so heavy?" (3rd; it defines heavy flow). Tests:
`api/_lib/research/ask-ai-audit.test.ts` (round 8 block), the keyword
audit set now accepts the HFEA / UK register items for "IVF success rates
at 40", `healthClaims.test.ts`, `pregnancySchedule.test.ts`.

Still open: Swiss IVF success by age (no text figures), a free Swiss
breast-screening programme page (swisscancerscreening.ch could not be
fetched; which cantons run programmes is not in the library).

### Summary content check, next 100 items

Next 100 items on the round-6 exposure ranking (none skipped; all had
PubMed abstracts). 82 fair. 19 fixes in 18 items, text only (12
re-embedded offline with the incremental script; label-only changes need
no re-embed):

- Certainty "low" -> "not stated" where the abstract grades nothing:
  `pmid-31135656`, `pmid-28333357`, `pmid-31618674`, `pmid-40420105`,
  `pmid-31711271`, `pmid-26629884`, `pmid-34217581`.
- Hedges restored to match the GRADE level: `pmid-25758061`
  (paracetamol vs ibuprofen, "may"), `pmid-41701618` ("may"),
  `pmid-37330773` (Pilates, "probably"), `pmid-27038134` (scar fillers,
  "probably"), `pmid-31845767` (ovulation "may", pregnancy "probably"),
  `pmid-39465967` (satisfaction "probably", was "may"), `pmid-32710657`
  (infant growth, "probably").
- Wrong scope or number: `pmid-28937705` (only erythromycin, and
  possibly clindamycin, beat placebo, not "antibiotics"), `pmid-43010994`
  (under one extra egg, not "a few more").
- Overstated: `pmid-37192834` (frozen vs fresh transfer, mostly
  retrospective: "linked to better results"), `pmid-27887710` (results
  too imprecise to call the treatment safe for babies), `pmid-27228266`
  (orlistat: "meaningful" drop not in the abstract).

Left as is: 18 judgement calls (labels where the abstract grades a range
or only some outcomes, one self-contradicting abstract), e.g.
`pmid-41448220`, `pmid-30738885`, `pmid-26172878`, `pmid-32972380`,
`pmid-30103263`, `pmid-41498229`, `pmid-32124980`, `pmid-41184155`.

## Round 9 (2026-11-28)

### Round-8 weaker matches fixed

| Question | Problem | Fix |
|---|---|---|
| Swiss mammography questions | SGGG cervical letter 97 was 2nd / 3rd (matched "cancer", "screening" and the Swiss lift) | New rule `SUBJECT_MISMATCH` in `library.ts` (x0.6): breast / mammogram asked and no cervix / smear / Pap / HPV word, title about cervical screening only; and the reverse (smear asked, breast-only title). The cervical letter is no longer among the six; KLV Art. 12e stays first |
| HPV-vaccine questions | Cervical letter 4th ("When should girls get the HPV vaccine?") and 2nd ("Is the HPV vaccine free in Switzerland?") | Same rule: a vaccine asked (no screening / smear / test word), a title about screening without "vaccine" x0.6. BAG HPV item still first, the letter is out |
| "Why are my periods so heavy?" | FIGO normal-cycle item 3rd (it carried the topic `heavy-bleeding`, worth a topic hit) | Topic removed (it defines cycle length; flow is only "judged by the woman"). Now heavy-bleeding reviews and the NICE guideline fill the six. Topics are not embedded, so no re-embed |

The cervical letter still leads both smear questions. Tests:
`ask-ai-audit.test.ts` (round 9 block, keyword and bundled-model).

### Swiss breast screening by canton, Swiss IVF figures

- **Breast screening programmes** (new hand-written item, publisher
  "Swiss Cancer Screening", `gp-swiss-teilnahme-e165b7`): the umbrella
  association's canton list and participation page could be fetched this
  time. 18 cantons run a programme in November 2026 (AG since July 2026
  per the Krebsliga Aargau / Clario release of 1 June 2026; AR, AI, BS,
  BL, BE, FR, GE, GR, JU, LU, NE, SG, SO, TG, TI, VS, VD); no programme
  listed for ZH, SH, ZG, GL, SZ, UR, OW, NW (inferred from the list: the
  "other cantons" page does not name them). Ages 50 to 69 or 74 by
  canton, every 2 years, no deductible, 10% co-payment about CHF 20,
  double reading, about five in six findings need no treatment. Now first
  for "Is there a breast screening programme in my canton?" and "I live in
  Zurich, can I get a free mammogram?"; 2nd after KLV for "When should I
  start mammograms in Switzerland?".
- **Swiss IVF figures** (new item, publisher "BFS",
  `gp-bfs-reproduktive-perinatale-gesundheit-6ec7c0`): BFS tables
  T 14.03.07.01.01 to .03 (XLSX, data as of 16 April 2026): 2024, 6,533
  women, 12,573 started cycles, 2,475 live births; 47% of treated women
  pregnant, 37% gave birth; birth per transfer 30% (fresh 26%, frozen
  32%), per cycle 19%; miscarriage about 1 in 5; twins 2%; mean age 36.8
  and the age mix. **No Swiss success rates by age exist in the BFS
  tables** (BAG pages show them only as charts; no FIVNAT report found as
  free text), and the item says so and points to the UK register. It now
  leads the IVF-success questions (Swiss lift) with HFEA (rates by age)
  2nd; the round-8 test moved HFEA from "first" to "among the sources".
  Not tagged `age-fertility`, and "ages" kept out of the title, to avoid
  matching age questions harder than it can answer them.

### Summary content check, next 100 items

Next 100 items on the round-6 exposure ranking (none skipped; all had
PubMed abstracts). 87 fair. 16 fixes in 13 items, text only (10
re-embedded offline with the incremental script; label-only changes need
no re-embed):

- Certainty -> "not stated" where the abstract grades nothing:
  `pmid-36084006`, `pmid-26695595` (risk of bias only), `pmid-38772634`
  ("high" came from study-quality tools, not GRADE).
- Hedges restored to match the GRADE level: `pmid-34391952` (endometriosis
  surgery, "may", 2 places), `pmid-36209937` (preterm birth, "probably"),
  `pmid-35553047` (ibuprofen vs paracetamol, "probably", 2 places),
  `pmid-31990055` (sling complications, "may"), `pmid-41721260`
  (induction and shoulder dystocia, "probably", 2 places),
  `pmid-32964431` (hospital stay: very low certainty, "uncertain").
- Wrong scope or comparison: `pmid-31476798` (most outcomes were unclear,
  not "made little difference"), `pmid-37415461` (the LDL result was not
  against levonorgestrel pills; only arterial clots were),
  `pmid-28987293` ("most likely to help", not "may help most").
- Blanket safety claim in the app's voice: `pmid-30762623` (creatine
  "safe" is now the authors' judgement for these trials).

Left as is: 22 judgement calls (labels where the abstract grades a range
or only the main outcome; evidence levels instead of GRADE), e.g.
`pmid-32683695`, `pmid-35922074`, `pmid-26415762`, `pmid-34994399`,
`pmid-32303295`, `pmid-29117320`, `pmid-43055207`.

### Superseded-guideline sweep

All 439 guideline-type PubMed items were listed by issuing body. Newer
versions were looked up in PubMed (free E-utilities, no API spend) for the
series that publish numbered or dated updates (ACOG, SOGC, ASRM, ESHRE,
USPSTF, NAMS, NICE, AAP, AWMF, NCCN, CDC / ACIP). The older record is
added to `SUPERSEDED` in `library.ts`, so it steps back (x0.6) while the
newer one is in the library; it stays citable.

Newer version already in the library (16 old records now step back):
SOGC folic acid 2015 -> Guideline 427 (2022; its French twin also steps
back, one guideline per slot), SOGC dysmenorrhoea 2017 -> 2025, SOGC
hirsutism 2017 -> 2023, SOGC OASIS 2015 -> 2024, AWMF candidosis 2015 ->
2021, ASRM PGT-A 2018 -> 2024, ASRM uterine septum 2016 -> 2024, ESHRE POI
2016 -> 2025, ACOG morcellation CO 770 -> CO 822, ACOG PB 202 (2 records)
-> PB 222, AAP influenza 2019-20 and 2023-24 -> 2025-26, USPSTF iron in
pregnancy 2015 -> 2024, USPSTF tobacco 2015 -> 2021.

Newer version added (summary written from the PubMed abstract, own words;
7 items embedded offline): USPSTF folic acid 2023 reaffirmation
(`pmid-37526713`, 0.4 to 0.8 mg daily, grade A), USPSTF hypertensive
disorders of pregnancy 2023 (`pmid-37721605`, replaces pre-eclampsia
screening 2017), USPSTF falls 2024 (`pmid-38833246`), ASRM ovarian
reserve 2020 (`pmid-33280722`), NCCN cervical cancer v2.2026
(`pmid-41671440`), ACOG CO 807 tobacco and nicotine (`pmid-32332417`,
replaces CO 721), NICE NG23 menopause, November 2024 update
(`pmid-31940155`, abstract gives scope only; replaces the 2015 record).

Checked, no newer full version (or only a partial update, so nothing
demoted): ACOG PB 190 GDM (a 2024 Clinical Practice Update changes
screening only), SOGC Guideline 398 progesterone (Technical Update 467,
2026, covers one group), ACS cervical 2020 (2026 update covers self-
collection and screening exit only), ACIP Tdap 2018 (2020 update is a
narrow change), USPSTF cervical 2018 (still the final statement in
PubMed), USPSTF perinatal depression 2019, healthy weight 2021, vitamin D
and fractures 2018 (no newer statement in PubMed), ACOG PB 194 PCOS, PB
196, PB 201, PB 203, PB 183, CO 651, CO 762, CO 722, NAMS 2022 / 2023,
SOGC BV / vulvovaginitis / toxoplasmosis / AUB 292, AAP neonatal pain
2016, ACR breast imaging in pregnancy 2018.

Before / after check: chat sources for 216 questions (the 138 round-6
everyday questions plus the eval, QA and audit sets), bundled model. 12
changed: in every case where an old record left, the newer version was
sent instead or was already among the six (the slot went to another
on-topic item). One catch fixed on the way: "itchy with thick white
discharge" lost its only source (the 2015 AWMF record, found by meaning
only, fell under the score floor once demoted); the 2021 record now
carries the keywords "itchy", "itching", "white / thick discharge" and is
sent. Side effect accepted: after its re-embed, the sling-surgery review
(`pmid-31990055`) took the 6th slot from a pelvic-floor exercise review
for "I leak a bit of pee when I sneeze since giving birth" (the
pelvic-floor sources above it are unchanged). Search evals unchanged.
Tests: `ask-ai-audit.test.ts` (round 9 sweep block: every pair steps back,
every target is in the library and not itself superseded).

## Round 10 (2026-11-28)

### Round-9 side effect fixed: leaking after birth

"I leak a bit of pee when I sneeze since giving birth" had the
sling-operation review (`pmid-31990055`) 5th, ahead of an exercise review.
Pelvic-floor training is what helps first, so:

- New `SUBJECT_MISMATCH` rule in `library.ts` (x0.6): a leaking / bladder
  / prolapse question with no word about an operation (surgery, sling,
  mesh, tape, procedure ...), a title about an operation, sling, mesh or
  repair that does not also name pelvic-floor training or exercise.
- Keywords only (not embedded, no re-embed): "cough sneeze leak" removed
  from the sling review; "leak when I sneeze", "leak when I cough",
  "leaking when coughing" added to the two Cochrane training reviews
  (`pmid-32378735`, `pmid-30288727`).

Now no surgery review is among the six (bundled model: three training
reviews lead, an exercise review is 6th; keyword-only: five training
reviews). "I leak when I cough or run" now gets the two Cochrane training
reviews too. Asked about surgery ("What surgery is there for bladder
leaks?"), the sling reviews still lead. Search evals unchanged. Tests:
`ask-ai-audit.test.ts` (round 10 block).

### Summary content check, next 100 items

Next 100 items on the round-6 exposure ranking (none skipped; all had
PubMed abstracts). Only 32 items with any exposure are left unchecked
after this round, so round 11 needs a new ranking (new questions). 85
fair. 19 fixes in 15 items, text only (8 re-embedded offline with the
incremental script; label-only changes need no re-embed):

- Certainty -> "not stated" where the abstract grades nothing (risk of
  bias or study-quality scales only): `pmid-27461606`, `pmid-34967466`,
  `pmid-30624659`, `pmid-32635675`, `pmid-38715235`, `pmid-30928686`,
  `pmid-40312882`.
- Hedges restored to match the GRADE level: `pmid-29630882` (exercise for
  period pain: pain "probably", duration "may", 2 places),
  `pmid-41288141` (cyproterone vs other hirsutism treatments, "may"),
  `pmid-27701665` (nausea in pregnancy, low quality, "may", 3 places),
  `pmid-29045765` (metformin in pregnancy, "may", 2 places),
  `pmid-42746920` (length gain, low certainty: "may", was "probably").
- Causal wording on observational data: `pmid-34895348` (spiramycin
  "linked to" lower toxoplasma transmission).
- Wrong scope: `pmid-33461239` (two trials studied women as a group, not
  "only two included women"), `pmid-38016166` (the combined estrogen /
  bazedoxifene product is sold in the US at a lower dose; only the dose
  studied is not).

Left as is: 12 judgement calls (labels picked from a graded range; two
hedges that repeat the Cochrane authors' own wording), e.g.
`pmid-39546333`, `pmid-29068467`, `pmid-36635165`, `pmid-35099778`,
`pmid-33034900`, `pmid-32096862`, `pmid-28444736`, `pmid-35416478`.

### In-app static text: numbers with units

Grep of `src/` (non-test `.ts` / `.tsx`) for a number followed by mg,
IU, µg / mcg, %, week(s), day(s), hour(s), kg, mmol or ng: 345 lines.
Skipped: code comments, durations of the user's own data ("last 30 days",
"7 days" tiles), sharing / login / privacy timings, and the screens and
claims already pinned in earlier rounds (`healthClaims.test.ts`,
`pregnancySchedule.test.ts`, `missedPill.test.ts`: pregnancy and
postpartum nutrition, exercise, weight, lochia and pelvic floor,
screening tracker, cycle overview and flow, first periods, contraception,
IVF nutrition and phases, menopause bone and vitamin D). About 45 health
claims were left to judge:

| Where | Claim | Status |
|---|---|---|
| `PersonalizedInsights` thyroid in pregnancy | "TSH every 4-6 weeks" | unsourced (the ATA 2026 library item gives no interval): doctor or midwife says how often |
| `PersonalizedInsights` thyroid antibodies | "levothyroxine is likely needed", "TSH every 6-8 weeks", "keep TSH below 2.5" when trying to conceive | unsourced medicine advice: ask whether medicine is needed; targets differ before and in pregnancy |
| `PersonalizedInsights` iron + B12 + folate | "likely causing significant fatigue"; "energy should improve within 4-8 weeks" | unsourced promise: "can add to tiredness", doctor decides treatment and rechecks |
| `PersonalizedInsights` AMH | "below the low threshold of 1.1 ng/mL" | no source in the library: "on the low side for many labs", compare with the lab's range and age |
| `PersonalizedInsights` bile acids | "monitored weekly from 32 weeks" | not a fixed rule in SMFM 2021 / RCOG 2022: doctor or midwife says how often. The 10 / 19 / 40 / 100 µmol/L figures and 35-36 weeks are sourced (SMFM 2021, RCOG 2022, in the text) |
| `PersonalizedInsights` folate low | "at least 400mcg of folic acid" | sourced (USPSTF 2023, `pmid-37526713`; BLV); comment added, "ask whether you need more" added |
| `PersonalizedInsights` APS | "repeat test 12 weeks later" | sourced (2023 ACR/EULAR criteria, named in the text) |
| `PersonalizedInsights` heavy periods | "soak through pads hourly or bleed more than 7 days" | sourced (NHS signs, as in `PeriodFlowCard`) |
| `PregnancyLabInsights` | unused cut-offs: vitamin D "≥30 ng/mL", glucose "<95 mg/dL", folate "≥5 ng/mL", calcium range ... | never shown (status comes from the lab's range) but contradicted the 20 ng/mL / 5.1 mmol/L decisions: removed |
| `CyclePhaseExercise` | "Last 5-7 days (PMS window): ... + magnesium" | magnesium mixed evidence (ACOG, round 6): removed; "the 5 days or so before your period" (ACOG PMS definition) |
| `LHSurgeCard` | "LH surge typically lasts 12-24 hours" | unsourced: "the surge can be short" |
| `CycleUpdateSuggestions` progesterone | "ovulation likely happened 5-7 days before your blood test" | one result cannot date ovulation: "if the test was timed about a week before your next period, ovulation was probably about a week before it" |
| `CycleUpdateSuggestions` LH | "ovulation within 24-48 hours"; "next 24-48 hours are optimal" | aligned with the ovulation-test card (12 to 36 hours): "within about a day and a half", "today and the next day or two" |
| `PregnancyTracker` week 40 | "average newborn 50 cm and 3.4 kg (47-54 cm, 2.5-4.3 kg)"; "only about 5% arrive on the due date" | WHO Child Growth Standards medians (about 49-50 cm, 3.2-3.3 kg); "few babies arrive exactly on it" |
| `PregnancyTracker` week 36 | early term 37, full term 39; GBS swab 35-37 | sourced (ACOG CO 579, comment added; SGGG 86 in the library) |
| `PregnancyTracker` week 16 | US FMLA 12 weeks, Germany 14, UK 39 | legal, not health; left |
| `BabyTracker` | newborns feed 8-12 times in 24 hours | sourced (AAP 2022, NHS); comment added |
| `KickCounter` | more than 2 hours for 10 movements -> contact now | sourced (`kickSession.ts`: NHS, RCOG GTG 57) |
| `ContractionTimer` | 5-1-1 rule, "follow your midwife's rule if different" | common rule, already deferred to her midwife; e2e-tested, left |
| `OvulationTestsCard`, `BetaHcgTracker`, `CycleUpdateSuggestions`, `CycleImpactSection`, `IVFJourneyCard`, `TriggerShotTimer`, `MethodDatesCard` | ovulation 12-36 h after a positive test; temperature up 3 days; repeat hCG in 48(-72) h; first beta 9-14 days after transfer; retrieval ~36 h after trigger; ring / patch 3 weeks on, 1 off | standard clinic and leaflet rules, each worded as "usually" with "your clinic confirms"; left |
| `PerimenopauseStageCard` | variability ≥ 7 days; gap of 60+ days; 1-3 years to final period | sourced (STRAW+10, cited in the file) |
| `PMSForecastCard`, `EpdsScreener`, `labRecheck`, `CycleExplainedCard`, `hormone-reference` | 5 days before the period; EPDS below 10; FIGO anaemia check at 28 weeks; FIGO 24-38 days; day-21 progesterone ≥ 3 ng/mL | sourced (ACOG, EPDS, FIGO 2025, FIGO 2018, Mayo / ASRM; named in the text or file) |
| `CycleHistoryCard` | "cycles vary by more than ±8 days" | the app's own band on her data, labelled in the code as not a guideline; left |

Not in scope and left for a later round: numbers without one of these
units ("4-10x more common", "1 in 10", "every 6-12 months") in
`PersonalizedInsights`. Tests: `src/lib/healthClaims.test.ts` (round 10
block, checked with code comments stripped).

## Data-quality notes found during the audit

These are not gaps. They are tagging problems in existing items. **Fixed
on 2026-11-26** in `library.json` metadata only (topics, tags, keywords,
life stages; ids unchanged; embeddings re-built offline). Candidate sources
for the gaps are in `docs/research-gap-candidates.md`.

- `pmid-28675776` (vitamin D for allergy prevention) is tagged
  `antihistamines-pregnancy`, so it is the second source for a hay-fever
  antihistamine question. Now `vitamin-d-pregnancy` + `vitamin-d`, without
  the "hay fever" tag and keywords.
- `pmid-26642102` (AACE/ACE/AE-PCOS Society PCOS guideline, 2015) is tagged
  only `iui`; it should also carry `pcos`. Now `pcos` only (it is not
  about IUI), life stage `ivf` dropped.
- `pmid-26457821` (lactational amenorrhoea method) carries `irregular-cycles`
  and `medicines-breastfeeding`, so it ranks first for "my periods stopped".
  Both topics, the `menstrual-cycle` stage and the keyword "no periods
  breastfeeding" removed.
- `pmid-35618358` (assisted hatching guideline) ranks in the top five for
  "frozen vs fresh embryo transfer". Topic `ivf-outcomes`, the tag "frozen
  embryo transfer" and the keywords "frozen embryo" / "fresh transfer"
  removed.
- The library has no retracted items (checked on publication types and titles).
- Re-checked on 2026-11-27 against PubMed (all 2,507 PMIDs: exist, title
  and year match). One review was retracted after the build: `pmid-37311484`
  (tranexamic acid at caesarean, *AJOG MFM* 2023; expression of concern Sep
  2026, retraction Dec 2026). Removed from `library.json` and the
  embeddings; `build-library.mjs` now drops retracted records even when
  their summary is cached.

## Retrieval fixes made in this audit

Hit rate (a hand-checked item among the first 3 sources the chat sends, 37
scored questions, gaps excluded): **89% before, 100% after** with the
bundled semantic model; keyword-only 84% before, 92% after. The existing
evals did not change (main set 0.94, medicine sets 1.00, no-source
questions still get no sources).

1. **Phrase synonyms**: "periods stopped / missed period" now reaches
   amenorrhoea, and "how can I tell if I have ..." reaches screening and
   diagnosis items.
2. **Word synonyms**: OHSS, diagnose / diagnosis, exercising, C-section /
   caesarean / cesarean, heartburn / reflux, estrogen / oestrogen.
3. **Ages in fertility questions**: "IVF success at 40" or "I'm 38" adds
   the word "age" (not for "40 weeks").
4. **Rare-word focus**: a question word that few items carry in their
   title or keywords (e.g. OHSS, coffee) lifts the items that do,
   like a named medicine already did.
5. **Topic anchor**: when the question names a topic (endometriosis, PCOS),
   items that never mention it step back (factor 0.8).
6. **IVF population**: for a question that is not about fertility
   treatment, studies of women having IVF step back (factor 0.85).
7. **Superseded guidelines**: an older guideline steps back when its newer
   version is in the library (e.g. the 2018 international PCOS guideline
   behind the 2023 update), and so does an ACOG "Summary:" record when the
   full version is present (factor 0.6).
8. Filler words "keep / continue / carry" no longer count as question words.

The 40 questions and their expected items are regression tests in
`api/_lib/research/search-eval.test.ts`.

## Dose / safety audit of the citation check (November 2026)

19 wrong answers built for 15 tricky questions (doses in pregnancy and
breastfeeding, HRT contraindications, emergency signs), cited to sources the
chat's retrieval really returns, run through
`api/_lib/research/citation-check.ts`. 9 were caught before; 10 were missed
and are now caught. Regression tests:
`api/_lib/research/citation-check-safety.test.ts`.

| Missed before | Fix |
|---|---|
| "400 µg (4 mg) folic acid": bracketed numbers were never checked | A bracketed number in the same kind of unit must equal the one before it, otherwise it is checked like any other |
| "Ask your doctor, but you can take 4 g", "increase your dose by 50%", "if your blood pressure is 180/110" | The "your ..." exemption (the patient's own figures) no longer covers advice, doses or thresholds |
| "180/110 mmHg": only the 110 was read | Both values of a blood-pressure reading are checked |
| Codeine (and tramadol, morphine, valproate, lamotrigine, lithium, isotretinoin, warfarin, methotrexate, antihistamines, HRT ...) not recognised as medicines | Added to the medicine list, with their class names as accepted synonyms |
| "Codeine is safe while breastfeeding" cited to a source that says it is contraindicated | New safety check: "X is safe / can be used" loses a citation whose source only warns against X (contraindicated, should be avoided, not recommended) and never calls it safe |
| "Transdermal estrogen increases clot risk" vs a source saying it "was not linked to an increased clot risk" | A plain denial in the source ("did not raise", "no increase") now counts as the opposite |
| "MHT" not read as HRT; "2 to 4 times the risk" not read as an increase; "compared with women who did not use it" read as a negation | All three fixed |

Also fixed a false alarm: "600 units" of vitamin D now matches "600 IU". On
19,310 summary sentences cited to another item of the same topic, the
new rules added no safety or denial removals. Removals were 2,030 numbers
(old 2,041), 1,812 medicines (old 1,717, the new names) and 20 directions
(old 18).

Still out of reach for a deterministic check:
- a wrong number with no unit ("10 kicks", "3 tablets");
- a wrong dose within 10% after "about";
- a statistic quoted with the wrong meaning ("87% detectable" when the source says 87% undetectable);
- "safe" claims against a source that only advises caution without a warning word.

The check also only judges cited sentences. An uncited wrong dose is left
to the prompt rules (`MEDICINE_RULES`).
