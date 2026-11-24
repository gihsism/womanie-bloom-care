import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ModeHeroStat from '@/components/dashboard/ModeHeroStat';
import PregnancyBodyMap from '@/components/dashboard/PregnancyBodyMap';
import BabyBodyMap from '@/components/dashboard/BabyBodyMap';
import CycleDialHero from '@/components/dashboard/CycleDialHero';
import PillRingHero from '@/components/dashboard/PillRingHero';
import MenopauseBodyMap from '@/components/dashboard/MenopauseBodyMap';
import IVFTimelineHero from '@/components/dashboard/IVFTimelineHero';
import { TodayList, PrimaryButton, MoreForStage, useGo, type SheetKind } from '@/components/dashboard/HomeBlocks';
import LogSheet from '@/components/dashboard/LogSheet';
import { useStageProfile } from '@/hooks/useStageProfile';
import { useTodaySignals } from '@/hooks/useTodaySignals';
import { todayItems, primaryActionFor, moreFor } from '@/lib/todayItems';
import { stageLabel } from '@/lib/stageLabels';
import { usePageTitle } from '@/hooks/usePageTitle';

// Home: the same short template for every life stage —
//   1. greeting, with the stage as a quiet "· change" link (to Me)
//   2. one hero: one fact, one sentence, one "Details" link
//   3. Today: at most 3 ranked one-line rows (lib/todayItems.ts)
//   4. one filled button (opens the Log sheet or the stage's main tool)
//   5. "More for <stage>": at most 4 links to detail pages
// Everything else lives one tap away: the stage's trackers and guides on
// /dashboard/stage, results and charts on Records, visits on Visits,
// settings and medicines on Me.

// Contraception: a daily-pill method gets "Log today's pill"; other
// methods (patch, ring, IUD …) get "Log today". Same per-device setting the
// contraception card stores.
function hasDailyPill(userId: string): boolean {
  try {
    const raw = localStorage.getItem(`contraception:${userId}:method`);
    return !raw || JSON.parse(raw) === 'pill';
  } catch {
    return true;
  }
}

const PatientDashboard = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  usePageTitle('Home');
  const p = useStageProfile();
  const { selectedMode: mode, profile, periodData, pregnancyDueDate, ivfStartDate, ivfPhase, weeksPregnant } = p;
  const signals = useTodaySignals(periodData, profile?.full_name, { mode, pregnancyDueDate });
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const go = useGo(setSheet);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) navigate('/auth/login');
  }, [user, loading, navigate]);

  if (loading || !mode) {
    return (
      <div className="min-h-screen bg-background px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (!user) return null;

  const name = profile?.full_name;
  const firstName = name ? name.split(' ')[0] : 'there';

  const hero =
    mode === 'pregnancy' && pregnancyDueDate ? <PregnancyBodyMap dueDate={pregnancyDueDate} name={name} />
    : mode === 'postpartum' ? <BabyBodyMap />
    : (mode === 'menstrual-cycle' || mode === 'conception') && periodData
      ? <CycleDialHero lastPeriodStart={periodData.lastPeriodStart} cycleLength={periodData.cycleLength} name={name} mode={mode} />
    : mode === 'contraception' ? <PillRingHero name={name} />
    : mode === 'menopause' || mode === 'post-menopause' ? <MenopauseBodyMap name={name} mode={mode} />
    : mode === 'ivf' ? <IVFTimelineHero startDate={ivfStartDate} phase={ivfPhase} name={name} />
    : <ModeHeroStat selectedMode={mode} periodData={periodData} pregnancyDueDate={pregnancyDueDate} ivfStartDate={ivfStartDate} ivfPhase={ivfPhase} />;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-2xl mx-auto px-4 pt-6 pb-8">
        <header className="mb-5">
          <DashboardHeader userName={firstName} selectedMode={mode} />
        </header>

        {hero}

        <TodayList items={todayItems(mode, signals)} go={go} />

        <PrimaryButton action={primaryActionFor(mode, { weeksPregnant, dailyPill: hasDailyPill(user.id) })} go={go} />

        <MoreForStage stage={stageLabel(mode)} rows={moreFor(mode, { weeksPregnant })} go={go} />
      </div>

      <LogSheet open={sheet} onOpenChange={(o) => { if (!o) setSheet(null); }} mode={mode} weeksPregnant={weeksPregnant} />
    </div>
  );
};

export default PatientDashboard;
