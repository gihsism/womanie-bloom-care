import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import SubPageHeader from '@/components/SubPageHeader';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useScrollToHash } from '@/hooks/useScrollToHash';
import { useStageProfile } from '@/hooks/useStageProfile';
import { stageLabel } from '@/lib/stageLabels';
import { moreFor, STAGE_PAGE } from '@/lib/todayItems';
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
// only the hero with its one action, Today, and one "Trackers & guides"
// row that leads here.

const anchor = 'scroll-mt-20 md:scroll-mt-28';

// Idea 4 "much more straightforward": the stage's main tracker is shown
// open; everything else is ONE row each ("Weight", "Blood pressure", …)
// that opens in place when tapped. A Home link to #weight opens that row.
// Closed rows don't mount their tracker, so the page also loads lighter.
function Section({ id, title, children }: { id?: string; title?: string; children: ReactNode }) {
  const { hash } = useLocation();
  const [open, setOpen] = useState(() => !title || (!!id && hash === `#${id}`));
  useEffect(() => {
    if (id && hash === `#${id}`) setOpen(true);
  }, [hash, id]);
  if (!title) return <div id={id} className={`mb-6 ${anchor}`}>{children}</div>;
  return (
    <div id={id} className={`mb-2 ${anchor}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex min-h-[3.5rem] w-full items-center gap-3 rounded-[1.25rem] border border-line bg-card px-4 text-left text-[17px] font-semibold hover:bg-muted/40"
      >
        <span className="flex-1">{title}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div className="mt-2 mb-4">{children}</div>}
    </div>
  );
}

/** "More to track" heading between the open tracker and the rows. */
function MoreTitle() {
  return <h2 className="section-title mt-2 mb-3">More to track</h2>;
}

export default function StagePage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const p = useStageProfile();
  const { hash } = useLocation();
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
            <MoreTitle />
            <Section id="guides" title="Food during IVF">
              <GuidesSection defaultOpen title="Guides: nutrition during IVF">
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
            <MoreTitle />
            <Section id="weight" title="Weight"><PregnancyWeightTracker dueDate={p.pregnancyDueDate} /></Section>
            <Section id="blood-pressure" title="Blood pressure"><BloodPressureTracker mode="pregnancy" /></Section>
            <Section id="vaccinations" title="Vaccinations"><PregnancyVaccinations dueDate={p.pregnancyDueDate} /></Section>
            <Section id="mood-check" title="Mood check"><EpdsScreener mode="pregnancy" /></Section>
            {p.pregnancyDueDate && (
              <Section id="calendar" title="Calendar"><CycleCalendar selectedMode={mode} pregnancyDueDate={p.pregnancyDueDate} /></Section>
            )}
            {p.pregnancyDueDate && (
              <Section id="guides" title="Food & movement">
                <GuidesSection defaultOpen title="Pregnancy guides: food & movement">
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
            <MoreTitle />
            <Section id="mood-check" title="Mood check"><EpdsScreener mode="postpartum" /></Section>
          </>
        )}

        {(mode === 'menopause' || mode === 'post-menopause') && (
          <>
            <Section><PerimenopauseStageCard mode={mode} /></Section>
            <Section id="symptoms"><MenopauseSymptomCalendar mode={mode} /></Section>
            <MoreTitle />
            <Section id="blood-pressure" title="Blood pressure"><BloodPressureTracker mode={mode} /></Section>
            <Section id="menopause-stage" title={mode === 'post-menopause' ? 'Life after menopause' : 'About menopause'}>
              <MenopauseDashboard isPostMenopause={mode === 'post-menopause'} onNavigateToDoctorChat={toChat} />
            </Section>
            <Section id="guides" title="Food">
              <GuidesSection defaultOpen title="Guides: nutrition in menopause">
                <MenopauseNutrition postmenopausal={mode === 'post-menopause'} />
              </GuidesSection>
            </Section>
          </>
        )}

        {mode === 'contraception' && (
          <Section id="contraception"><ContraceptionDashboard onNavigateToDoctorChat={toChat} /></Section>
        )}
        {(mode === 'pre-menstrual' || mode === 'contraception') && <MoreTitle />}

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
            <MoreTitle />
            <Section id="pms" title="Before your period"><PMSForecastCard mode={mode} /></Section>
            {mode === 'conception' && <Section title="Your chances"><FertilityOutlookCard mode={mode} /></Section>}
            {p.periodData && (
              <Section id="next-cycles" title="Next cycles">
                <FertilityForecast lastPeriodStart={p.periodData.lastPeriodStart} cycleLengthFallback={p.periodData.cycleLength} />
              </Section>
            )}
          </>
        )}

        {/* Cycle-phase guides for the stages that track a cycle. */}
        {p.periodData && (cycleMode || mode === 'pre-menstrual' || mode === 'contraception') && (
          <Section id="guides" title="Food & movement">
            <GuidesSection defaultOpen title="Guides for this cycle phase: food & movement">
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

        <Section id="medicines" title="Medicines & supplements"><MedicineLog stage={mode} /></Section>
        {/* Round 6: Home lost its "More for <stage>" list. The rows that
            lead off this page (results, charts, labour & birth) live here. */}
        {moreFor(mode, { weeksPregnant: p.weeksPregnant }).filter(r => !r.target.startsWith(STAGE_PAGE)).map(r => (
          <div key={r.label} className="mb-2">
            <button
              type="button"
              onClick={() => navigate(r.target)}
              className="flex min-h-[3.5rem] w-full items-center gap-3 rounded-[1.25rem] border border-line bg-card px-4 text-left text-[17px] font-semibold hover:bg-muted/40"
            >
              <span className="flex-1">{r.label}</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
        ))}
        {/* Room below the last sections, so a #medicines / #guides link can
            scroll its section to the top instead of leaving it under the
            tab bar at the bottom of a page that cannot scroll further. */}
        {hash && <div aria-hidden="true" data-testid="anchor-spacer" className="h-[60vh]" />}
      </main>
    </div>
  );
}
