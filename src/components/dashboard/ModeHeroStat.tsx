import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { onHealthDataChange } from '@/lib/data-events';
import {
  Calendar as CalendarIcon,
  Sparkles,
  Heart,
  Pill,
  Baby,
  FlaskConical,
  Sunset,
  Flower2,
  ThermometerSun,
} from 'lucide-react';
import { addDays, differenceInDays, subDays, format } from 'date-fns';

// Mode-aware "today at a glance" hero stat. Single row at the top of
// PatientDashboard that surfaces the one most important fact for the
// user's current life stage — instead of scattering it across cards
// further down (cycle day in TodayStatusCard, pill streak in
// ContraceptionDashboard, week count in PregnancyTracker).
//
// Data is pulled from sources already loaded by PatientDashboard
// (periodData / pregnancyDueDate / ivfPhase) plus targeted reads for
// mode-specific signals (pill streak from daily_health_signals notes,
// hot-flash count, pre-menstrual readiness from localStorage).

interface ModeHeroStatProps {
  selectedMode: string;
  periodData: { lastPeriodStart: Date; cycleLength: number } | null;
  pregnancyDueDate: Date | null;
  ivfStartDate: Date | null;
  ivfPhase: string | null;
}

const IVF_PHASE_LABELS: Record<string, string> = {
  prep: 'Preparation',
  stimulation: 'Ovarian Stimulation',
  trigger: 'Trigger Shot',
  retrieval: 'Egg Retrieval',
  fertilization: 'Fertilization & Culture',
  transfer: 'Embryo Transfer',
  tww: 'Two-Week Wait',
  beta: 'Beta HCG Test',
};

const TRIMESTER_FOR_WEEK = (week: number): string => {
  if (week < 13) return 'First trimester';
  if (week < 27) return 'Second trimester';
  return 'Third trimester';
};

