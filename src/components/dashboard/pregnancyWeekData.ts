// Pregnancy week-by-week facts, kept apart from PregnancyTracker so the
// Home hero (PregnancyBodyMap) can read them without loading the whole
// tracker, its sub-tools and its illustration imports.

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

export interface WeekEntry {
  size: string;
  emoji: string;
  measurementType: 'crl' | 'chl';
  lengthMm: RangeMm | null;
  weightG: RangeG | null;
  developments: string[];
  tips: string[];
}

export const WEEK_DATA: Record<number, WeekEntry> = {
  // First trimester — CRL only; weights are sub-gram and not
  // clinically meaningful as a range, so we leave weightG null.
  4:  { size: 'Poppy seed',  emoji: '🌱', measurementType: 'crl', lengthMm: { low: 0.4, median: 1,   high: 2 }, weightG: null,                                  developments: ['Embryo implants in uterus', 'Placenta begins forming'], tips: ['Start prenatal vitamins', 'Avoid alcohol and smoking'] },
  5:  { size: 'Sesame seed', emoji: '🌱', measurementType: 'crl', lengthMm: { low: 1,   median: 2,   high: 4 }, weightG: null,                                  developments: ['Heart begins to beat', 'Neural tube forming'], tips: ['Schedule your first prenatal visit', 'Stay hydrated'] },
  6:  { size: 'Lentil',      emoji: '🫘', measurementType: 'crl', lengthMm: { low: 3,   median: 5,   high: 8 }, weightG: null,                                  developments: ['Nose, mouth, ears forming', 'Heart beats 110 times/min'], tips: ['Manage morning sickness with small meals', 'Get plenty of rest'] },
  7:  { size: 'Blueberry',   emoji: '🫐', measurementType: 'crl', lengthMm: { low: 8,   median: 11,  high: 14 }, weightG: null,                                 developments: ['Arms and legs developing', 'Brain growing rapidly'], tips: ['Eat folate-rich foods', 'Start gentle exercise routine'] },
  8:  { size: 'Raspberry',   emoji: '🍇', measurementType: 'crl', lengthMm: { low: 13,  median: 17,  high: 22 }, weightG: { low: 0.5, median: 1,   high: 2 },    developments: ['Fingers and toes forming', 'Baby starts moving (you cannot feel it yet)'], tips: ['Wear comfortable clothing', 'Stay active with walks'] },
  9:  { size: 'Cherry',      emoji: '🍒', measurementType: 'crl', lengthMm: { low: 20,  median: 25,  high: 31 }, weightG: { low: 1,   median: 2,   high: 3 },    developments: ['All essential organs have begun forming', 'Tiny muscles begin to work'], tips: ['Consider prenatal yoga', 'Eat balanced meals'] },
  10: { size: 'Strawberry',  emoji: '🍓', measurementType: 'crl', lengthMm: { low: 28,  median: 33,  high: 41 }, weightG: { low: 2,   median: 4,   high: 6 },    developments: ['Vital organs formed and starting to work', 'Fingernails start to develop'], tips: ['Schedule nuchal translucency scan', 'Monitor weight gain'] },
  11: { size: 'Fig',         emoji: '🫒', measurementType: 'crl', lengthMm: { low: 38,  median: 45,  high: 53 }, weightG: { low: 5,   median: 7,   high: 11 },   developments: ['Bones beginning to harden', 'Baby can open and close fists'], tips: ['Second trimester approaching', 'Energy levels may improve soon'] },
  12: { size: 'Lime',        emoji: '🍋', measurementType: 'crl', lengthMm: { low: 50,  median: 58,  high: 67 }, weightG: { low: 10,  median: 14,  high: 20 },   developments: ['Reflexes developing', 'Intestines moving into abdomen'], tips: ['End of first trimester!', 'Risk of miscarriage drops significantly'] },
  13: { size: 'Peach',       emoji: '🍑', measurementType: 'crl', lengthMm: { low: 64,  median: 73,  high: 84 }, weightG: { low: 18,  median: 23,  high: 30 },   developments: ['Fingerprints forming', 'Vocal cords developing'], tips: ['Welcome to second trimester', 'You may start showing'] },

  // Second + third trimester — CHL (head-to-heel) and Hadlock-derived
  // estimated fetal weight medians + ±15% envelope.
  14: { size: 'Lemon',       emoji: '🍋', measurementType: 'chl', lengthMm: { low: 130, median: 147, high: 165 }, weightG: { low: 73,    median: 93,    high: 113 },   developments: ['Sucking and swallowing reflexes', 'Lanugo (fine hair) covering body'], tips: ['Second-trimester energy may return', 'Stay hydrated; aim for 8+ glasses water'] },
  15: { size: 'Apple',       emoji: '🍎', measurementType: 'chl', lengthMm: { low: 150, median: 167, high: 184 }, weightG: { low: 92,    median: 117,   high: 142 },   developments: ['Can sense light through closed eyelids', 'Forming taste buds'], tips: ['A comfortable bra and loose clothes help now', 'Mid-pregnancy ultrasound coming up'] },
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
  27: { size: 'Lettuce',     emoji: '🥬', measurementType: 'chl', lengthMm: { low: 329, median: 366, high: 403 }, weightG: { low: 828,   median: 1055,  high: 1282 },  developments: ['Brain tissue developing rapidly', 'Recognises mother\'s voice'], tips: ['Glucose test and Tdap usually around now', 'Plan parental leave logistics'] },
  28: { size: 'Eggplant',    emoji: '🍆', measurementType: 'chl', lengthMm: { low: 339, median: 376, high: 413 }, weightG: { low: 949,   median: 1210,  high: 1471 },  developments: ['Eyes can open and close', 'Baby may dream (REM sleep)'], tips: ['Third trimester begins', 'Monitor for swelling'] },
  29: { size: 'Butternut squash', emoji: '🎃', measurementType: 'chl', lengthMm: { low: 348, median: 386, high: 425 }, weightG: { low: 1082,  median: 1379,  high: 1676 },  developments: ['Bone marrow producing red blood cells', 'Stronger kicks'], tips: ['Watch for signs of GD or preeclampsia', 'Sleep with extra pillow support'] },
  30: { size: 'Cabbage',     emoji: '🥬', measurementType: 'chl', lengthMm: { low: 360, median: 399, high: 439 }, weightG: { low: 1224,  median: 1559,  high: 1894 },  developments: ['Brain growing fast', 'Lanugo (fine body hair) starting to thin'], tips: ['Plan hospital bag essentials', 'Regular antenatal checks now'] },
  31: { size: 'Coconut',     emoji: '🥥', measurementType: 'chl', lengthMm: { low: 371, median: 411, high: 452 }, weightG: { low: 1374,  median: 1751,  high: 2128 },  developments: ['All five senses developed', 'Eyes can track light'], tips: ['Watch fetal movement — should stay regular', 'Antenatal pelvic-floor work'] },
  32: { size: 'Squash',      emoji: '🎃', measurementType: 'chl', lengthMm: { low: 382, median: 424, high: 466 }, weightG: { low: 1532,  median: 1953,  high: 2374 },  developments: ['Practising breathing movements', 'Bones fully developed but still soft'], tips: ['Start birth plan', 'Pack hospital bag'] },
  33: { size: 'Pineapple',   emoji: '🍍', measurementType: 'chl', lengthMm: { low: 393, median: 437, high: 481 }, weightG: { low: 1696,  median: 2162,  high: 2628 },  developments: ['Skull bones still flexible to ease birth', 'Antibodies passing from mother'], tips: ['Discuss labour signs with care provider', 'Plan postnatal support'] },
  34: { size: 'Cantaloupe',  emoji: '🍈', measurementType: 'chl', lengthMm: { low: 405, median: 450, high: 495 }, weightG: { low: 1865,  median: 2377,  high: 2889 },  developments: ['Lungs nearly mature', 'Fingernails reach fingertips'], tips: ['Confirm hospital choice', 'Practise breathing/relaxation'] },
  35: { size: 'Honeydew',    emoji: '🍈', measurementType: 'chl', lengthMm: { low: 416, median: 462, high: 508 }, weightG: { low: 2036,  median: 2595,  high: 3154 },  developments: ['Kidneys fully developed', 'Liver starting to process waste'], tips: ['Watch for signs of labour', 'Final preparations time'] },
  36: { size: 'Honeydew melon', emoji: '🍈', measurementType: 'chl', lengthMm: { low: 427, median: 474, high: 521 }, weightG: { low: 2207,  median: 2813,  high: 3419 },  developments: ['Fat layers filling out', 'Head may engage in pelvis'], tips: ['Weekly check-ups now', 'Rest as much as possible'] },
  37: { size: 'Romaine',     emoji: '🥬', measurementType: 'chl', lengthMm: { low: 437, median: 486, high: 535 }, weightG: { low: 2376,  median: 3028,  high: 3680 },  developments: ['Considered "early term"', 'Practising sucking'], tips: ['Listen to your body', 'Final birth-plan review'] },
  38: { size: 'Pumpkin',     emoji: '🎃', measurementType: 'chl', lengthMm: { low: 448, median: 498, high: 548 }, weightG: { low: 2540,  median: 3236,  high: 3932 },  developments: ['Firm grasp reflex', 'Brain and lungs continue maturing'], tips: ['Full term!', 'Watch for signs of labour'] },
  39: { size: 'Mini-watermelon', emoji: '🍉', measurementType: 'chl', lengthMm: { low: 456, median: 507, high: 558 }, weightG: { low: 2696,  median: 3435,  high: 4174 },  developments: ['Brain still developing rapidly', 'Antibody supply boosted'], tips: ['Track contractions vs Braxton-Hicks', 'Stay hydrated; rest'] },
  40: { size: 'Watermelon',  emoji: '🍉', measurementType: 'chl', lengthMm: { low: 461, median: 512, high: 563 }, weightG: { low: 2840,  median: 3619,  high: 4398 },  developments: ['Ready to be born!', 'All organs mature and functioning'], tips: ['Due date week!', 'Stay calm and prepared'] },
};

export const getWeekData = (week: number) => {
  const keys = Object.keys(WEEK_DATA).map(Number).sort((a, b) => a - b);
  let bestKey = keys[0];
  for (const k of keys) {
    if (k <= week) bestKey = k;
    else break;
  }
  return WEEK_DATA[bestKey] || WEEK_DATA[4];
};
