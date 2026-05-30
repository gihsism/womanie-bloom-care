import { addDays } from 'date-fns';
import { db } from '@/integrations/db/client';
import type { OnboardingData } from '@/contexts/OnboardingContext';

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
// - DOB / height / weight / blood type: no schema column yet, so
//   parked in per-user localStorage under `womanie_basic_info_<id>`.
//   When the schema lands, swap this localStorage path for an
//   /api/db upsert without changing callers.

interface UserShape {
  id: string;
}

// Map the onboarding-side life stage (broad, user-facing) to the
// dashboard's life-stage key (8 modes). Returns null when we can't
// determine — caller defaults to 'menstrual-cycle'.
function deriveLifeStage(data: OnboardingData): string | null {
  const stage = data.lifeStage?.stage;
  if (!stage) return null;
  if (stage === 'pre-menstrual') return 'pre-menstrual';
  if (stage === 'pregnant') return 'pregnancy';
  if (stage === 'postpartum') return 'postpartum';
  if (stage === 'menopause') return 'menopause';
  if (stage === 'trying-to-conceive') return 'conception';
  if (stage === 'regular-cycle') {
    const focus = data.regularCycle?.mainFocus;
    if (focus === 'contraception') return 'contraception';
    if (focus === 'conception') return 'conception';
    if (focus === 'ivf') return 'ivf';
    return 'menstrual-cycle';
  }
  return null;
}

function derivePregnancyDueDate(data: OnboardingData): Date | null {
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

export async function commitOnboarding(user: UserShape, data: OnboardingData): Promise<void> {
  if (!user?.id) return;

  // --- profiles upsert ---
  const profileUpdate: Record<string, unknown> = { id: user.id };
  const lifeStage = deriveLifeStage(data);
  if (lifeStage) profileUpdate.life_stage = lifeStage;

  const dueDate = derivePregnancyDueDate(data);
  if (dueDate) profileUpdate.pregnancy_due_date = dueDate.toISOString().split('T')[0];

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

  // --- period_tracking seed ---
  // Take whichever last-period field is set across the relevant forms,
  // fall back to nothing rather than guessing.
  const regularCycleStart = data.regularCycle?.lastPeriodStart
    ? new Date(data.regularCycle.lastPeriodStart)
    : null;
  const conceptionCycleStart = data.tryingToConceive?.lastPeriodStart
    ? new Date(data.tryingToConceive.lastPeriodStart)
    : null;
  const lastPeriodStart = regularCycleStart ?? conceptionCycleStart;
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
          period_start_date: lastPeriodStart.toISOString().split('T')[0],
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
      const iso = new Date(ppBirth).toISOString().split('T')[0];
      localStorage.setItem(`womanie_postpartum_birth_${user.id}`, iso);
    } catch { /* ignore */ }
  }

  // --- localStorage fallback for unschematized basic info ---
  const basic = data.basicInfo;
  if (basic && (basic.dateOfBirth || basic.height || basic.weight || basic.bloodType)) {
    try {
      localStorage.setItem(
        `womanie_basic_info_${user.id}`,
        JSON.stringify({
          dateOfBirth: basic.dateOfBirth ? new Date(basic.dateOfBirth).toISOString().split('T')[0] : null,
          heightCm: basic.height || null,
          weightKg: basic.weightUnit === 'kg' ? basic.weight : basic.weight ? basic.weight * 0.453592 : null,
          bloodType: basic.bloodType || null,
        })
      );
    } catch {
      // Quota / private mode — silently ignore.
    }
  }
}
