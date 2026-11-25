import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import BabyImage3DOverlay from './BabyImage3DOverlay';
import KickCounter from './KickCounter';
import GuidesSection from './GuidesSection';
import ContractionTimer from './ContractionTimer';
import HospitalBagChecklist from './HospitalBagChecklist';

// Baby development illustrations
import babyWeek04 from '@/assets/baby-week-04.png';
import babyWeek07 from '@/assets/baby-week-07.png';
import babyWeek12 from '@/assets/baby-week-12.png';
import babyWeek13 from '@/assets/baby-week-13.png';
import babyWeek16 from '@/assets/baby-week-16.png';
import babyWeek20 from '@/assets/baby-week-20.png';
import babyWeek24 from '@/assets/baby-week-24.png';
import babyWeek28 from '@/assets/baby-week-28.png';
import babyWeek32 from '@/assets/baby-week-32.png';
import babyWeek36 from '@/assets/baby-week-36.png';
import babyWeek40 from '@/assets/baby-week-40.png';

// Fruit size comparison illustrations
import fruitWeek04 from '@/assets/fruit-week-04.png';
import fruitWeek07 from '@/assets/fruit-week-07.png';
import fruitWeek09 from '@/assets/fruit-week-09.png';
import fruitWeek12 from '@/assets/fruit-week-12.png';
import fruitWeek16 from '@/assets/fruit-week-16.png';
import fruitWeek20 from '@/assets/fruit-week-20.png';
import fruitWeek24 from '@/assets/fruit-week-24.png';
import fruitWeek28 from '@/assets/fruit-week-28.png';
import fruitWeek32 from '@/assets/fruit-week-32.png';
import fruitWeek36 from '@/assets/fruit-week-36.png';
import fruitWeek40 from '@/assets/fruit-week-40.png';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInDays, addDays, format, parseISO } from 'date-fns';
import {
  Baby,
  Calendar,
  Heart,
  Activity,
  Sparkles,
  Ruler,
  Scale,
  Apple,
  Pencil,
  RotateCcw,
  ClipboardList,
  CheckCircle2,
  CircleDashed,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { getWeekData } from './pregnancyWeekData';


// Format helpers shared by display sites. Length switches from mm to cm
// at the second-trimester boundary so the units feel right (a 11 mm
// embryo vs a 17 cm fetus reads the way it does in clinical reports).
function fmtLength(week: number, range: { low: number; median: number; high: number } | null): { typical: string; range: string } | null {
  if (!range) return null;
  if (week <= 13) {
    return {
      typical: `${range.median.toFixed(0)} mm`,
      range: `${range.low.toFixed(0)}–${range.high.toFixed(0)} mm`,
    };
  }
  const toCm = (mm: number) => (mm / 10).toFixed(1);
  return {
    typical: `${toCm(range.median)} cm`,
    range: `${toCm(range.low)}–${toCm(range.high)} cm`,
  };
}

function fmtWeight(range: { low: number; median: number; high: number } | null): { typical: string; range: string } | null {
  if (!range) return null;
  // Use grams under 1 kg, kilograms above; round sensibly.
  const fmt = (g: number): string => {
    if (g < 1) return `<1 g`;
    if (g < 1000) return `${Math.round(g)} g`;
    return `${(g / 1000).toFixed(2)} kg`;
  };
  return {
    typical: fmt(range.median),
    range: `${fmt(range.low)}–${fmt(range.high)}`,
  };
}

// Imperial conversions for the length / weight stat tiles. Many users
// outside the metric belt want to see inches + ounces alongside the
// clinical metric numbers. Returns null when the source range is null
// so callers can fall through cleanly.
function fmtLengthImperial(week: number, range: { low: number; median: number; high: number } | null): string | null {
  if (!range) return null;
  const mmToIn = (mm: number) => mm / 25.4;
  if (week <= 13) {
    return `${mmToIn(range.median).toFixed(2)} in`;
  }
  return `${mmToIn(range.median).toFixed(1)} in`;
}

function fmtWeightImperial(range: { low: number; median: number; high: number } | null): string | null {
  if (!range) return null;
  const oz = range.median / 28.3495;
  if (oz < 1) return null;
  if (oz < 16) return `${oz.toFixed(1)} oz`;
  const lb = oz / 16;
  return `${lb.toFixed(2)} lb`;
}

// "About the weight of <familiar thing>" — gives a tangible sense in
// addition to the gram number. Picked so the comparison reads
// naturally to a US/EU audience.
function weightEquivalent(g: number | null | undefined): string | null {
  if (typeof g !== 'number' || g <= 0) return null;
  if (g < 5) return 'a paperclip';
  if (g < 15) return 'a strawberry';
  if (g < 30) return 'a small egg';
  if (g < 60) return 'a chicken egg';
  if (g < 120) return 'a small lemon';
  if (g < 200) return 'an apple';
  if (g < 350) return 'a banana';
  if (g < 500) return 'a stick of butter (½ lb)';
  if (g < 750) return 'a pomegranate';
  if (g < 1100) return 'a pineapple (~1 kg)';
  if (g < 1600) return 'a melon (~1.5 kg)';
  if (g < 2200) return 'a small cabbage (~2 kg)';
  if (g < 2900) return 'a butternut squash';
  if (g < 3500) return 'a small watermelon';
  return 'a large watermelon';
}


const WEEK_IMAGES: Record<number, string> = {
  4: babyWeek04, 5: babyWeek04, 6: babyWeek04,
  7: babyWeek07, 8: babyWeek07, 9: babyWeek07, 10: babyWeek07, 11: babyWeek07,
  12: babyWeek12, 13: babyWeek13, 14: babyWeek16, 15: babyWeek16,
  16: babyWeek16, 17: babyWeek16, 18: babyWeek16, 19: babyWeek20,
  20: babyWeek20, 21: babyWeek20, 22: babyWeek24, 23: babyWeek24,
  24: babyWeek24, 25: babyWeek24, 26: babyWeek28, 27: babyWeek28,
  28: babyWeek28, 29: babyWeek28, 30: babyWeek28, 31: babyWeek32,
  32: babyWeek32, 33: babyWeek32, 34: babyWeek32, 35: babyWeek36,
  36: babyWeek36, 37: babyWeek36, 38: babyWeek36, 39: babyWeek36,
  40: babyWeek40,
};

const getWeekImage = (week: number): string => {
  if (week <= 3) return babyWeek04;
  if (week >= 40) return babyWeek40;
  return WEEK_IMAGES[week] || babyWeek36;
};

// Fruit pictures exist for 11 anchor fruits only. Show one only when it
// IS this week's fruit (week 30 = cabbage must not show the week-28
// eggplant); other weeks fall back to the fruit emoji.
const FRUIT_BY_NAME: Record<string, string> = {
  'poppy seed': fruitWeek04, blueberry: fruitWeek07, cherry: fruitWeek09, lime: fruitWeek12,
  avocado: fruitWeek16, banana: fruitWeek20, 'corn on the cob': fruitWeek24, eggplant: fruitWeek28,
  squash: fruitWeek32, honeydew: fruitWeek36, 'honeydew melon': fruitWeek36,
  watermelon: fruitWeek40, 'mini-watermelon': fruitWeek40,
};

const getFruitImage = (size: string): string | null => FRUIT_BY_NAME[size.toLowerCase()] ?? null;

// ─── Per-week perspectives ───
//
// Plain-language framing of what the current pregnancy week means
// from four angles: baby (development), mother (what she may notice
// or do), partner (how a supporting partner can help — "partner"
// rather than "father" so the copy reads for any household shape),
// and employer (when to disclose, leave planning, workplace prep).
//
// Defined at 10 anchor weeks across the 4-40 range. The renderer
// resolves to the closest preceding anchor so users at week 17 see
// the week-16 perspectives, etc. — same fallback shape getWeekData()
// already uses.
interface WeekPerspectives {
  baby: string;
  mother: string;
  partner: string;
  employer: string;
}

const WEEK_PERSPECTIVES: Record<number, WeekPerspectives> = {
  4: {
    baby: 'The embryo has just implanted in the uterine wall and the placenta is starting to form. About the size of a poppy seed; not yet a recognizable shape.',
    mother: 'You may not feel different yet. Early signals — tender breasts, fatigue, food aversions — can mimic a normal premenstrual week. If you haven\'t started prenatal vitamins (folic acid in particular), do it now.',
    partner: 'Your partner just found out, or just confirmed it — likely a mix of joy and fear. Be present. Don\'t share the news with anyone until they\'re ready.',
    employer: 'No need to disclose anything yet. Most people wait until 13+ weeks. Your employer is not entitled to know until you tell them; until then, focus on the work as usual.',
  },
  8: {
    baby: 'Fingers and toes are forming, the heart beats around 150 times per minute, and tiny muscles are starting to move (you can\'t feel it yet). Major organs are visible on an early ultrasound.',
    mother: 'Morning sickness often peaks. Trust your body\'s food preferences — eat what stays down. Constant low-level nausea is common too. Aversions to specific smells (coffee, cooking, perfumes) are normal.',
    partner: 'Help with shopping, cooking, and any food smells that trigger nausea. Drive when possible — fatigue can make her too tired to focus. Resist the urge to fix things; sometimes just being there is enough.',
    employer: 'Still too early to disclose for most people. If symptoms are interfering with work, you can request flexibility without specifying why — "I\'m dealing with a health issue" is enough.',
  },
  12: {
    baby: 'End of the first trimester. The baby has all major organs in place and is starting to look proportional. Risk of miscarriage drops significantly past this point.',
    mother: 'Energy often returns. Many people start sharing the news now. The first-trimester combined screen (NT scan + bloodwork) typically happens between weeks 10 and 13.',
    partner: 'First-trimester ending — many couples share the news now. Help draft the announcement timing and the people involved. The anatomy scan is coming around week 20; mark your calendar.',
    employer: 'This is the typical disclosure window. Once told, your employer cannot legally discriminate against you for pregnancy in most jurisdictions. Consider talking to HR about leave options, work-from-home, and accommodations.',
  },
  16: {
    baby: 'Skeleton is hardening; facial expressions are forming; baby can hear muffled sound. Sex is sometimes visible on ultrasound from this point on if you want to know.',
    mother: 'Welcome to second trimester. You may start showing. First kicks (quickening) are often felt around now in a second pregnancy, slightly later in a first. Schedule your anomaly scan around week 20.',
    partner: 'Belly may start to show. Sing or talk to the bump — baby can hear you now. Don\'t take it personally if she still feels nauseous or exhausted; the second trimester is supposed to be easier but it isn\'t for everyone.',
    employer: 'Good time to formalize leave plans. Most US workers get 12 weeks unpaid via FMLA at employers with 50+ staff; the EU varies widely (Germany 14 paid, UK up to 39 paid). Confirm dates in writing and find out exactly what you\'re entitled to.',
  },
  20: {
    baby: 'Halfway. Anatomy scan typically this week or next — a 20-minute ultrasound that checks organs, placenta, growth, and amniotic fluid. Most parents-to-be remember this scan for the rest of their lives.',
    mother: 'Belly is now obviously pregnant to observers. Round-ligament pain (sharp twinges on the sides of the belly) is normal. Start sleeping on your left side from now on — better circulation to the placenta.',
    partner: 'Clear your calendar for the anatomy scan. Many couples find out the sex now if they want to. Start nursery conversations — what you\'re reusing, what you need, who\'s doing what. Research childbirth classes.',
    employer: 'Mid-pregnancy: time to talk leave dates with your manager and HR. Get exact return-to-work expectations in writing. If your work has any physical risk (chemicals, heavy lifting), request the accommodations now.',
  },
  24: {
    baby: 'Viability milestone — at this point babies born preterm have a meaningful chance of surviving with NICU care. Hearing is well-developed; the baby reacts to loud sounds.',
    mother: 'Glucose challenge test (screens for gestational diabetes) usually happens between weeks 24 and 28. Round-ligament pain continues. Some people start to feel Braxton-Hicks contractions — mild, irregular tightening, not labor.',
    partner: 'Long flights and demanding travel get harder. Help with errands; she\'s carrying real extra weight now. Start practicing breathing or massage techniques you\'ll use in labor.',
    employer: 'If you haven\'t finalized leave dates, do it now. Begin documenting your projects and responsibilities — your future leave-coverage colleague will thank you. Decide who you trust as the contact point during your leave.',
  },
  28: {
    baby: 'Third trimester begins. Eyes can open and close. Baby may show a sleep-wake cycle. Brain is developing rapidly through the rest of pregnancy — much of the weight gain from here is brain growth.',
    mother: 'Standard prenatal visits shift from monthly to every 2 weeks. Start daily kick counts. Sleep gets harder — heartburn, back pain, more bathroom trips, harder to find a comfortable position. Rhogam at 28 weeks if you\'re Rh-negative.',
    partner: 'Help with anything that involves bending over (shoes, laundry, picking things up). Ask to feel the kicks — at this point they\'re usually visible from outside. Start the conversation about night feedings and parental-leave overlap.',
    employer: 'Begin a detailed handover document — what\'s in flight, where to find docs, who covers what for each project. Have it 80% done by week 32 so you\'re not scrambling if labor starts early.',
  },
  32: {
    baby: 'Most major development is done; remaining weeks are mostly growth and brain maturation. Baby is usually head-down by now (if not, your provider may discuss external cephalic version).',
    mother: 'Pre-labor weeks. Pelvic pressure, more frequent Braxton-Hicks, swelling in feet/ankles are common. Pack your hospital bag this week — most providers want it ready by week 36.',
    partner: 'Install the car seat — hospital staff will check it before discharge. Confirm the route to the hospital, parking, the entrance to use after hours. Pack your own overnight bag too.',
    employer: 'Out-of-office and email forwarding rules set up. Confirm your manager knows the contact-chain when labor starts (and who to NOT contact). Final handover document done; walk through it with your team.',
  },
  36: {
    baby: 'Considered "early term" from 37 weeks; "full term" from 39. The baby is gaining weight and dropping into the pelvis — what\'s called "lightening" or "engagement".',
    mother: 'Weekly prenatal visits. Cervical checks may begin. Group B strep swab around weeks 35-37. Hospital bag should be packed and accessible. Practice your labor breathing if you\'re going to use it.',
    partner: 'Stay reachable. Have your bag ready too. Know the hospital paperwork — ID, insurance, birth plan. Have a backup person on call in case you can\'t get there fast enough.',
    employer: 'Labor can start any time now. Make sure your team knows you may disappear without warning. Set up the actual out-of-office. Set boundaries about being contacted during leave.',
  },
  40: {
    baby: 'Full term. Average newborn is 50 cm and 3.4 kg, but the typical range is wide (47-54 cm, 2.5-4.3 kg). Most healthy babies arrive between week 39 and week 41.',
    mother: 'Today\'s your due date — only about 5% of babies actually arrive on it. Stay close to home, stay rested. Past 41 weeks your provider will discuss induction timing and increased monitoring.',
    partner: 'Be patient. Most babies come within 2 weeks either side of the due date. Stay close, stay calm. The "is it happening yet?" texts from family will be relentless — set expectations now.',
    employer: 'You should already be on leave or on the verge of it. Resist the urge to "just finish one thing" — your job has waited for you to get here, it can wait the rest of the way.',
  },
};

function getNearestPerspectives(week: number): WeekPerspectives | null {
  const anchorWeeks = Object.keys(WEEK_PERSPECTIVES).map(Number).sort((a, b) => a - b);
  let best: number | null = null;
  for (const w of anchorWeeks) {
    if (w <= week) best = w;
    else break;
  }
  // If user is before week 4 (very early or test data), still show
  // the earliest perspective set rather than nothing.
  if (best === null && anchorWeeks.length > 0) best = anchorWeeks[0];
  return best !== null ? WEEK_PERSPECTIVES[best] : null;
}

// ─── Recommended prenatal milestones ───
//
// Sourced from ACOG / NICE typical prenatal care timelines. These are
// recommendations, not prescriptions — every pregnancy is different and
// the user's OB-GYN may schedule differently. Window is the
// {start, end} week range during which the milestone is typically done;
// label is short, description explains why.
interface PregnancyMilestone {
  start: number;
  end: number;
  label: string;
  description: string;
  category: 'visit' | 'scan' | 'lab' | 'class' | 'decision';
}

const PREGNANCY_MILESTONES: PregnancyMilestone[] = [
  { start: 4, end: 8, label: 'First prenatal visit', description: 'Confirm pregnancy, due-date calc, initial bloodwork (CBC, blood type + Rh, rubella, HIV, hep B, syphilis).', category: 'visit' },
  { start: 8, end: 12, label: 'Dating ultrasound', description: 'Confirms gestational age and heartbeat. Most accurate due-date estimate.', category: 'scan' },
  { start: 10, end: 13, label: 'First-trimester screening', description: 'Nuchal translucency scan + bloodwork (PAPP-A, β-hCG) to assess Down/Edwards/Patau risk.', category: 'scan' },
  { start: 10, end: 14, label: 'NIPT (optional)', description: 'Cell-free DNA blood test. More sensitive than the first-trimester combined screen; covered by some insurance for high-risk pregnancies.', category: 'lab' },
  { start: 15, end: 20, label: 'Quad screen (if no NIPT)', description: 'AFP, hCG, estriol, inhibin-A. Backup screen if first-trimester or NIPT not done.', category: 'lab' },
  { start: 18, end: 22, label: 'Anatomy scan', description: 'Detailed mid-pregnancy ultrasound — checks organs, placenta, growth. Sex often visible if you want to know.', category: 'scan' },
  { start: 24, end: 28, label: 'Glucose challenge test', description: 'Screens for gestational diabetes. Either a 1-hour sugary-drink test (no fasting needed, a longer test follows if high) or — in Switzerland and much of Europe — one 2-hour fasting test (75 g OGTT).', category: 'lab' },
  { start: 27, end: 29, label: 'Rhogam (if Rh-negative)', description: 'Anti-D immunoglobulin if your blood type is Rh-negative. Prevents complications in this and future pregnancies.', category: 'lab' },
  { start: 28, end: 36, label: 'Visits every 2 weeks', description: 'Standard cadence shifts from monthly to biweekly through week 36.', category: 'visit' },
  { start: 28, end: 40, label: 'Daily kick counts', description: 'Track fetal movement once a day from now on — 10 movements in 2 hours is the typical reassurance threshold.', category: 'decision' },
  { start: 30, end: 36, label: 'Childbirth class', description: 'Hospital tour, birth-prep classes, breastfeeding class. Book early — popular classes fill up.', category: 'class' },
  { start: 35, end: 37, label: 'Group B Strep swab', description: 'Vaginal/rectal swab to test for GBS colonization. If positive, you\'ll get IV antibiotics in labor.', category: 'lab' },
  { start: 36, end: 40, label: 'Weekly visits', description: 'Cervical checks, position monitoring, induction discussion if appropriate.', category: 'visit' },
  { start: 36, end: 38, label: 'Hospital bag packed', description: 'Have it ready by week 36. Pack for mom, baby, partner. Include ID, insurance card, birth plan if you have one.', category: 'class' },
  { start: 37, end: 40, label: 'Full term reached', description: '37 weeks is "early term", 39+ is "full term". Most healthy babies arrive between 39 and 41 weeks.', category: 'decision' },
  { start: 41, end: 42, label: 'Induction discussion', description: 'Past your due date by 7+ days — your provider will discuss monitoring frequency and induction timing.', category: 'decision' },
];

// Returns the milestones that bracket the current week: a small set
// of "due now" plus "coming up next" plus "you may have missed if
// not done". UI uses these three buckets so the user sees what's
// active without scrolling 16 rows.
function getRelevantMilestones(week: number) {
  const active = PREGNANCY_MILESTONES.filter(m => week >= m.start && week <= m.end);
  const upcoming = PREGNANCY_MILESTONES.filter(m => m.start > week && m.start <= week + 6);
  const recent = PREGNANCY_MILESTONES.filter(m => m.end < week && m.end >= week - 4);
  return { active, upcoming, recent };
}

const MILESTONE_CATEGORY_TONE: Record<PregnancyMilestone['category'], { dot: string; label: string }> = {
  visit: { dot: 'bg-primary', label: 'Visit' },
  scan: { dot: 'bg-secondary', label: 'Scan' },
  lab: { dot: 'bg-primary/50', label: 'Lab' },
  class: { dot: 'bg-foreground/60', label: 'Class' },
  decision: { dot: 'bg-violet-500', label: 'Decision' },
};

// ─── Pregnancy symptoms by trimester ───
const PREGNANCY_SYMPTOMS: Record<string, { label: string; icon: string }[]> = {
  first: [
    { label: 'Morning sickness', icon: '🤢' },
    { label: 'Fatigue', icon: '😴' },
    { label: 'Tender breasts', icon: '💢' },
    { label: 'Frequent urination', icon: '🚻' },
    { label: 'Food aversions', icon: '🙅' },
    { label: 'Mood swings', icon: '🎭' },
  ],
  second: [
    { label: 'Back pain', icon: '🔙' },
    { label: 'Round ligament pain', icon: '⚡' },
    { label: 'Nasal congestion', icon: '🤧' },
    { label: 'Leg cramps', icon: '🦵' },
    { label: 'Heartburn', icon: '🔥' },
    { label: 'Increased appetite', icon: '🍽️' },
  ],
  third: [
    { label: 'Braxton Hicks', icon: '💫' },
    { label: 'Shortness of breath', icon: '😮‍💨' },
    { label: 'Swelling', icon: '🫧' },
    { label: 'Insomnia', icon: '😵' },
    { label: 'Pelvic pressure', icon: '⬇️' },
    { label: 'Nesting instinct', icon: '🏠' },
  ],
};

interface PregnancyTrackerProps {
  dueDate: Date | null;
  onSetDueDate: (date: Date) => void;
  onResetPregnancy?: () => void;
  onSwitchToPostpartum?: () => void;
}

const PregnancyTracker = ({ dueDate, onSetDueDate, onResetPregnancy, onSwitchToPostpartum }: PregnancyTrackerProps) => {
  const { user } = useAuth();
  // localStorage key tracks "user dismissed the past-due transition
  // prompt." Lets a user who's a few days overdue but still pregnant
  // hide the card without us being pushy.
  const dismissKey = user ? `womanie_postpartum_transition_dismissed_${user.id}` : null;
  const [transitionDismissed, setTransitionDismissed] = useState(false);

  useEffect(() => {
    if (!dismissKey) return;
    try {
      setTransitionDismissed(localStorage.getItem(dismissKey) === '1');
    } catch { /* ignore */ }
  }, [dismissKey]);
  const [showFullImage, setShowFullImage] = useState(false);
  const [dueDateInput, setDueDateInput] = useState('');
  const [lmpInput, setLmpInput] = useState('');
  const [setupMethod, setSetupMethod] = useState<'due_date' | 'lmp' | 'ivf'>('due_date');
  const [ivfTransferInput, setIvfTransferInput] = useState('');
  const [ivfEmbryoAge, setIvfEmbryoAge] = useState<3 | 5>(5);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDueDateInput, setEditDueDateInput] = useState('');
  const [editWeekInput, setEditWeekInput] = useState('');
  const [editMethod, setEditMethod] = useState<'due_date' | 'week'>('due_date');

  const pregnancyInfo = useMemo(() => {
    if (!dueDate) return null;

    const today = new Date();
    const gestationStart = addDays(dueDate, -280); // 40 weeks before due date
    const totalDays = differenceInDays(today, gestationStart);
    const weeksPregnant = Math.floor(totalDays / 7);
    const daysExtra = totalDays % 7;
    const daysUntilDue = differenceInDays(dueDate, today);
    const trimester = weeksPregnant < 13 ? 1 : weeksPregnant < 27 ? 2 : 3;
    const trimesterLabel = trimester === 1 ? 'First' : trimester === 2 ? 'Second' : 'Third';
    const trimesterKey = trimester === 1 ? 'first' : trimester === 2 ? 'second' : 'third';
    const progressPercent = Math.min(100, Math.round((totalDays / 280) * 100));
    const weekData = getWeekData(weeksPregnant);

    return {
      weeksPregnant,
      daysExtra,
      daysUntilDue,
      trimester,
      trimesterLabel,
      trimesterKey,
      progressPercent,
      weekData,
      totalDays,
    };
  }, [dueDate]);

  const handleSetDueDate = () => {
    if (setupMethod === 'due_date' && dueDateInput) {
      onSetDueDate(parseISO(dueDateInput));
    } else if (setupMethod === 'lmp' && lmpInput) {
      const lmpDate = parseISO(lmpInput);
      const calculatedDueDate = addDays(lmpDate, 280);
      onSetDueDate(calculatedDueDate);
    } else if (setupMethod === 'ivf' && ivfTransferInput) {
      // IVF due date: transfer date + (280 - embryo age at transfer - 14 days for ovulation)
      // Simplified: transfer date + (266 - embryo age)
      const transferDate = parseISO(ivfTransferInput);
      const daysToAdd = 266 - ivfEmbryoAge;
      const calculatedDueDate = addDays(transferDate, daysToAdd);
      onSetDueDate(calculatedDueDate);
    }
  };

  // ─── Setup screen ───
  if (!dueDate) {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-center space-y-4 border-dashed border-2 border-primary/30 bg-primary/5">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Baby className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Set up Pregnancy Tracking</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Enter your due date or last menstrual period to start tracking your pregnancy week by week.
          </p>

          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              variant={setupMethod === 'due_date' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSetupMethod('due_date')}
            >
              I know my due date
            </Button>
            <Button
              variant={setupMethod === 'lmp' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSetupMethod('lmp')}
            >
              From last period
            </Button>
            <Button
              variant={setupMethod === 'ivf' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSetupMethod('ivf')}
            >
              IVF transfer
            </Button>
          </div>

          {setupMethod === 'due_date' ? (
            <div className="space-y-2 max-w-xs mx-auto">
              <label className="text-sm font-medium">Due Date</label>
              <Input
                type="date"
                value={dueDateInput}
                onChange={(e) => setDueDateInput(e.target.value)}
              />
            </div>
          ) : setupMethod === 'lmp' ? (
            <div className="space-y-2 max-w-xs mx-auto">
              <label className="text-sm font-medium">First day of last period</label>
              <Input
                type="date"
                value={lmpInput}
                onChange={(e) => setLmpInput(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-3 max-w-xs mx-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium">Embryo transfer date</label>
                <Input
                  type="date"
                  value={ivfTransferInput}
                  onChange={(e) => setIvfTransferInput(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Embryo age at transfer</label>
                <div className="flex gap-2 justify-center">
                  <Button
                    variant={ivfEmbryoAge === 3 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIvfEmbryoAge(3)}
                  >
                    Day 3
                  </Button>
                  <Button
                    variant={ivfEmbryoAge === 5 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIvfEmbryoAge(5)}
                  >
                    Day 5 (Blastocyst)
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={handleSetDueDate}
            disabled={
              setupMethod === 'due_date' ? !dueDateInput :
              setupMethod === 'lmp' ? !lmpInput :
              !ivfTransferInput
            }
            className="w-full max-w-xs"
          >
            Start Tracking
          </Button>
        </Card>
      </div>
    );
  }

  if (!pregnancyInfo) return null;

  const { weeksPregnant, daysUntilDue, trimesterLabel, trimesterKey, weekData } = pregnancyInfo;
  const symptoms = PREGNANCY_SYMPTOMS[trimesterKey] || [];

  return (
    <div className="space-y-4">
      {/* Past-due transition — surfaces from 14 days past the due
          date if the user hasn't dismissed it. Babies arriving up to
          ~10 days past due is medically expected; from 14 days the
          dashboard offers a gentle "did baby arrive?" path so the
          patient isn't stuck staring at "week 43" forever. Worded
          carefully — pregnancy loss is a real scenario and the
          dismiss option is unconditional. */}
      {daysUntilDue <= -14 && onSwitchToPostpartum && !transitionDismissed && (
        <Card className="p-4 border-l-4 border-l-primary bg-primary/5">
          <h4 className="text-sm font-semibold mb-1">Has your baby arrived?</h4>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Womanie can switch to the postpartum dashboard whenever you're ready. You'll get
            recovery milestones, lochia tracking, mood self-checks, and a feeding log.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onSwitchToPostpartum}>
              Yes — switch to postpartum
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (dismissKey) {
                  try { localStorage.setItem(dismissKey, '1'); } catch { /* ignore */ }
                }
                setTransitionDismissed(true);
              }}
            >
              Not yet, hide this
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
            If you've experienced a pregnancy loss, our hearts are with you — you can also reset
            pregnancy tracking from the section below, or stay here, whatever feels right.
          </p>
        </Card>
      )}

      {/* Due date info + edit */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Due date</div>
              <div className="text-lg font-bold">{format(dueDate, 'MMMM d, yyyy')}</div>
              <div className="text-xs text-muted-foreground">
                {daysUntilDue > 0 ? `${daysUntilDue} days to go · ${trimesterLabel.toLowerCase()} trimester` : daysUntilDue === 0 ? 'Due today' : `${Math.abs(daysUntilDue)} days past the due date`}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              setEditDueDateInput(format(dueDate, 'yyyy-MM-dd'));
              setEditWeekInput(String(weeksPregnant));
              setEditMethod('due_date');
              setEditDialogOpen(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </Card>

      {/* Edit Pregnancy Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Pregnancy Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button
                variant={editMethod === 'due_date' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setEditMethod('due_date')}
              >
                Change Due Date
              </Button>
              <Button
                variant={editMethod === 'week' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setEditMethod('week')}
              >
                Set by Week
              </Button>
            </div>

            {editMethod === 'due_date' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">New Due Date</label>
                <Input
                  type="date"
                  value={editDueDateInput}
                  onChange={(e) => setEditDueDateInput(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Current Week of Pregnancy (1-42)</label>
                <Input
                  type="number"
                  min="1"
                  max="42"
                  value={editWeekInput}
                  onChange={(e) => setEditWeekInput(e.target.value)}
                  placeholder="e.g. 20"
                />
                <p className="text-xs text-muted-foreground">
                  Due date will be calculated automatically.
                </p>
              </div>
            )}

            {onResetPregnancy && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => {
                  onResetPregnancy();
                  setEditDialogOpen(false);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                End / Reset Pregnancy Tracking
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editMethod === 'due_date' && editDueDateInput) {
                  onSetDueDate(parseISO(editDueDateInput));
                } else if (editMethod === 'week' && editWeekInput) {
                  const week = Math.max(1, Math.min(42, Number(editWeekInput)));
                  const newDueDate = addDays(new Date(), (40 - week) * 7);
                  onSetDueDate(newDueDate);
                }
                setEditDialogOpen(false);
              }}
              disabled={editMethod === 'due_date' ? !editDueDateInput : !editWeekInput}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Baby development */}
      <Card className="p-4 space-y-3">
        <h4 className="font-semibold flex items-center gap-2">
          <Baby className="h-4 w-4 text-primary" />
          Baby at Week {weeksPregnant}
        </h4>
        
        <div className="flex items-center gap-4 bg-muted/30 rounded-xl p-4">
          <img
            src={getWeekImage(weeksPregnant)}
            alt="Baby development"
            className="w-32 h-32 sm:w-36 sm:h-36 object-contain flex-shrink-0 cursor-pointer hover:scale-105 transition-transform rounded-lg dark:rounded-full"
            onClick={() => setShowFullImage(true)}
            title="Tap to see this week in 3D"
          />
          <div className="min-w-0">
            <div className="text-lg font-semibold">Your baby at week {weeksPregnant}</div>
            <div className="flex items-center gap-2 mt-1">
              {getFruitImage(weekData.size)
                ? <img src={getFruitImage(weekData.size)!} alt={weekData.size} className="w-7 h-7 object-contain" />
                : <span role="img" aria-label={weekData.size} className="text-[22px] leading-none">{weekData.emoji}</span>}
              <span className="text-sm text-muted-foreground">Size of a {weekData.size}</span>
            </div>
            {(() => {
              const lf = fmtLength(weeksPregnant, weekData.lengthMm);
              const wf = fmtWeight(weekData.weightG);
              const parts: string[] = [];
              if (lf) parts.push(lf.typical);
              if (wf) parts.push(wf.typical);
              if (parts.length === 0) return null;
              return <div className="text-sm text-muted-foreground">{parts.join(' · ')} typical</div>;
            })()}
            {(() => {
              const eq = weightEquivalent(weekData.weightG?.median ?? null);
              if (!eq) return null;
              return (
                <div className="text-xs text-muted-foreground mt-1">
                  About the weight of {eq}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Length scale — horizontal ruler that grows with the baby. Only
            renders once we have a length range (the very earliest weeks
            don't), and we cap the visible scale at 30 cm so the bar
            doesn't overflow a phone screen in late pregnancy where the
            crown-heel length is ~50 cm. */}
        {weekData.lengthMm && (() => {
          const lengthMm = weekData.lengthMm.median;
          const maxScaleMm = 300; // 30 cm
          const visibleFraction = Math.min(lengthMm, maxScaleMm) / maxScaleMm;
          const overflowed = lengthMm > maxScaleMm;
          // Tick spacing: every 5 cm up to 30 cm, with labels at 10/20/30.
          const ticks = [50, 100, 150, 200, 250, 300];
          return (
            <div className="px-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>Length to scale (CRL/CHL)</span>
                {overflowed && <span>capped at 30 cm</span>}
              </div>
              <div className="relative h-6 bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-stage-accent rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(visibleFraction * 100, 2)}%` }}
                />
                {ticks.map((mm) => (
                  <div
                    key={mm}
                    className="absolute top-0 bottom-0 w-px bg-background/60"
                    style={{ left: `${(mm / maxScaleMm) * 100}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0</span>
                <span>10 cm</span>
                <span>20 cm</span>
                <span>30 cm</span>
              </div>
            </div>
          );
        })()}

        {/* Full-size 3D image overlay */}
        {showFullImage && (
          <BabyImage3DOverlay
            src={getWeekImage(weeksPregnant)}
            week={weeksPregnant}
            onClose={() => setShowFullImage(false)}
          />
        )}

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-muted/50 rounded-xl p-3">
            <Apple className="h-4 w-4 text-primary mx-auto mb-1" />
            <div className="text-xs text-muted-foreground">Size</div>
            <div className="text-sm font-semibold">{weekData.size}</div>
          </div>
          {(() => {
            const lf = fmtLength(weeksPregnant, weekData.lengthMm);
            const li = fmtLengthImperial(weeksPregnant, weekData.lengthMm);
            const lengthLabel = weekData.measurementType === 'crl' ? 'Length (CRL)' : 'Length';
            return (
              <div className="bg-muted/50 rounded-xl p-3">
                <Ruler className="h-4 w-4 text-secondary mx-auto mb-1" />
                <div className="text-xs text-muted-foreground">{lengthLabel}</div>
                <div className="text-sm font-semibold">{lf ? lf.typical : '—'}</div>
                {li && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">({li})</div>
                )}
                {lf && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">typical {lf.range}</div>
                )}
              </div>
            );
          })()}
          {(() => {
            const wf = fmtWeight(weekData.weightG);
            const wi = fmtWeightImperial(weekData.weightG);
            return (
              <div className="bg-muted/50 rounded-xl p-3">
                <Scale className="h-4 w-4 text-accent mx-auto mb-1" />
                <div className="text-xs text-muted-foreground">Weight</div>
                <div className="text-sm font-semibold">{wf ? wf.typical : '—'}</div>
                {wi && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">({wi})</div>
                )}
                {wf && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">typical {wf.range}</div>
                )}
              </div>
            );
          })()}
        </div>
        <p className="text-[10px] text-muted-foreground text-center -mt-1">
          Population medians and 10th–90th-centile ranges (INTERGROWTH-21st / Hadlock). Individual variation outside this range is common and not inherently abnormal.
        </p>

        <div className="space-y-2">
          <h5 className="text-sm font-medium text-muted-foreground">Key Developments</h5>
          {weekData.developments.map((dev, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
              <span>{dev}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <h5 className="text-sm font-medium text-muted-foreground">Tips This Week</h5>
          {weekData.tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Heart className="h-3.5 w-3.5 text-secondary mt-0.5 flex-shrink-0" />
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </Card>


      {/* Maternal weight gain — tracker for mom's side of the pregnancy.
          Uses IOM guidelines to recommend total + expected-by-now gain. */}

      {/* Daily kick counter — only relevant from ~week 28 onward, when
          fetal movement-counting becomes part of standard self-monitoring. */}
      {weeksPregnant >= 28 && <div id="kick-counter" className="scroll-mt-4 md:scroll-mt-28"><KickCounter /></div>}

      {/* Hospital bag checklist — packing reminders surface from week
          32 onward (most providers recommend having it ready by week
          36). 27 items grouped into for-you / for-baby / for-partner /
          documents, with per-item hints that turn into "what to bring
          and why" guidance. */}
      {weeksPregnant >= 32 && <HospitalBagChecklist weeksPregnant={weeksPregnant} />}

      {/* Contraction timer — only relevant from ~week 36 onward when
          labor could realistically start. Earlier contractions are
          almost certainly Braxton-Hicks and don't need timing. */}
      {weeksPregnant >= 36 && <div id="contraction-timer" className="scroll-mt-4 md:scroll-mt-28"><ContractionTimer /></div>}

      {/* Recommended prenatal milestones — what's due now, what's
          coming up, what may have been missed. Sourced from ACOG/NICE
          typical prenatal care timelines; user's actual schedule may
          vary by clinic. */}
      {(() => {
        const { active, upcoming, recent } = getRelevantMilestones(weeksPregnant);
        if (active.length === 0 && upcoming.length === 0 && recent.length === 0) return null;
        const renderMilestone = (
          m: PregnancyMilestone,
          variant: 'active' | 'upcoming' | 'recent'
        ) => {
          const tone = MILESTONE_CATEGORY_TONE[m.category];
          const Icon = variant === 'recent' ? CheckCircle2 : CircleDashed;
          return (
            <div
              key={`${m.start}-${m.label}`}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                variant === 'active' ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
              } ${variant === 'recent' ? 'opacity-70' : ''}`}
            >
              <Icon
                className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                  variant === 'recent' ? 'text-muted-foreground' : 'text-primary'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className={`inline-flex items-center gap-1 text-[10px] text-muted-foreground`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                    {tone.label} · weeks {m.start}{m.start !== m.end ? `–${m.end}` : ''}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {m.description}
                </p>
              </div>
            </div>
          );
        };
        return (
          <Card className="p-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Prenatal milestones
            </h4>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Typical ACOG/NICE schedule — your clinic may differ. Use this as a checklist for
              what to ask about at your next visit.
            </p>
            {active.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Due now
                </h5>
                {active.map(m => renderMilestone(m, 'active'))}
              </div>
            )}
            {upcoming.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Coming up
                </h5>
                {upcoming.slice(0, 4).map(m => renderMilestone(m, 'upcoming'))}
              </div>
            )}
            {recent.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recently expected
                </h5>
                {recent.slice(0, 3).map(m => renderMilestone(m, 'recent'))}
              </div>
            )}
          </Card>
        );
      })()}


      {/* Reading material, folded away so the trackers stay near the top. */}
      <GuidesSection title={`Week ${weeksPregnant}: what it means, symptoms & milestones`}>
        {/* Multi-perspective framing of the current week — what it means
            for the baby, the mother, a supporting partner, and the
            workplace. Resolves to the nearest preceding anchor week
            (defined for weeks 4 / 8 / 12 / 16 / 20 / 24 / 28 / 32 / 36 / 40)
            so users at week 17 see the week-16 perspectives, etc. */}
        {(() => {
          const persp = getNearestPerspectives(weeksPregnant);
          if (!persp) return null;
          const sections = [
            { key: 'baby', label: 'For the baby', tone: 'bg-stage-tint border-transparent', emoji: '👶', text: persp.baby },
            { key: 'mother', label: 'For you', tone: 'bg-primary/5 border-primary/20', emoji: '💗', text: persp.mother },
            { key: 'partner', label: 'For your partner', tone: 'bg-secondary/10 border-secondary/30', emoji: '🤝', text: persp.partner },
            { key: 'employer', label: 'At work', tone: 'bg-muted/60 border-border', emoji: '💼', text: persp.employer },
          ];
          return (
            <Card className="p-4 space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Baby className="h-4 w-4 text-primary" />
                What week {weeksPregnant} means
              </h4>
              <p className="text-[11px] text-muted-foreground -mt-1">
                The same milestone, four perspectives.
              </p>
              <div className="space-y-2">
                {sections.map(s => (
                  <div key={s.key} className={`p-3 rounded-lg border ${s.tone}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm" aria-hidden="true">{s.emoji}</span>
                      <span className="text-xs font-semibold uppercase tracking-wide">{s.label}</span>
                    </div>
                    <p className="text-sm leading-relaxed">{s.text}</p>
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}
        {/* Week-by-week mini timeline */}
        <Card className="p-4 space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Your Pregnancy Journey
          </h4>
          <div className="flex gap-0.5 overflow-x-auto pb-1">
            {Array.from({ length: 40 }, (_, i) => i + 1).map(week => {
              const isCurrent = week === weeksPregnant;
              const isPast = week < weeksPregnant;
              return (
                <div key={week} className="flex flex-col items-center flex-shrink-0" style={{ width: '20px' }}>
                  <div className={`w-full h-3 rounded-sm ${
                    isCurrent ? 'bg-primary ring-2 ring-primary/30' :
                    isPast ? (week <= 13 ? 'bg-stage-accent/35' : week <= 27 ? 'bg-stage-accent/60' : 'bg-stage-accent/85') :
                    'bg-muted'
                  }`} />
                  {(week === 1 || week === 13 || week === 27 || week === 40 || isCurrent) && (
                    <span className={`text-[8px] mt-0.5 ${isCurrent ? 'text-primary font-bold' : 'text-muted-foreground'}`}>{week}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-stage-accent/35" /> 1st trimester</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-stage-accent/60" /> 2nd trimester</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-stage-accent/85" /> 3rd trimester</span>
          </div>
        </Card>
        {/* Trimester symptoms */}
        <Card className="p-4 space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Common {trimesterLabel} Trimester Symptoms
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {symptoms.map((symptom) => (
              <div
                key={symptom.label}
                className="flex flex-col items-center gap-1 p-3 rounded-xl bg-muted/50 text-center"
              >
                <span className="text-2xl">{symptom.icon}</span>
                <span className="text-xs font-medium">{symptom.label}</span>
              </div>
            ))}
          </div>
        </Card>
        {/* Milestones timeline */}
        <Card className="p-4 space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Upcoming Milestones
          </h4>
          <div className="space-y-3">
            {getMilestones(weeksPregnant).map((milestone, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border",
                  milestone.passed ? "bg-muted/30 opacity-60" : "bg-card"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold",
                  milestone.passed ? "bg-primary/20 text-primary" : "bg-primary text-primary-foreground"
                )}>
                  {milestone.week}
                </div>
                <div>
                  <div className="text-sm font-medium">{milestone.title}</div>
                  <div className="text-xs text-muted-foreground">{milestone.description}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </GuidesSection>
    </div>
  );
};

function getMilestones(currentWeek: number) {
  const allMilestones = [
    { week: 8, title: 'First Prenatal Visit', description: 'Blood tests, medical history, and first ultrasound' },
    { week: 12, title: 'End of First Trimester', description: 'Risk of miscarriage drops significantly' },
    { week: 13, title: 'Nuchal Translucency Scan', description: 'Screening for chromosomal conditions' },
    { week: 16, title: 'First Kicks', description: 'You may start feeling baby move (quickening)' },
    { week: 20, title: 'Anatomy Scan', description: 'Detailed ultrasound to check baby\'s development' },
    { week: 24, title: 'Viability Milestone', description: 'Baby could survive outside the womb with medical help' },
    { week: 26, title: 'Glucose Test', description: 'Screening for gestational diabetes' },
    { week: 28, title: 'Third Trimester Begins', description: 'Final stretch! More frequent appointments' },
    { week: 32, title: 'Hospital Bag', description: 'Good time to pack your hospital bag' },
    { week: 36, title: 'Weekly Check-ups', description: 'Baby may drop into position' },
    { week: 37, title: 'Full Term', description: 'Baby is considered early term' },
    { week: 40, title: 'Due Date', description: 'Baby is ready to meet you! 🎉' },
  ];

  // Show past 1 + next 4 milestones
  const upcomingIdx = allMilestones.findIndex(m => m.week > currentWeek);
  const startIdx = Math.max(0, (upcomingIdx === -1 ? allMilestones.length : upcomingIdx) - 1);
  const slice = allMilestones.slice(startIdx, startIdx + 5);

  return slice.map(m => ({ ...m, passed: m.week <= currentWeek }));
}

export default PregnancyTracker;
