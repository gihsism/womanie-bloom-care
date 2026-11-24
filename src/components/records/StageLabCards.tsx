import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import PregnancyLabInsights from '@/components/dashboard/PregnancyLabInsights';
import CycleLabInsights from '@/components/dashboard/CycleLabInsights';
import ModeLabInsights from '@/components/dashboard/ModeLabInsights';
import LabFreshnessCard from '@/components/dashboard/LabFreshnessCard';
import AmhAgeContext from '@/components/dashboard/AmhAgeContext';

// Records → Results: the lab cards for the user's current life stage.
// These used to sit on Home; they moved here so Home stays short. The
// per-stage choice is the same one Home made:
//   pregnancy          → PregnancyLabInsights, limited to THIS pregnancy
//   period / conceive  → CycleLabInsights
//   every other stage  → ModeLabInsights
// plus "Worth rechecking" (LabFreshnessCard) and the egg-reserve-for-age
// context (AmhAgeContext). Every card hides itself when it has nothing
// to show.

interface StageLabCardsProps {
  mode: LifeStage;
  /** Start of the current pregnancy (pregnancyStart(dueDate)); null otherwise. */
  labSince: Date | null;
  /** True when the page already shows its own primary upload button: then
   *  the empty "Upload blood tests" card hides (one upload button per page). */
  hideUploadCard?: boolean;
}

export default function StageLabCards({ mode, labSince, hideUploadCard = false }: StageLabCardsProps) {
  return (
    <div className="space-y-6 [&>*]:!mb-0 empty:hidden">
      {mode === 'pregnancy' ? (
        <PregnancyLabInsights since={labSince} hideUploadCard={hideUploadCard} />
      ) : mode === 'menstrual-cycle' || mode === 'conception' ? (
        <CycleLabInsights mode={mode} hideUploadCard={hideUploadCard} />
      ) : (
        <ModeLabInsights mode={mode} hideUploadCard={hideUploadCard} />
      )}
      <LabFreshnessCard mode={mode} />
      <AmhAgeContext mode={mode} />
    </div>
  );
}
