import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { db } from '@/integrations/db/client';
import type { OnboardingData } from '@/contexts/OnboardingContext';
import { pushAccountData } from '@/lib/account-data';
import { ttcStartFromDuration } from '@/lib/ttc';
import { saveTtcStart } from '@/hooks/useTtcStart';

// Persists everything the user told us during the 3-step onboarding flow
// into the database. Was previously dropped on the floor:
// OnboardingSuccess called resetOnboarding() and went to /dashboard,
// which cleared the localStorage cache without ever writing to Neon.
//
// What lives where:
// - profiles.life_stage / pregnancy_due_date / ivf_start_date /
//   ivf_phase: real columns, written via /api/db upsert.
// - period_tracking: a row for the user's last period start + cycle
//   length, so the calendar isn't empty on first dashboard load.
// - DOB / height / weight / blood type: no profiles column, so kept in
//   per-user localStorage under `womanie_basic_info_<id>` and saved to
//   the account (user_app_data, see src/lib/account-data.ts).

// A calendar day picked on this device, as the date-only string the
// database stores. The date pickers give local midnight, so
// toISOString() (UTC) would save the day BEFORE for anyone east of
// Greenwich (Zürich: 20 Nov 00:00 = 19 Nov 23:00 UTC).
export function localYmd(d: Date | string): string {
  return format(new Date(d), 'yyyy-MM-dd');
}

interface UserShape {
  id: string;
}

// Map the onboarding-side life stage (broad, user-facing) to the
// dashboard's life-stage key (8 modes). Returns null when we can't
// determine — caller defaults to 'menstrual-cycle'.
export function deriveLifeStage(data: OnboardingData, now = new Date()): string | null {
  const stage = data.lifeStage?.stage;
  if (!stage) return null;
  if (stage === 'pre-menstrual') return 'pre-menstrual';
  if (stage === 'pregnant') return 'pregnancy';
  if (stage === 'postpartum') return 'postpartum';
  if (stage === 'menopause') {
    // 12 months or more since the last period = after menopause.
    const last = data.menopause?.lastPeriod;
    if (last && differenceInCalendarDays(now, new Date(last)) >= 365) return 'post-menopause';
    return 'menopause';
  }
  if (stage === 'trying-to-conceive') return 'conception';
  if (stage === 'contraception') return 'contraception';
  if (stage === 'ivf') return 'ivf';
  if (stage === 'regular-cycle') {
    const focus = data.regularCycle?.mainFocus;
    if (focus === 'contraception') return 'contraception';
    if (focus === 'conception') return 'conception';
    if (focus === 'ivf') return 'ivf';
    return 'menstrual-cycle';
  }
  return null;
}

export function derivePregnancyDueDate(data: OnboardingData): Date | null {
  const p = data.pregnancy;
  if (!p) return null;
  if (p.dateType === 'dueDate' && p.dueDate) return new Date(p.dueDate);
  if (p.dateType === 'lastPeriod' && p.lastPeriodDate) {
    return addDays(new Date(p.lastPeriodDate), 280);
  }
  if (p.dateType === 'currentWeek' && p.currentWeek) {
    const weeksLeft = Math.max(0, 40 - Number(p.currentWeek));
    return addDays(new Date(), weeksLeft * 7);
  }
  return null;
}

const MENO_IDS = ['hot-flashes', 'night-sweats', 'mood-changes', 'sleep-issues', 'weight-changes'];
const POST_IDS: Record<string, string> = { 'bone-health': 'bone-loss', 'mood-changes': 'mood' };

/** Onboarding concern ids -> MenopauseDashboard symptom ids for that scope. */
export function trackedSymptomsFromConcerns(concerns: string[], scope: 'meno' | 'post'): string[] {
  const ids = scope === 'meno'
    ? concerns.filter(c => MENO_IDS.includes(c))
    : concerns.map(c => POST_IDS[c]).filter((c): c is string => !!c);
  return [...new Set(ids)];
}

