import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useGo, type SheetKind } from '@/components/dashboard/HomeBlocks';
import LogSheet from '@/components/dashboard/LogSheet';
import HomeView from '@/components/home/HomeView';
import { useStageProfile } from '@/hooks/useStageProfile';
import { useTodaySignals } from '@/hooks/useTodaySignals';
import { useQuickLog } from '@/hooks/useQuickLog';
import { useHeaderFacts } from '@/hooks/useHeaderFacts';
import { todayItems, moreFor } from '@/lib/todayItems';
import { tilesFor } from '@/lib/quickLog/tiles';
import { headerFor } from '@/lib/stageHeader';
import { stageLabel } from '@/lib/stageLabels';
import { usePageTitle } from '@/hooks/usePageTitle';

// Home, idea 4 "Colour by stage" — the same template for every life stage:
//   1. the stage's coloured header: chip, one big status line, one
//      sentence, two small facts (lib/stageHeader.ts)
//   2. one-tap tiles, 3 per row: tapping LOGS (lib/quickLog), with an
//      Undo snackbar; hold or "…" opens the full form
//   3. Today: what needs her (lib/todayItems.ts) + what she logged, with times
//   4. "More for <stage>": at most 4 links to detail pages
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
  const quick = useQuickLog(mode, user?.id ?? null, { cycleLength: periodData?.cycleLength });
  const facts = useHeaderFacts({
    mode: mode ?? 'menstrual-cycle', userId: user?.id ?? '', stageName: mode ? stageLabel(mode) : '',
    periodData, dueDate: pregnancyDueDate, ivfStartDate, ivfPhase, signals, quick: quick.state, meds: quick.meds,
  });
  const { reloadPeriod } = p;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) navigate('/auth/login');
  }, [user, loading, navigate]);

  // A period started from a tile moves the cycle day: re-read it.
  useEffect(() => { void reloadPeriod?.(); }, [quick.state.periodStartedToday, reloadPeriod]);

  if (loading || !mode) {
    return (
      <div className="min-h-screen bg-background px-4 py-6 space-y-4">
        <Skeleton className="h-56 w-full rounded-3xl" />
        <Skeleton className="h-28 w-full rounded-3xl" />
        <Skeleton className="h-28 w-full rounded-3xl" />
      </div>
    );
  }
  if (!user) return null;

  const tiles = tilesFor(mode, { weeksPregnant, dailyPill: hasDailyPill(user.id), meds: quick.meds, hasBaby: quick.hasBaby });

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-2xl mx-auto px-4 pt-0 sm:pt-6 pb-8">
        <HomeView
          header={headerFor(mode, facts)}
          tiles={tiles}
          state={quick.state}
          items={todayItems(mode, signals)}
          stage={stageLabel(mode)}
          more={moreFor(mode, { weeksPregnant })}
          go={go}
          log={quick.log}
        />
      </div>

      <LogSheet open={sheet} onOpenChange={(o) => { if (!o) setSheet(null); }} mode={mode} weeksPregnant={weeksPregnant} />
    </div>
  );
};

export default PatientDashboard;
