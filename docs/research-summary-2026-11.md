# Research library: where it stands (November 2026)

A short summary for the founder. The details, item by item, are in
`docs/research-gaps.md`.

## What the library is

When a user asks the Ask AI chat a health question, the app first looks up
the research library and sends the chat a handful of sources to base its
answer on. The same library feeds the short "what the research says" notes
next to lab results and trackers.

The library now holds **2,589 sources**:

- about 2,085 summaries of research reviews (mostly from PubMed, many of
  them Cochrane reviews),
- about 480 guidelines and official health pages (for example ACOG, RCOG,
  NICE, FIGO, the Swiss gynaecology society SGGG),
- a small number of single studies,
- **20 Swiss sources** written for Swiss users (listed below).

Every source has a plain-English summary and a few key points, written in
our own words. All sources are free to read; we bought nothing and paid for
no AI calls to build or check them.

It covers every stage in the app: first periods, the cycle, contraception,
trying to conceive, IVF, pregnancy, after the birth and breastfeeding,
menopause and the years after it, plus general health (iron, vitamin D,
thyroid, screening tests, infections).

## How much has been checked

Over 15 rounds of review, **1,872 source summaries** were read side by side
with the original research abstract. Rounds 1-13 started with the sources
users are most likely to see (the order came from running several hundred
everyday questions through the app and counting which sources came up
most). Round 14 picked the riskiest of the rest: summaries that give doses
or numbers, call something "safe", say what women "should" do, or talk
about medicines in pregnancy or breastfeeding. Round 15 took the next 150,
which had one of those risk words.

- About 5 in 6 summaries were fine as written.
- **514 corrections** were made in total (153 of them in round 14, in 70
  of the 150 risky summaries checked; 64 in round 15, in 41 of 150).
- Almost every source that comes up for the questions we tested has now
  been checked once.

## The main kinds of errors found

1. **Sounding too sure.** The most common problem. A review said a
   treatment "probably" or "may" help, and our summary said it "helps".
   Fixed so the summary is exactly as cautious as the research.
2. **A strength rating the research never gave.** A summary was labelled
   "low" or "moderate" certainty when the authors did not rate it at all.
   Changed to "not stated".
3. **The app giving advice in its own voice.** "Women should be screened
   every year" became "the guideline recommends screening every year", so
   it is clear who is advising.
4. **Cause instead of link.** "Obesity raises the risk" became "obesity is
   linked to a higher risk" where the research only observed people and
   could not prove cause.
5. **Plain factual slips.** A small number of wrong numbers, wrong time
   intervals or the wrong group of people (for example a study of young egg
   donors described as a study of IVF patients). Each was corrected
   against the abstract.
6. **Figures that were not in the source.** Round 14 found a few summaries
   that added numbers or advice the abstract never gave (for example a
   repeat-tear rate and "most women can safely have a vaginal birth" in a
   guideline whose abstract only lists its scope, or a folic acid dose
   credited to the WHO). These were removed.

Alongside the summaries, we also fixed how sources are matched to
questions, so that the chat no longer gets sources on a different subject
(for example, antioxidant studies for a question about fertility apps, or a
breastfeeding study for a question about sore breasts). One review was
taken out after it was retracted; a check of all items found no others.

## Swiss sources added

Written in our own words from official Swiss pages and laws, read in full:

- **Health insurance (Krankenkasse):** what basic insurance pays in
  pregnancy and after the birth; the first-trimester pre-eclampsia test
  (from July 2026); bone density scans; cervical smears and breast
  screening; fertility tests and insemination (and that IVF is not paid);
  medicines such as menopause hormone therapy; and that contraception is
  not paid.
- **Pregnancy care:** the Swiss vaccination schedule in pregnancy; food
  advice for pregnancy and breastfeeding (raw-milk cheese, fish, iodine);
  Swiss nutrient reference values; gestational diabetes screening; anti-D
  injections; group B strep.
- **Screening and vaccines:** HPV vaccination (ages, doses, cost); cervical
  screening (who, how often, which test); which cantons run a breast
  screening programme.
- **Fertility and the law:** IVF numbers in Switzerland in 2024; egg
  freezing and storage limits; the ban on egg donation (with the planned
  change).
- **Work and family:** maternity leave pay (starts on the day of birth,
  14 weeks at 80%); protection at work in pregnancy and after the birth.

Legal and insurance sources only come up when a question is about money,
the law or work, so they do not crowd out medical sources.

## Added in round 14

Four topics that had only nearby sources now have sources that answer
them, and these come up first in the chat:

- **Sore breasts before a period:** the NHS breast pain page (pain often
  starts up to two weeks before a period; on its own it is unlikely to be
  cancer; when to see a GP) and two breast pain reviews.
- **Breasts of different sizes:** the NHS breast-check page ("it's common
  for breasts to be different sizes", and which changes to get checked).
- **Thyroid problems after birth:** two reviews of postpartum thyroiditis
  (about 5 in 100 women; often an overactive phase, then an underactive
  one, then back to normal).
- **Warning signs of ovarian cancer:** the NHS symptoms page, a review of
  how well symptoms point to it, and the US Task Force advice against
  screening women without symptoms.

## What is still open

- **Topics with no good free source yet:** ovulation pain, breast growth
  in teenagers (only the general NHS point that breasts of different sizes
  are common), high prolactin, lubricants and fertility, the
  pill and cervical cancer, hair dye in pregnancy, swollen feet in late
  pregnancy, and travel or bleeding after embryo transfer. For these the
  chat leans on nearby sources or says its research does not cover the
  question.
- **Ten higher-priority gaps** from the first audit, such as painkillers
  while breastfeeding, how long it usually takes to get pregnant, and IVF
  success rates by age (the list is at the top of `docs/research-gaps.md`).
- **About 680 summaries have never been checked.** They did not come up
  for any of the questions we tested, and they are the lower-risk ones.
  Round 15 checked 150 more against their abstracts (64 fixes in 41
  summaries: overstated results toned down, "as effective" changed to "no
  clear difference", nine certainty labels set to "not stated", and advice
  credited to the guideline that gave it). Still open: about 135 with one
  risk word (such as "should" alone), about 500 with only a plain number,
  about 50 none. The next step is the 135.
- **A few labels are judgement calls** (for example a review that grades
  its findings from "moderate" to "low" and carries one label). These were
  left as they are and are listed in the detailed file.

This library supports general information only. It does not diagnose, and
the app always points users to their doctor or midwife for their own
situation.