export async function commitOnboarding(user: UserShape, data: OnboardingData): Promise<void> {
  if (!user?.id) return;

  // --- profiles upsert ---
  const profileUpdate: Record<string, unknown> = { id: user.id };
  const lifeStage = deriveLifeStage(data);
  if (lifeStage) profileUpdate.life_stage = lifeStage;

  const dueDate = derivePregnancyDueDate(data);
  if (dueDate) profileUpdate.pregnancy_due_date = localYmd(dueDate);

  // IVF onboarding doesn't currently capture a phase, but if the user
  // picked the IVF main focus we still want them landed on the right
  // dashboard. ivf_start_date stays null until they enter the tracker.

  if (Object.keys(profileUpdate).length > 1) {
    try {
      await db.from('profiles').upsert(profileUpdate, { onConflict: 'id' });
    } catch (e) {
      console.error('onboarding: profile upsert failed', e);
    }
  }

  // --- TTC start (profiles.ttc_start_date, migration 025) ---
  // Separate from the profile upsert above, so a database without the
  // column yet cannot fail the life-stage save. Approximate: the answer is
  // a range ("3-6 months"); she can set the exact day on the stage page.
  const ttcStart = lifeStage === 'conception' ? ttcStartFromDuration(data.tryingToConceive?.tryingDuration) : null;
  if (ttcStart) await saveTtcStart(user.id, ttcStart);

  // --- period_tracking seed ---
  // Take whichever last-period field is set across the relevant forms,
  // fall back to nothing rather than guessing.
  const regularCycleStart = data.regularCycle?.lastPeriodStart
    ? new Date(data.regularCycle.lastPeriodStart)
    : null;
  const conceptionCycleStart = data.tryingToConceive?.lastPeriodStart
    ? new Date(data.tryingToConceive.lastPeriodStart)
    : null;
  // Menopause: the last period anchors the stage tracker on the menopause
  // page (it asks "Mark your last period" when there is none).
  const menopauseLast = data.lifeStage?.stage === 'menopause' && data.menopause?.lastPeriod
    ? new Date(data.menopause.lastPeriod)
    : null;
  const lastPeriodStart = regularCycleStart ?? conceptionCycleStart ?? menopauseLast;
  const cycleLength =
    data.regularCycle?.averageCycleLength ??
    data.tryingToConceive?.averageCycleLength ??
    28;

  if (lastPeriodStart) {
    try {
      // Use the date as a natural dedupe key — re-running onboarding
      // for the same start date shouldn't create a second row.
      await db.from('period_tracking').upsert(
        {
          user_id: user.id,
          period_start_date: localYmd(lastPeriodStart),
          cycle_length: cycleLength,
          period_end_date: null,
        },
        { onConflict: 'user_id,period_start_date' }
      );
    } catch (e) {
      console.error('onboarding: period_tracking upsert failed', e);
    }
  }

  // --- postpartum birth date (no schema column yet) ---
  // PostpartumDashboard reads `womanie_postpartum_birth_<userId>` to
  // anchor recovery milestones. When the user picks the postpartum
  // life stage and provides a birth date here, persist it so the
  // dashboard doesn't ask again.
  const ppBirth = data.postpartum?.birthDate;
  if (ppBirth) {
    try {
      const iso = localYmd(ppBirth);
      localStorage.setItem(`womanie_postpartum_birth_${user.id}`, iso);
    } catch { /* ignore */ }
  }

  // --- menopause concerns -> the symptoms the menopause page tracks ---
  // Same ids as MenopauseDashboard's lists; never replaces a list she
  // already has on this device.
  const concerns = data.lifeStage?.stage === 'menopause' ? data.menopause?.mainConcerns ?? [] : [];
  const tracked = trackedSymptomsFromConcerns(concerns, lifeStage === 'post-menopause' ? 'post' : 'meno');
  if (tracked.length) {
    const key = `menopause:${user.id}:${lifeStage === 'post-menopause' ? 'post' : 'meno'}:trackedSymptoms`;
    try {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(tracked));
        pushAccountData(user.id, key);
      }
    } catch { /* storage blocked */ }
  }

  // --- localStorage fallback for unschematized basic info ---
  const basic = data.basicInfo;
  if (basic && (basic.dateOfBirth || basic.height || basic.weight || basic.bloodType)) {
    try {
      localStorage.setItem(
        `womanie_basic_info_${user.id}`,
        JSON.stringify({
          dateOfBirth: basic.dateOfBirth ? localYmd(basic.dateOfBirth) : null,
          heightCm: basic.height || null,
          weightKg: basic.weightUnit === 'kg' ? basic.weight : basic.weight ? basic.weight * 0.453592 : null,
          bloodType: basic.bloodType || null,
        })
      );
      pushAccountData(user.id, `womanie_basic_info_${user.id}`);
    } catch {
      // Quota / private mode — silently ignore.
    }
  }
}
