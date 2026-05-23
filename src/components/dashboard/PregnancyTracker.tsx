import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import BabyImage3DOverlay from './BabyImage3DOverlay';
import KickCounter from './KickCounter';
import MaternalWeightTracker from './MaternalWeightTracker';
import ContractionTimer from './ContractionTimer';

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
import { Badge } from '@/components/ui/badge';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays, differenceInWeeks, addDays, format, parseISO } from 'date-fns';
import {
  Baby,
  Calendar,
  Heart,
  Activity,
  AlertCircle,
  Sparkles,
  ChevronRight,
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

// ─── Pregnancy week-by-week data ───
//
// Length + weight ranges are derived from published fetal-biometry
// references — INTERGROWTH-21st for early gestation crown-rump length
// (CRL), and Hadlock / WHO Multicentre Growth Reference for second-
// and third-trimester estimated weight + crown-heel length (CHL).
// Numbers are population medians with a typical-range envelope at
// roughly the 10th–90th centile; individual variation outside this
// is common and NOT inherently abnormal — clinicians look at trend
// + multiple markers, not a single reading.
//
// Convention:
//   * weeks 4–13 use CRL (curled measurement on ultrasound)
//   * weeks 14+ use CHL (head-to-heel, legs extended)
// We mark this with `measurementType` so the display can label the
// distinction honestly rather than implying both forms are the same
// number.

interface RangeMm { low: number; median: number; high: number }
interface RangeG { low: number; median: number; high: number }

interface WeekEntry {
  size: string;
  emoji: string;
  measurementType: 'crl' | 'chl';
  lengthMm: RangeMm | null;
  weightG: RangeG | null;
  developments: string[];
  tips: string[];
}

const WEEK_DATA: Record<number, WeekEntry> = {
  // First trimester — CRL only; weights are sub-gram and not
  // clinically meaningful as a range, so we leave weightG null.
  4:  { size: 'Poppy seed',  emoji: '🌱', measurementType: 'crl', lengthMm: { low: 0.4, median: 1,   high: 2 }, weightG: null,                                  developments: ['Embryo implants in uterus', 'Placenta begins forming'], tips: ['Start prenatal vitamins', 'Avoid alcohol and smoking'] },
  5:  { size: 'Sesame seed', emoji: '🌱', measurementType: 'crl', lengthMm: { low: 1,   median: 2,   high: 4 }, weightG: null,                                  developments: ['Heart begins to beat', 'Neural tube forming'], tips: ['Schedule your first prenatal visit', 'Stay hydrated'] },
  6:  { size: 'Lentil',      emoji: '🫘', measurementType: 'crl', lengthMm: { low: 3,   median: 5,   high: 8 }, weightG: null,                                  developments: ['Nose, mouth, ears forming', 'Heart beats 110 times/min'], tips: ['Manage morning sickness with small meals', 'Get plenty of rest'] },
  7:  { size: 'Blueberry',   emoji: '🫐', measurementType: 'crl', lengthMm: { low: 8,   median: 11,  high: 14 }, weightG: null,                                 developments: ['Arms and legs developing', 'Brain growing rapidly'], tips: ['Eat folate-rich foods', 'Start gentle exercise routine'] },
  8:  { size: 'Raspberry',   emoji: '🍇', measurementType: 'crl', lengthMm: { low: 13,  median: 17,  high: 22 }, weightG: { low: 0.5, median: 1,   high: 2 },    developments: ['Fingers and toes forming', 'Baby starts moving (you cannot feel it yet)'], tips: ['Wear comfortable clothing', 'Stay active with walks'] },
  9:  { size: 'Cherry',      emoji: '🍒', measurementType: 'crl', lengthMm: { low: 20,  median: 25,  high: 31 }, weightG: { low: 1,   median: 2,   high: 3 },    developments: ['All essential organs have begun forming', 'Tiny muscles begin to work'], tips: ['Consider prenatal yoga', 'Eat balanced meals'] },
  10: { size: 'Strawberry',  emoji: '🍓', measurementType: 'crl', lengthMm: { low: 28,  median: 33,  high: 41 }, weightG: { low: 2,   median: 4,   high: 6 },    developments: ['Vital organs fully formed', 'Fingernails start to develop'], tips: ['Schedule nuchal translucency scan', 'Monitor weight gain'] },
  11: { size: 'Fig',         emoji: '🫒', measurementType: 'crl', lengthMm: { low: 38,  median: 45,  high: 53 }, weightG: { low: 5,   median: 7,   high: 11 },   developments: ['Bones beginning to harden', 'Baby can open and close fists'], tips: ['Second trimester approaching', 'Energy levels may improve soon'] },
  12: { size: 'Lime',        emoji: '🍋', measurementType: 'crl', lengthMm: { low: 50,  median: 58,  high: 67 }, weightG: { low: 10,  median: 14,  high: 20 },   developments: ['Reflexes developing', 'Intestines moving into abdomen'], tips: ['End of first trimester!', 'Risk of miscarriage drops significantly'] },
  13: { size: 'Peach',       emoji: '🍑', measurementType: 'crl', lengthMm: { low: 64,  median: 73,  high: 84 }, weightG: { low: 18,  median: 23,  high: 30 },   developments: ['Fingerprints forming', 'Vocal cords developing'], tips: ['Welcome to second trimester', 'You may start showing'] },

  // Second + third trimester — CHL (head-to-heel) and Hadlock-derived
  // estimated fetal weight medians + ±15% envelope.
  14: { size: 'Lemon',       emoji: '🍋', measurementType: 'chl', lengthMm: { low: 130, median: 147, high: 165 }, weightG: { low: 73,    median: 93,    high: 113 },   developments: ['Sucking and swallowing reflexes', 'Lanugo (fine hair) covering body'], tips: ['Second-trimester energy may return', 'Stay hydrated; aim for 8+ glasses water'] },
  15: { size: 'Apple',       emoji: '🍎', measurementType: 'chl', lengthMm: { low: 150, median: 167, high: 184 }, weightG: { low: 92,    median: 117,   high: 142 },   developments: ['Can sense light through closed eyelids', 'Forming taste buds'], tips: ['Sleep on your side from now on', 'Mid-pregnancy ultrasound coming up'] },
  16: { size: 'Avocado',     emoji: '🥑', measurementType: 'chl', lengthMm: { low: 167, median: 186, high: 205 }, weightG: { low: 115,   median: 146,   high: 177 },   developments: ['Can make facial expressions', 'Skeleton hardening'], tips: ['You might feel first kicks (quickening)', 'Schedule anomaly scan around week 20'] },
  17: { size: 'Pear',        emoji: '🍐', measurementType: 'chl', lengthMm: { low: 184, median: 204, high: 224 }, weightG: { low: 142,   median: 181,   high: 220 },   developments: ['Fat layers begin forming', 'Hearing developing'], tips: ['Talk or sing — baby can start to hear', 'Mind balance: centre of gravity is shifting'] },
  18: { size: 'Bell pepper', emoji: '🫑', measurementType: 'chl', lengthMm: { low: 200, median: 222, high: 244 }, weightG: { low: 174,   median: 222,   high: 270 },   developments: ['Yawning and hiccupping in utero', 'Genitals visible on ultrasound'], tips: ['Anomaly scan often this week or next', 'Prenatal classes worth booking'] },
  19: { size: 'Mango',       emoji: '🥭', measurementType: 'chl', lengthMm: { low: 216, median: 240, high: 264 }, weightG: { low: 213,   median: 272,   high: 331 },   developments: ['Vernix forming on skin', 'Sensory area of brain developing'], tips: ['Round-ligament pain is common', 'Light pelvic-floor exercises help'] },
  20: { size: 'Banana',      emoji: '🍌', measurementType: 'chl', lengthMm: { low: 230, median: 256, high: 282 }, weightG: { low: 259,   median: 330,   high: 401 },   developments: ['Can hear sounds', 'Developing sleep patterns'], tips: ['Halfway there!', 'Start planning nursery'] },
  21: { size: 'Carrot',      emoji: '🥕', measurementType: 'chl', lengthMm: { low: 240, median: 267, high: 294 }, weightG: { low: 314,   median: 400,   high: 486 },   developments: ['Eyebrows and eyelids fully formed', 'Coordinated movements'], tips: ['Wear supportive shoes', 'Mind iron + calcium intake'] },
  22: { size: 'Spaghetti squash', emoji: '🎃', measurementType: 'chl', lengthMm: { low: 250, median: 278, high: 306 }, weightG: { low: 375,   median: 478,   high: 581 },   developments: ['Tooth buds forming', 'Eyes fully formed but irises lack pigment'], tips: ['Watch for early signs of preeclampsia (swelling, headaches, vision changes)', 'Continue prenatal exercise'] },
  23: { size: 'Grapefruit',  emoji: '🍊', measurementType: 'chl', lengthMm: { low: 260, median: 289, high: 318 }, weightG: { low: 446,   median: 568,   high: 690 },   developments: ['Lungs developing blood vessels', 'Skin still translucent'], tips: ['Glucose challenge / GTT often this window', 'Track fetal movements daily'] },
  24: { size: 'Corn on the cob', emoji: '🌽', measurementType: 'chl', lengthMm: { low: 270, median: 300, high: 330 }, weightG: { low: 526,   median: 670,   high: 814 },   developments: ['Lungs developing surfactant', 'Responds to light and sound'], tips: ['Viability milestone — major early-birth threshold', 'Start kick counting consistently'] },
  25: { size: 'Cauliflower', emoji: '🥦', measurementType: 'chl', lengthMm: { low: 311, median: 346, high: 381 }, weightG: { low: 616,   median: 785,   high: 954 },   developments: ['Hair growing on scalp', 'Hands becoming dexterous'], tips: ['Watch for signs of preterm labour', 'Stay rested'] },
  26: { size: 'Lettuce',     emoji: '🥬', measurementType: 'chl', lengthMm: { low: 320, median: 356, high: 392 }, weightG: { low: 716,   median: 913,   high: 1110 },  developments: ['Eyes start to open', 'REM sleep cycles begin'], tips: ['Prenatal classes start showing benefit', 'Discuss birth plan with midwife or OB'] },
  27: { size: 'Lettuce',     emoji: '🥬', measurementType: 'chl', lengthMm: { low: 329, median: 366, high: 403 }, weightG: { low: 828,   median: 1055,  high: 1282 },  developments: ['Brain tissue developing rapidly', 'Recognises mother\'s voice'], tips: ['Third trimester begins', 'Plan parental leave logistics'] },
  28: { size: 'Eggplant',    emoji: '🍆', measurementType: 'chl', lengthMm: { low: 339, median: 376, high: 413 }, weightG: { low: 949,   median: 1210,  high: 1471 },  developments: ['Eyes can open and close', 'Baby may dream (REM sleep)'], tips: ['Third trimester begins', 'Monitor for swelling'] },
  29: { size: 'Butternut squash', emoji: '🎃', measurementType: 'chl', lengthMm: { low: 348, median: 386, high: 425 }, weightG: { low: 1082,  median: 1379,  high: 1676 },  developments: ['Bone marrow producing red blood cells', 'Stronger kicks'], tips: ['Watch for signs of GD or preeclampsia', 'Sleep with extra pillow support'] },
  30: { size: 'Cabbage',     emoji: '🥬', measurementType: 'chl', lengthMm: { low: 360, median: 399, high: 439 }, weightG: { low: 1224,  median: 1559,  high: 1894 },  developments: ['Brain is shedding lanugo', 'Practising breathing'], tips: ['Plan hospital bag essentials', 'Regular antenatal checks now'] },
  31: { size: 'Coconut',     emoji: '🥥', measurementType: 'chl', lengthMm: { low: 371, median: 411, high: 452 }, weightG: { low: 1374,  median: 1751,  high: 2128 },  developments: ['All five senses developed', 'Eyes can track light'], tips: ['Watch fetal movement — should stay regular', 'Antenatal pelvic-floor work'] },
  32: { size: 'Squash',      emoji: '🎃', measurementType: 'chl', lengthMm: { low: 382, median: 424, high: 466 }, weightG: { low: 1532,  median: 1953,  high: 2374 },  developments: ['Practising breathing movements', 'Bones fully developed but still soft'], tips: ['Start birth plan', 'Pack hospital bag'] },
  33: { size: 'Pineapple',   emoji: '🍍', measurementType: 'chl', lengthMm: { low: 393, median: 437, high: 481 }, weightG: { low: 1696,  median: 2162,  high: 2628 },  developments: ['Skull bones still flexible to ease birth', 'Antibodies passing from mother'], tips: ['Discuss labour signs with care provider', 'Plan postnatal support'] },
  34: { size: 'Cantaloupe',  emoji: '🍈', measurementType: 'chl', lengthMm: { low: 405, median: 450, high: 495 }, weightG: { low: 1865,  median: 2377,  high: 2889 },  developments: ['Lungs nearly mature', 'Fingernails reach fingertips'], tips: ['Confirm hospital choice', 'Practise breathing/relaxation'] },
  35: { size: 'Honeydew',    emoji: '🍈', measurementType: 'chl', lengthMm: { low: 416, median: 462, high: 508 }, weightG: { low: 2036,  median: 2595,  high: 3154 },  developments: ['Kidneys fully developed', 'Liver starting to process waste'], tips: ['Watch for signs of labour', 'Final preparations time'] },
  36: { size: 'Honeydew melon', emoji: '🍈', measurementType: 'chl', lengthMm: { low: 427, median: 474, high: 521 }, weightG: { low: 2207,  median: 2813,  high: 3419 },  developments: ['Fat layers filling out', 'Head may engage in pelvis'], tips: ['Weekly check-ups now', 'Rest as much as possible'] },
  37: { size: 'Romaine',     emoji: '🥬', measurementType: 'chl', lengthMm: { low: 437, median: 486, high: 535 }, weightG: { low: 2376,  median: 3028,  high: 3680 },  developments: ['Considered "early term"', 'Practising sucking'], tips: ['Listen to your body', 'Final birth-plan review'] },
  38: { size: 'Pumpkin',     emoji: '🎃', measurementType: 'chl', lengthMm: { low: 448, median: 498, high: 548 }, weightG: { low: 2540,  median: 3236,  high: 3932 },  developments: ['Fully developed lungs', 'Brain and lungs continue maturing'], tips: ['Full term!', 'Watch for signs of labour'] },
  39: { size: 'Mini-watermelon', emoji: '🍉', measurementType: 'chl', lengthMm: { low: 456, median: 507, high: 558 }, weightG: { low: 2696,  median: 3435,  high: 4174 },  developments: ['Brain still developing rapidly', 'Antibody supply boosted'], tips: ['Track contractions vs Braxton-Hicks', 'Stay hydrated; rest'] },
  40: { size: 'Watermelon',  emoji: '🍉', measurementType: 'chl', lengthMm: { low: 461, median: 512, high: 563 }, weightG: { low: 2840,  median: 3619,  high: 4398 },  developments: ['Ready to be born!', 'All organs mature and functioning'], tips: ['Due date week!', 'Stay calm and prepared'] },
};

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

const getWeekData = (week: number) => {
  const keys = Object.keys(WEEK_DATA).map(Number).sort((a, b) => a - b);
  let bestKey = keys[0];
  for (const k of keys) {
    if (k <= week) bestKey = k;
    else break;
  }
  return WEEK_DATA[bestKey] || WEEK_DATA[4];
};

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

// Fruit size comparison images for the top status card
const FRUIT_IMAGES: Record<number, string> = {
  4: fruitWeek04, 5: fruitWeek04, 6: fruitWeek04,
  7: fruitWeek07, 8: fruitWeek07,
  9: fruitWeek09, 10: fruitWeek09, 11: fruitWeek09,
  12: fruitWeek12, 13: fruitWeek12, 14: fruitWeek12, 15: fruitWeek12,
  16: fruitWeek16, 17: fruitWeek16, 18: fruitWeek16, 19: fruitWeek16,
  20: fruitWeek20, 21: fruitWeek20, 22: fruitWeek20, 23: fruitWeek20,
  24: fruitWeek24, 25: fruitWeek24, 26: fruitWeek24, 27: fruitWeek24,
  28: fruitWeek28, 29: fruitWeek28, 30: fruitWeek28, 31: fruitWeek28,
  32: fruitWeek32, 33: fruitWeek32, 34: fruitWeek32, 35: fruitWeek32,
  36: fruitWeek36, 37: fruitWeek36, 38: fruitWeek36, 39: fruitWeek36,
  40: fruitWeek40,
};

const getFruitImage = (week: number): string => {
  if (week <= 3) return fruitWeek04;
  if (week >= 40) return fruitWeek40;
  return FRUIT_IMAGES[week] || fruitWeek36;
};

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
  { start: 24, end: 28, label: 'Glucose challenge test', description: 'Screens for gestational diabetes. 1-hour fasting test; if abnormal, follow up with the 3-hour tolerance test.', category: 'lab' },
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
  lab: { dot: 'bg-amber-500', label: 'Lab' },
  class: { dot: 'bg-emerald-500', label: 'Class' },
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
}

