// Pregnancy vaccination schedule (ACOG 2026 Maternal Immunization
// Schedule; CDC), with the Swiss timing added to each rationale where it
// differs (BAG-Bulletin 35/2025 pertussis, BAG-Bulletin 36/2025 flu,
// COVID-19 and RSV, both free on bag.admin.ch). Shared by the
// Pregnancy vaccinations card and Home's "Today" list. The patient's
// received / "not now" marks live in womanie_preg_vaccinations_{uid}
// (synced to the account, see lib/account-data.ts).

export interface Vaccine {
  key: string;
  label: string;
  fullName: string;
  windowStartWeek: number;
  windowEndWeek: number;
  rationale: string;
  cadence: 'every-pregnancy' | 'once-per-season' | 'as-indicated';
}

export const PREGNANCY_VACCINES: Vaccine[] = [
  {
    key: 'tdap',
    label: 'Tdap',
    fullName: 'Tetanus / Diphtheria / Pertussis booster',
    windowStartWeek: 27,
    windowEndWeek: 36,
    rationale:
      'Given every pregnancy regardless of prior shots — antibodies cross the placenta and protect baby from pertussis (whooping cough) in the first months before they can be vaccinated. In Switzerland the BAG (2025) advises one dose in every pregnancy, ideally in the second trimester.',
    cadence: 'every-pregnancy',
  },
  {
    key: 'flu',
    label: 'Flu',
    fullName: 'Seasonal influenza (inactivated)',
    windowStartWeek: 0,
    windowEndWeek: 40,
    rationale:
      'Recommended at any gestational age during flu season. Pregnant patients are at higher risk for severe flu; vaccination also passes protection to baby. In Switzerland the BAG (2025) advises it in any trimester and in the 4 weeks after birth, from mid-October until the flu season starts.',
    cadence: 'once-per-season',
  },
  {
    key: 'rsv',
    label: 'RSV (Abrysvo)',
    fullName: 'Maternal RSV (Pfizer Abrysvo)',
    windowStartWeek: 32,
    windowEndWeek: 36,
    rationale:
      'Single-dose maternal RSV vaccine during the recommended window passes antibodies to baby. Alternative is monoclonal antibody (nirsevimab) for the infant after birth — discuss with your doctor or midwife which path fits. In Switzerland the BAG (2025) advises it at weeks 32 to 36 if your due date falls between early October and end of March; you choose between this and the antibody for your baby after birth.',
    cadence: 'once-per-season',
  },
  {
    key: 'covid',
    label: 'COVID-19',
    fullName: 'COVID-19 (current formula)',
    windowStartWeek: 0,
    windowEndWeek: 40,
    rationale:
      'ACOG (2026) recommends the current COVID-19 vaccine in any trimester. Since 2025 the CDC leaves it to a decision with your doctor. Pregnancy raises the risk of severe COVID-19. In Switzerland the BAG (2025) advises one dose, preferably in the second or third trimester.',
    cadence: 'once-per-season',
  },
];

export interface VaccineStatus {
  receivedDate?: string; // yyyy-MM-dd
  declined?: boolean;
}

export type VaccineState = Record<string, VaccineStatus>;

export const PREG_VACCINES_KEY = (userId: string) => `womanie_preg_vaccinations_${userId}`;

/** Gestational week from the due date (null outside 0–320 days). */
export function gestationalWeek(dueDate: Date | null, now = new Date()): number | null {
  if (!dueDate) return null;
  const start = new Date(dueDate);
  start.setDate(start.getDate() - 280);
  const days = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  if (days < 0 || days > 320) return null;
  return Math.floor(days / 7);
}

/** Vaccines in their window this week and not yet marked received or "not now". */
export function vaccinesDueNow(state: VaccineState, week: number | null): Vaccine[] {
  if (week == null) return [];
  return PREGNANCY_VACCINES.filter(v =>
    !state[v.key]?.receivedDate && !state[v.key]?.declined && week >= v.windowStartWeek && week <= v.windowEndWeek);
}
