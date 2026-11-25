import { useEffect, type ReactNode } from 'react';
import SubPageHeader from '@/components/SubPageHeader';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useScrollToHash } from '@/hooks/useScrollToHash';
import { useStageProfile } from '@/hooks/useStageProfile';
import { stageLabel } from '@/lib/stageLabels';
import CycleCalendar from '@/components/dashboard/CycleCalendar';
import PregnancyTracker from '@/components/dashboard/PregnancyTracker';
import PregnancyWeightTracker from '@/components/dashboard/PregnancyWeightTracker';
import BloodPressureTracker from '@/components/dashboard/BloodPressureTracker';
import PregnancyVaccinations from '@/components/dashboard/PregnancyVaccinations';
import PregnancyNutrition from '@/components/dashboard/PregnancyNutrition';
import PregnancyExercise from '@/components/dashboard/PregnancyExercise';
import MenopauseNutrition from '@/components/dashboard/MenopauseNutrition';
import IVFNutrition from '@/components/dashboard/IVFNutrition';
import IVFTracker from '@/components/dashboard/IVFTracker';
import PreMenstrualDashboard from '@/components/dashboard/PreMenstrualDashboard';
import MenopauseDashboard from '@/components/dashboard/MenopauseDashboard';
import PostpartumDashboard from '@/components/dashboard/PostpartumDashboard';
import EpdsScreener from '@/components/dashboard/EpdsScreener';
import MedicineLog from '@/components/dashboard/MedicineLog';
import GuidesSection from '@/components/dashboard/GuidesSection';
import MenopauseSymptomCalendar from '@/components/dashboard/MenopauseSymptomCalendar';
import PerimenopauseStageCard from '@/components/dashboard/PerimenopauseStageCard';
import ContraceptionDashboard from '@/components/dashboard/ContraceptionDashboard';
import CyclePhaseNutrition from '@/components/dashboard/CyclePhaseNutrition';
import CyclePhaseExercise from '@/components/dashboard/CyclePhaseExercise';
import PMSForecastCard from '@/components/dashboard/PMSForecastCard';
import FertilityOutlookCard from '@/components/dashboard/FertilityOutlookCard';
import FertilityForecast from '@/components/dashboard/FertilityForecast';
import EvidenceNote from '@/components/research/EvidenceNote';
import { evidenceSpec } from '@/lib/evidenceTopics';

// /dashboard/stage — everything for the current life stage that used to be
// stacked on Home: the stage's big tracker (unchanged), its guides and the
// anchors Home links to (#cycle-calendar, #weight, #mood-check, #symptoms,
// #kick-counter, #contraction-timer, #medicines, #guides …). Home keeps
// only the hero, Today, one button and "More for <stage>".

const anchor = 'scroll-mt-4 md:scroll-mt-28';

function Section({ id, children }: { id?: string; children: ReactNode }) {
  return <div id={id} className={`mb-6 ${anchor}`}>{children}</div>;
}