const PregnancyTracker = ({ dueDate, onSetDueDate, onResetPregnancy }: PregnancyTrackerProps) => {
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

  const { weeksPregnant, daysExtra, daysUntilDue, trimester, trimesterLabel, trimesterKey, progressPercent, weekData } = pregnancyInfo;
  const symptoms = PREGNANCY_SYMPTOMS[trimesterKey] || [];

  return (
    <div className="space-y-4">
      {/* Main pregnancy status */}
      <div className="bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 rounded-2xl p-5">
        <div className="text-center mb-4">
          {/* Hero image: the baby illustration is the headline, with the
              fruit comparison overlaid in the corner so users get both
              "what does this stage look like" and "size of a lemon" in
              one glance. Click to open the 3D overlay. */}
          <div
            className="relative w-32 h-32 sm:w-36 sm:h-36 mx-auto mb-2 cursor-pointer hover:scale-105 transition-transform"
            onClick={() => setShowFullImage(true)}
            title="Tap to see this week in 3D"
          >
            <img
              src={getWeekImage(weeksPregnant)}
              alt={`Baby at week ${weeksPregnant}`}
              className="w-full h-full object-contain"
            />
            <div className="absolute -bottom-1 -right-1 bg-background/95 backdrop-blur rounded-full p-1.5 border shadow-sm">
              <img
                src={getFruitImage(weeksPregnant)}
                alt={`Size of a ${weekData.size}`}
                className="w-9 h-9 object-contain"
              />
            </div>
          </div>
          <div className="text-4xl font-light text-foreground mb-1">
            Week {weeksPregnant}
            <span className="text-lg text-muted-foreground ml-1">+{daysExtra}d</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {trimesterLabel} Trimester · size of a {weekData.size}
          </div>
          <Badge variant="secondary" className="mt-2">
            {daysUntilDue > 0 ? `${daysUntilDue} days until due date` : daysUntilDue === 0 ? 'Due today! 🎉' : `${Math.abs(daysUntilDue)} days past due date`}
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Week 1</span>
            <span>Week 40</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="text-center text-xs text-muted-foreground">
            {progressPercent}% complete
          </div>
        </div>
      </div>

      {/* Due date info + edit */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Due Date</div>
              <div className="text-lg font-bold">{format(dueDate, 'MMMM d, yyyy')}</div>
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
            className="w-32 h-32 sm:w-36 sm:h-36 object-contain flex-shrink-0 cursor-pointer hover:scale-105 transition-transform rounded-lg"
            onClick={() => setShowFullImage(true)}
            title="Tap to see this week in 3D"
          />
          <div className="min-w-0">
            <div className="text-lg font-semibold">Your baby at week {weeksPregnant}</div>
            <div className="flex items-center gap-2 mt-1">
              <img src={getFruitImage(weeksPregnant)} alt={weekData.size} className="w-7 h-7 object-contain" />
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
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
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
      <MaternalWeightTracker weeksPregnant={weeksPregnant} />

      {/* Daily kick counter — only relevant from ~week 28 onward, when
          fetal movement-counting becomes part of standard self-monitoring. */}
      {weeksPregnant >= 28 && <KickCounter />}

      {/* Contraction timer — only relevant from ~week 36 onward when
          labor could realistically start. Earlier contractions are
          almost certainly Braxton-Hicks and don't need timing. */}
      {weeksPregnant >= 36 && <ContractionTimer />}

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
            const isTrimesterBorder = week === 13 || week === 27;
            return (
              <div key={week} className="flex flex-col items-center flex-shrink-0" style={{ width: '20px' }}>
                <div className={`w-full h-3 rounded-sm ${
                  isCurrent ? 'bg-primary ring-2 ring-primary/30' :
                  isPast ? (week <= 13 ? 'bg-pink-300' : week <= 27 ? 'bg-violet-300' : 'bg-indigo-300') :
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
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-pink-300" /> 1st trimester</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-violet-300" /> 2nd trimester</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-indigo-300" /> 3rd trimester</span>
        </div>
      </Card>

      {/* Important dates */}
      <Card className="p-4 space-y-2.5">
        <h4 className="font-semibold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-primary" />
          Key Dates & Reminders
        </h4>
        {weeksPregnant < 12 && (
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
            <span className="text-lg">🩺</span>
            <div>
              <p className="text-xs font-semibold">First prenatal visit</p>
              <p className="text-[10px] text-muted-foreground">Schedule before week 12 — includes blood tests & first ultrasound</p>
            </div>
          </div>
        )}
        {weeksPregnant >= 11 && weeksPregnant < 14 && (
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800">
            <span className="text-lg">🔬</span>
            <div>
              <p className="text-xs font-semibold">Nuchal translucency scan</p>
              <p className="text-[10px] text-muted-foreground">Best done between weeks 11-14 — screening for chromosomal conditions</p>
            </div>
          </div>
        )}
        {weeksPregnant >= 18 && weeksPregnant < 22 && (
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/5 border border-secondary/10">
            <span className="text-lg">👶</span>
            <div>
              <p className="text-xs font-semibold">Anatomy scan</p>
              <p className="text-[10px] text-muted-foreground">Detailed ultrasound between weeks 18-22 — checks baby's development</p>
            </div>
          </div>
        )}
        {weeksPregnant >= 24 && weeksPregnant < 28 && (
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
            <span className="text-lg">🍬</span>
            <div>
              <p className="text-xs font-semibold">Glucose tolerance test</p>
              <p className="text-[10px] text-muted-foreground">Screening for gestational diabetes — usually done weeks 24-28</p>
            </div>
          </div>
        )}
        {weeksPregnant >= 35 && (
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
            <span className="text-lg">🧳</span>
            <div>
              <p className="text-xs font-semibold">Pack hospital bag</p>
              <p className="text-[10px] text-muted-foreground">Baby could arrive any time now — be prepared!</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50">
          <span className="text-lg">📅</span>
          <div>
            <p className="text-xs font-semibold">Due date: {format(dueDate, 'MMMM d, yyyy')}</p>
            <p className="text-[10px] text-muted-foreground">{daysUntilDue > 0 ? `${daysUntilDue} days to go` : 'Any day now!'}</p>
          </div>
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
