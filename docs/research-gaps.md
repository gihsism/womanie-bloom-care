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

## Data-quality notes found during the audit

These are not gaps. They are tagging problems in existing items, which the
next `build-library.mjs` / `topics.mjs` run should fix:

- `pmid-28675776` (vitamin D for allergy prevention) is tagged
  `antihistamines-pregnancy`, so it is the second source for a hay-fever
  antihistamine question.
- `pmid-26642102` (AACE/ACE/AE-PCOS Society PCOS guideline, 2015) is tagged
  only `iui`; it should also carry `pcos`.
- `pmid-26457821` (lactational amenorrhoea method) carries `irregular-cycles`
  and `medicines-breastfeeding`, so it ranks first for "my periods stopped".
- `pmid-35618358` (assisted hatching guideline) ranks in the top five for
  "frozen vs fresh embryo transfer".
- The library has no retracted items (checked on publication types and titles).

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
