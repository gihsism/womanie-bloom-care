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
