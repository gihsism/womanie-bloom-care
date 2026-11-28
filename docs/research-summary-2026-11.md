# Research library: where it stands (November 2026)

A short summary for the founder. The details, item by item, are in
`docs/research-gaps.md`.

## What the library is

When a user asks the Ask AI chat a health question, the app first looks up
the research library and sends the chat a handful of sources to base its
answer on. The same library feeds the short "what the research says" notes
next to lab results and trackers.

The library now holds **2,580 sources**:

- about 2,080 summaries of research reviews (mostly from PubMed, many of
  them Cochrane reviews),
- about 470 guidelines from medical societies (for example ACOG, RCOG,
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

Over 13 rounds of review, **1,572 source summaries** were read side by side
with the original research abstract, starting with the sources users are
most likely to see. The order came from running several hundred everyday
questions through the app and counting which sources came up most.

- About 5 in 6 summaries were fine as written.
- **297 corrections** were made in total.
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

## What is still open

- **Topics with no good free source yet:** ovulation pain, cyclical breast
  pain, breast growth in teenagers, thyroid problems after birth, warning
  signs of ovarian cancer, high prolactin, lubricants and fertility, the
  pill and cervical cancer, hair dye in pregnancy, swollen feet in late
  pregnancy, and travel or bleeding after embryo transfer. For these the
  chat leans on nearby sources or says its research does not cover the
  question.
- **Ten higher-priority gaps** from the first audit, such as painkillers
  while breastfeeding, how long it usually takes to get pregnant, and IVF
  success rates by age (the list is at the top of `docs/research-gaps.md`).
- **About 1,000 summaries have never been checked.** They are the sources
  that did not come up for any of the questions we tested. The next step is
  a new set of everyday questions to find which of them users would
  actually see.
- **A few labels are judgement calls** (for example a review that grades
  its findings from "moderate" to "low" and carries one label). These were
  left as they are and are listed in the detailed file.

This library supports general information only. It does not diagnose, and
the app always points users to their doctor or midwife for their own
situation.