export default function StagePage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const p = useStageProfile();
  const { hash } = useLocation();
  const guidesOpen = hash === '#guides';
  const mode = p.selectedMode;
  usePageTitle(mode ? stageLabel(mode) : 'Your stage');
  useScrollToHash(!!mode);

  useEffect(() => {
    if (!loading && !user) navigate('/auth/login');
  }, [user, loading, navigate]);

  if (loading || !mode) {
    return (
      <div className="min-h-screen bg-background px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (!user) return null;

  const toChat = () => navigate('/dashboard/ai-doctor');
  const weeks = p.weeksPregnant == null ? 0 : Math.min(42, p.weeksPregnant);
  const cycleMode = mode === 'menstrual-cycle' || mode === 'conception';

  return (
    <div className="min-h-screen bg-background">
      <SubPageHeader title={stageLabel(mode)} backTo="/dashboard" backLabel="Home" />

      <main className="w-full max-w-3xl mx-auto px-4 py-6">
        {mode === 'ivf' && (
          <>
            <Section id="ivf-tracker">
              <IVFTracker ivfStartDate={p.ivfStartDate} ivfPhase={p.ivfPhase} onSetIVFStart={p.setIVFStart} onUpdatePhase={p.updateIVFPhase} />
            </Section>
            <FertilityOutlookCard mode={mode} />
            <Section id="guides">
              <GuidesSection defaultOpen={guidesOpen} title="Guides: nutrition during IVF">
                <IVFNutrition phase={(p.ivfPhase as Parameters<typeof IVFNutrition>[0]['phase']) ?? null} />
              </GuidesSection>
            </Section>
          </>
        )}

        {mode === 'pregnancy' && (
          <>
            <Section>
              <PregnancyTracker
                dueDate={p.pregnancyDueDate}
                onSetDueDate={p.setPregnancyDue}
                onResetPregnancy={p.resetPregnancy}
                onSwitchToPostpartum={p.switchToPostpartum}
              />
            </Section>
            <Section id="weight"><PregnancyWeightTracker dueDate={p.pregnancyDueDate} /></Section>
            <Section id="blood-pressure"><BloodPressureTracker mode="pregnancy" /></Section>
            <Section id="vaccinations"><PregnancyVaccinations dueDate={p.pregnancyDueDate} /></Section>
            <Section id="mood-check"><EpdsScreener mode="pregnancy" /></Section>
            {p.pregnancyDueDate && (
              <Section id="calendar"><CycleCalendar selectedMode={mode} pregnancyDueDate={p.pregnancyDueDate} /></Section>
            )}
            {p.pregnancyDueDate && (
              <Section id="guides">
                <GuidesSection defaultOpen={guidesOpen} title="Pregnancy guides: food & movement">
                  <PregnancyNutrition weeksPregnant={weeks} />
                  <PregnancyExercise weeksPregnant={weeks} />
                </GuidesSection>
              </Section>
            )}
          </>
        )}

        {mode === 'pre-menstrual' && (
          <Section><PreMenstrualDashboard /></Section>
        )}

        {mode === 'postpartum' && (
          <>
            <Section id="recovery"><PostpartumDashboard onNavigateToDoctorChat={toChat} /></Section>
            <Section id="mood-check"><EpdsScreener mode="postpartum" /></Section>
          </>
        )}

        {(mode === 'menopause' || mode === 'post-menopause') && (
          <>
            <Section><PerimenopauseStageCard mode={mode} /></Section>
            <Section id="symptoms"><MenopauseSymptomCalendar mode={mode} /></Section>
            <Section id="blood-pressure"><BloodPressureTracker mode={mode} /></Section>
            <Section id="menopause-stage">
              <MenopauseDashboard isPostMenopause={mode === 'post-menopause'} onNavigateToDoctorChat={toChat} />
            </Section>
            <Section id="guides">
              <GuidesSection defaultOpen={guidesOpen} title="Guides: nutrition in menopause">
                <MenopauseNutrition postmenopausal={mode === 'post-menopause'} />
              </GuidesSection>
            </Section>
          </>
        )}

        {mode === 'contraception' && (
          <Section id="contraception"><ContraceptionDashboard onNavigateToDoctorChat={toChat} /></Section>
        )}

        {cycleMode && (
          <>
            <Section id="cycle-calendar">
              <CycleCalendar
                lastPeriodStart={p.periodData?.lastPeriodStart}
                cycleLength={p.periodData?.cycleLength ?? 28}
                periodLength={5}
                selectedMode={mode}
              />
            </Section>
            <div id="pms" className={anchor}><PMSForecastCard mode={mode} /></div>
            <FertilityOutlookCard mode={mode} />
            {p.periodData && (
              <Section id="next-cycles">
                <FertilityForecast lastPeriodStart={p.periodData.lastPeriodStart} cycleLengthFallback={p.periodData.cycleLength} />
              </Section>
            )}
          </>
        )}

        {/* Cycle-phase guides for the stages that track a cycle. */}
        {p.periodData && (cycleMode || mode === 'pre-menstrual' || mode === 'contraception') && (
          <Section id="guides">
            <GuidesSection defaultOpen={guidesOpen} title="Guides for this cycle phase: food & movement">
              <CyclePhaseNutrition mode={mode} />
              <CyclePhaseExercise mode={mode} />
            </GuidesSection>
            {mode === 'conception' && (
              <Card className="mt-4 px-4 py-1">
                <EvidenceNote specs={[evidenceSpec('cycle-timing', mode)]} className="" about="on timing" />
              </Card>
            )}
          </Section>
        )}

        {!p.periodData && (cycleMode || mode === 'pre-menstrual' || mode === 'contraception') && (
          <Section id="guides">
            <p className="text-sm text-muted-foreground">Log your last period to see guides for each part of your cycle.</p>
          </Section>
        )}

        <Section id="medicines"><MedicineLog stage={mode} /></Section>
        {/* Room below the last sections, so a #medicines / #guides link can
            scroll its section to the top instead of leaving it under the
            tab bar at the bottom of a page that cannot scroll further. */}
        {hash && <div aria-hidden="true" data-testid="anchor-spacer" className="h-[60vh]" />}
      </main>
    </div>
  );
}
