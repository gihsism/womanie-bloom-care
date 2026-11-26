import { lazy, Suspense, useDeferredValue, useEffect, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useScrollToHash } from '@/hooks/useScrollToHash';
import { useStageProfile } from '@/hooks/useStageProfile';
import { stageLabel } from '@/lib/stageLabels';
import PregnancyVaccinations from '@/components/dashboard/PregnancyVaccinations';
import PregnancyNutrition from '@/components/dashboard/PregnancyNutrition';
import PregnancyExercise from '@/components/dashboard/PregnancyExercise';
import MenopauseNutrition from '@/components/dashboard/MenopauseNutrition';
import IVFNutrition from '@/components/dashboard/IVFNutrition';
import MedicineLog from '@/components/dashboard/MedicineLog';
import GuidesSection from '@/components/dashboard/GuidesSection';
import CyclePhaseNutrition from '@/components/dashboard/CyclePhaseNutrition';
import CyclePhaseExercise from '@/components/dashboard/CyclePhaseExercise';
import PMSForecastCard from '@/components/dashboard/PMSForecastCard';
import FertilityOutlookCard from '@/components/dashboard/FertilityOutlookCard';
import FertilityForecast from '@/components/dashboard/FertilityForecast';
import CycleExplainedCard from '@/components/dashboard/CycleExplainedCard';
import EvidenceNote from '@/components/research/EvidenceNote';
import { evidenceSpec } from '@/lib/evidenceTopics';

// Each life stage renders a different set of trackers, and one person only
// ever sees one stage — so the stage-specific trackers load on demand
// instead of shipping all of them (~280 KB) to everyone who opens this page.
const CycleCalendar = lazy(() => import('@/components/dashboard/CycleCalendar'));
const PregnancyTracker = lazy(() => import('@/components/dashboard/PregnancyTracker'));
const PregnancyWeightTracker = lazy(() => import('@/components/dashboard/PregnancyWeightTracker'));
const BloodPressureTracker = lazy(() => import('@/components/dashboard/BloodPressureTracker'));
const IVFTracker = lazy(() => import('@/components/dashboard/IVFTracker'));
const PreMenstrualDashboard = lazy(() => import('@/components/dashboard/PreMenstrualDashboard'));
const MenopauseDashboard = lazy(() => import('@/components/dashboard/MenopauseDashboard'));
const PostpartumDashboard = lazy(() => import('@/components/dashboard/PostpartumDashboard'));
const EpdsScreener = lazy(() => import('@/components/dashboard/EpdsScreener'));
const MenopauseSymptomCalendar = lazy(() => import('@/components/dashboard/MenopauseSymptomCalendar'));
const MenopauseSymptomTrends = lazy(() => import('@/components/dashboard/MenopauseSymptomTrends'));
const PerimenopauseStageCard = lazy(() => import('@/components/dashboard/PerimenopauseStageCard'));
const ContraceptionDashboard = lazy(() => import('@/components/dashboard/ContraceptionDashboard'));

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
  // Deferred: when the stage changes after first paint (cached profile ->
  // server profile), keep showing the current trackers until the new
  // stage's code has loaded, instead of flashing the fallback (layout shift).
  const mode = useDeferredValue(p.selectedMode);
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
      <header className="border-b border-border bg-card px-4 py-4 flex items-center gap-2">
        <Link to="/dashboard" aria-label="Back to Home" className="tap-target flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="font-display text-[24px] font-normal leading-tight">{stageLabel(mode)}</h1>
      </header>

      <main className="w-full max-w-3xl mx-auto px-4 py-6">
        {/* One boundary for the whole stage: the trackers appear together
            once their code is in, instead of one by one pushing each other
            down (layout shift). useScrollToHash waits for the #anchor. */}
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
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
            <Section id="symptom-trends"><MenopauseSymptomTrends mode={mode} /></Section>
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
            <div id="cycle-explained" className={anchor}><CycleExplainedCard /></div>
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
        </Suspense>
      </main>
    </div>
  );
}