const ModeHeroStat = ({
  selectedMode,
  periodData,
  pregnancyDueDate,
  ivfStartDate,
  ivfPhase,
}: ModeHeroStatProps) => {
  const { user } = useAuth();

  // Pill streak from daily_health_signals.notes, only loaded when we're
  // in contraception mode. Same encoding ContraceptionDashboard uses.
  const [pillStreak, setPillStreak] = useState<number | null>(null);
  // Hot-flash count for the last 7 days, menopause-only.
  const [hotFlashes7d, setHotFlashes7d] = useState<number | null>(null);
  // Pre-menstrual readiness checklist progress from localStorage.
  const [readinessPct, setReadinessPct] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadContraception = async () => {
      try {
        const cutoff = format(subDays(new Date(), 60), 'yyyy-MM-dd');
        const { data } = await db
          .from('daily_health_signals')
          .select('signal_date, notes')
          .eq('user_id', user.id)
          .gte('signal_date', cutoff)
          .order('signal_date', { ascending: false });
        if (cancelled) return;
        const map = new Map<string, string>();
        ((data as { signal_date: string; notes: string | null }[]) || []).forEach((r) => {
          const m = (r.notes || '').match(/Pill:\s*(on-time|late|missed)/i);
          if (m) map.set(r.signal_date, m[1].toLowerCase());
        });
        let streak = 0;
        let cursor = new Date();
        for (let i = 0; i < 365; i++) {
          const key = format(cursor, 'yyyy-MM-dd');
          const status = map.get(key);
          if (!status || status === 'missed') break;
          streak++;
          cursor = subDays(cursor, 1);
        }
        setPillStreak(streak);
      } catch {
        setPillStreak(null);
      }
    };

    const loadHotFlashes = async () => {
      try {
        const cutoff = format(subDays(new Date(), 7), 'yyyy-MM-dd');
        const { data } = await db
          .from('daily_health_signals')
          .select('notes')
          .eq('user_id', user.id)
          .gte('signal_date', cutoff);
        if (cancelled) return;
        let total = 0;
        ((data as { notes: string | null }[]) || []).forEach((r) => {
          const m = (r.notes || '').match(/Hot flashes:\s*(\d+)/i);
          if (m) total += parseInt(m[1], 10);
        });
        setHotFlashes7d(total);
      } catch {
        setHotFlashes7d(null);
      }
    };

    const loadReadiness = () => {
      try {
        const raw = localStorage.getItem(`pre-menstrual:${user.id}:checkedItems`);
        if (!raw) return setReadinessPct(0);
        const arr = JSON.parse(raw) as number[];
        const TOTAL = 6;
        setReadinessPct(Math.round((arr.length / TOTAL) * 100));
      } catch {
        setReadinessPct(null);
      }
    };

    if (selectedMode === 'contraception') loadContraception();
    if (selectedMode === 'menopause' || selectedMode === 'post-menopause') loadHotFlashes();
    if (selectedMode === 'pre-menstrual') loadReadiness();

    const unsub = onHealthDataChange(() => {
      if (selectedMode === 'contraception') loadContraception();
      if (selectedMode === 'menopause' || selectedMode === 'post-menopause') loadHotFlashes();
    });

    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedMode]);

  const today = new Date();

  // Compute per-mode hero content. Returning null hides the hero
  // entirely — we'd rather show nothing than a stale placeholder.
  type Hero = {
    icon: React.ReactNode;
    headline: string;
    detail?: string;
    tone: string;
  };
  const hero: Hero | null = (() => {
    switch (selectedMode) {
      case 'pre-menstrual': {
        return {
          icon: <Flower2 className="h-5 w-5 text-pink-500" />,
          headline: 'Learning about your body',
          detail:
            readinessPct !== null && readinessPct > 0
              ? `Readiness checklist: ${readinessPct}% complete`
              : 'Walk through the period-prep checklist when you\'re ready.',
          tone: 'bg-pink-50/70 dark:bg-pink-950/20 border-pink-200/60 dark:border-pink-800/40',
        };
      }
      case 'menstrual-cycle':
      case 'conception': {
        if (!periodData) {
          return {
            icon: <CalendarIcon className="h-5 w-5 text-primary" />,
            headline: 'Log your last period to start tracking',
            detail: 'Tap a day on the calendar below to mark when it started.',
            tone: 'bg-primary/5 border-primary/20',
          };
        }
        const cycleDay =
          Math.floor((today.getTime() - periodData.lastPeriodStart.getTime()) / 86_400_000) %
            periodData.cycleLength +
          1;
        const ovulationDay = periodData.cycleLength - 14;
        const fertileStartDay = Math.max(0, ovulationDay - 5);

        let phase = 'Luteal phase';
        if (cycleDay <= 5) phase = 'Menstrual phase';
        else if (cycleDay - 1 < fertileStartDay) phase = 'Follicular phase';
        else if (cycleDay - 1 <= ovulationDay) phase = 'Fertile window';
        else if (cycleDay >= periodData.cycleLength - 4) phase = 'Late luteal · PMS likely';

        let nextPeriod = addDays(periodData.lastPeriodStart, periodData.cycleLength);
        while (nextPeriod < today) nextPeriod = addDays(nextPeriod, periodData.cycleLength);
        const daysToPeriod = differenceInDays(nextPeriod, today);

        const ord =
          cycleDay === 1 ? 'st' : cycleDay === 2 ? 'nd' : cycleDay === 3 ? 'rd' : 'th';
        return {
          icon: <Sparkles className="h-5 w-5 text-primary" />,
          headline: `Day ${cycleDay}${ord} of your cycle · ${phase}`,
          detail:
            daysToPeriod === 0
              ? 'Period expected today'
              : daysToPeriod === 1
              ? 'Period expected tomorrow'
              : `Next period in ${daysToPeriod} days`,
          tone: 'bg-primary/5 border-primary/20',
        };
      }
      case 'contraception': {
        if (pillStreak === null) {
          return {
            icon: <Pill className="h-5 w-5 text-primary" />,
            headline: 'Log today\'s pill to start a streak',
            tone: 'bg-primary/5 border-primary/20',
          };
        }
        return {
          icon: <Pill className="h-5 w-5 text-primary" />,
          headline:
            pillStreak === 0
              ? 'Log today\'s pill to start a streak'
              : `${pillStreak}-day pill streak 🔥`,
          detail: pillStreak > 0 ? 'Tap Daily tracking below to log today.' : undefined,
          tone: 'bg-primary/5 border-primary/20',
        };
      }
      case 'ivf': {
        if (!ivfStartDate || !ivfPhase) {
          return {
            icon: <FlaskConical className="h-5 w-5 text-primary" />,
            headline: 'Set up IVF tracking',
            detail: 'Pick your current phase below to start logging treatments.',
            tone: 'bg-primary/5 border-primary/20',
          };
        }
        const day = differenceInDays(today, ivfStartDate) + 1;
        const label = IVF_PHASE_LABELS[ivfPhase] || ivfPhase;
        return {
          icon: <FlaskConical className="h-5 w-5 text-primary" />,
          headline: `${label} · Tracking day ${day}`,
          detail: 'Today\'s treatments and reminders are below.',
          tone: 'bg-primary/5 border-primary/20',
        };
      }
      case 'pregnancy': {
        if (!pregnancyDueDate) {
          return {
            icon: <Baby className="h-5 w-5 text-pink-500" />,
            headline: 'Add your due date to start tracking',
            tone: 'bg-pink-50/70 dark:bg-pink-950/20 border-pink-200/60 dark:border-pink-800/40',
          };
        }
        const daysToDue = differenceInDays(pregnancyDueDate, today);
        const totalDays = 280 - daysToDue; // ~40 weeks gestation
        const week = Math.max(0, Math.min(42, Math.floor(totalDays / 7)));
        const daysIntoWeek = Math.max(0, totalDays % 7);
        return {
          icon: <Baby className="h-5 w-5 text-pink-500" />,
          headline:
            week === 0
              ? 'Pregnancy starting'
              : `Week ${week}${daysIntoWeek ? ` + ${daysIntoWeek}d` : ''} · ${TRIMESTER_FOR_WEEK(week)}`,
          detail:
            daysToDue > 0
              ? `${Math.ceil(daysToDue / 7)} weeks to your due date`
              : daysToDue === 0
              ? 'Due date is today 💛'
              : `${Math.abs(daysToDue)} days past due date`,
          tone: 'bg-pink-50/70 dark:bg-pink-950/20 border-pink-200/60 dark:border-pink-800/40',
        };
      }
      case 'menopause': {
        if (hotFlashes7d === null) {
          return {
            icon: <ThermometerSun className="h-5 w-5 text-amber-600" />,
            headline: 'Your menopause journey',
            detail: 'Log symptoms daily to surface trends here.',
            tone: 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40',
          };
        }
        if (periodData) {
          const daysSince = differenceInDays(today, periodData.lastPeriodStart);
          return {
            icon: <ThermometerSun className="h-5 w-5 text-amber-600" />,
            headline: `${daysSince} ${daysSince === 1 ? 'day' : 'days'} since your last period`,
            detail:
              hotFlashes7d === 0
                ? 'No hot flashes logged this week'
                : `${hotFlashes7d} hot flash${hotFlashes7d === 1 ? '' : 'es'} logged in the last 7 days`,
            tone: 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40',
          };
        }
        return {
          icon: <ThermometerSun className="h-5 w-5 text-amber-600" />,
          headline:
            hotFlashes7d === 0
              ? 'No hot flashes logged this week'
              : `${hotFlashes7d} hot flash${hotFlashes7d === 1 ? '' : 'es'} this week`,
          detail: 'Track your daily count from the daily-log form.',
          tone: 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40',
        };
      }
      case 'post-menopause': {
        return {
          icon: <Sunset className="h-5 w-5 text-green-600" />,
          headline: 'Post-menopause wellness',
          detail: 'Focus areas: bones, heart, cognition. Screening guides below.',
          tone: 'bg-green-50/70 dark:bg-green-950/20 border-green-200/60 dark:border-green-800/40',
        };
      }
      default:
        return null;
    }
  })();

  if (!hero) return null;

  return (
    <Card className={`p-4 mb-4 border ${hero.tone}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-background/60 flex items-center justify-center flex-shrink-0">
          {hero.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{hero.headline}</p>
          {hero.detail && (
            <p className="text-xs text-muted-foreground truncate">{hero.detail}</p>
          )}
        </div>
        <Heart className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
      </div>
    </Card>
  );
};

export default ModeHeroStat;
