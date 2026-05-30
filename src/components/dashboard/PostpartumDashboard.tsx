import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import {
  Baby,
  Calendar as CalendarIcon,
  Heart,
  AlertCircle,
  CheckCircle2,
  Activity,
  Moon,
  Apple,
  Droplet,
} from 'lucide-react';
import { differenceInDays, differenceInWeeks, format, parseISO, addDays } from 'date-fns';
import PostpartumFeedingTracker from './PostpartumFeedingTracker';
import PostpartumLochiaCard from './PostpartumLochiaCard';
import PostpartumPelvicFloor from './PostpartumPelvicFloor';
import PostpartumNutrition from './PostpartumNutrition';

// Postpartum-mode dashboard.
//
// Built to cover the first 12 months after birth — the period
// where the body, mood, and routine are still recalibrating. The
// app already handles many of the relevant signals (sleep, mood,
// symptoms) generically, so this dashboard is mostly:
//   1. Anchoring around days/weeks since birth.
//   2. Surfacing time-bound clinical milestones (6-week visit,
//      lochia resolution window, mood-screening cues).
//   3. A recovery checklist the patient can tick off.
//
// Birth date lives in localStorage (same approach as DOB until the
// profiles schema picks up a column for it).

const lsKey = (userId: string) => `womanie_postpartum_birth_${userId}`;

const recoveryMilestonesKey = (userId: string) => `postpartum:${userId}:milestones`;

const ppdSelfCheckKey = (userId: string) => `postpartum:${userId}:ppd-checkin`;

interface RecoveryItem {
  id: string;
  label: string;
  weeksFrom: number;
  weeksTo: number;
  category: 'visit' | 'physical' | 'emotional' | 'baby';
  why: string;
}

const RECOVERY: RecoveryItem[] = [
  { id: 'pediatrician-2-3-days', label: 'First pediatrician check (2–3 days)', weeksFrom: 0, weeksTo: 1, category: 'baby', why: 'Newborn weight check + jaundice screen.' },
  { id: 'lactation-week-1', label: 'Lactation/feeding consult if you want one', weeksFrom: 0, weeksTo: 2, category: 'baby', why: 'Earliest help is the highest leverage if feeding is hard.' },
  { id: 'lochia-resolves', label: 'Lochia (postpartum bleeding) gradually lightens', weeksFrom: 1, weeksTo: 6, category: 'physical', why: 'Bleeding heavier than a soaked pad/hour or with large clots is not normal — call your provider.' },
  { id: 'pediatrician-1-2-weeks', label: '1–2 week newborn visit', weeksFrom: 1, weeksTo: 2, category: 'baby', why: 'Confirms baby has regained birth weight.' },
  { id: 'mood-check-2-weeks', label: 'Baby-blues / mood self-check (~2 weeks)', weeksFrom: 1, weeksTo: 3, category: 'emotional', why: 'Brief sad/tearful days are common. If they persist past 2 weeks → screen for PPD.' },
  { id: 'six-week-visit', label: '6-week postnatal visit (you, not baby)', weeksFrom: 5, weeksTo: 8, category: 'visit', why: 'Pelvic floor, mood, contraception, healing of any tear or incision.' },
  { id: 'iron-recheck', label: 'Iron recheck if you bled heavily', weeksFrom: 5, weeksTo: 12, category: 'physical', why: 'Low ferritin from delivery blood loss can linger — fatigue you might be blaming on the baby.' },
  { id: 'pelvic-floor', label: 'Pelvic floor exercises / PT referral', weeksFrom: 4, weeksTo: 16, category: 'physical', why: 'Light Kegels from week 2; PT if leaking, heaviness, or pain stays.' },
  { id: 'six-month-visit', label: '6-month wellness check (you)', weeksFrom: 22, weeksTo: 28, category: 'visit', why: 'Sleep, mood, thyroid (postpartum thyroiditis peaks ~3–6 months).' },
];

const PPD_FLAGS = [
  'Mood low or hopeless most of the time for more than two weeks',
  'Crying often without a clear reason',
  'Trouble bonding with the baby, or scary thoughts about the baby',
  'Sleep problems beyond the obvious (can\'t sleep even when baby sleeps)',
  'Loss of interest in things you usually enjoy',
  'Thoughts of harming yourself or the baby — call your provider or a crisis line immediately',
];

const WELLNESS_TIPS = [
  { icon: Apple, label: 'Eat regularly — your body needs more calories during recovery, especially while breastfeeding.', color: 'text-green-600' },
  { icon: Moon, label: 'Nap when you can, even 20-minute stretches. Sleep deprivation is the single biggest postpartum risk factor.', color: 'text-indigo-500' },
  { icon: Heart, label: 'Accept help — meals, errands, baby-holding. The "village" is a real thing and not optional.', color: 'text-pink-500' },
  { icon: Droplet, label: 'Hydrate. Especially if breastfeeding (aim 2.5–3 L/day).', color: 'text-blue-500' },
];

interface PostpartumDashboardProps {
  onNavigateToDoctorChat?: () => void;
}

const PostpartumDashboard = ({ onNavigateToDoctorChat }: PostpartumDashboardProps = {}) => {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const [birthDateStr, setBirthDateStr] = useState<string>('');
  const [showBirthForm, setShowBirthForm] = useState(false);
  const [pendingDate, setPendingDate] = useState('');

  const [done, setDone] = useState<Record<string, boolean>>({});
  const [ppdLastCheck, setPpdLastCheck] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(lsKey(userId));
      if (raw) setBirthDateStr(raw);
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(recoveryMilestonesKey(userId));
      if (raw) setDone(JSON.parse(raw));
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(ppdSelfCheckKey(userId));
      if (raw) setPpdLastCheck(raw);
    } catch { /* ignore */ }
  }, [userId]);

  const birthDate = useMemo(() => {
    if (!birthDateStr) return null;
    const d = parseISO(birthDateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [birthDateStr]);

  const stats = useMemo(() => {
    if (!birthDate) return null;
    const days = differenceInDays(new Date(), birthDate);
    const weeks = differenceInWeeks(new Date(), birthDate);
    return { days, weeks };
  }, [birthDate]);

  const persistDone = (next: Record<string, boolean>) => {
    setDone(next);
    try { localStorage.setItem(recoveryMilestonesKey(userId), JSON.stringify(next)); } catch { /* ignore */ }
  };

  const setBirth = () => {
    if (!pendingDate) return;
    const d = parseISO(pendingDate);
    if (Number.isNaN(d.getTime())) return;
    // Reject future dates and dates more than 2 years past — those
    // are almost certainly typos.
    const days = differenceInDays(new Date(), d);
    if (days < 0 || days > 730) return;
    try { localStorage.setItem(lsKey(userId), pendingDate); } catch { /* ignore */ }
    setBirthDateStr(pendingDate);
    setShowBirthForm(false);
  };

  const ackPpd = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setPpdLastCheck(today);
    try { localStorage.setItem(ppdSelfCheckKey(userId), today); } catch { /* ignore */ }
  };

  // ── Empty state: we don't know when birth happened ──
  if (!birthDate) {
    return (
      <Card className="p-4 space-y-3 border-l-4 border-l-primary">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Baby className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">When was your baby born?</h3>
            <p className="text-xs text-muted-foreground">
              The postpartum dashboard is time-bound. We need a birth date to surface recovery milestones at the right weeks.
            </p>
          </div>
        </div>
        {showBirthForm ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                type="date"
                value={pendingDate}
                onChange={e => setPendingDate(e.target.value)}
                max={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
            <Button onClick={setBirth} size="sm" disabled={!pendingDate}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowBirthForm(false)}>Cancel</Button>
          </div>
        ) : (
          <Button onClick={() => setShowBirthForm(true)} size="sm" variant="outline">
            Set birth date
          </Button>
        )}
      </Card>
    );
  }

  // ── Active state ──
  const weeksPp = stats!.weeks;
  const daysPp = stats!.days;

  // Bucket recovery items by relevance to "now."
  const dueNow: RecoveryItem[] = [];
  const upcoming: RecoveryItem[] = [];
  const past: RecoveryItem[] = [];
  for (const r of RECOVERY) {
    if (done[r.id]) {
      past.push(r);
      continue;
    }
    if (weeksPp >= r.weeksFrom && weeksPp <= r.weeksTo) dueNow.push(r);
    else if (weeksPp < r.weeksFrom) upcoming.push(r);
    else past.push(r);
  }

  // Lochia window: clinically 4–6 weeks. We surface a callout while
  // the patient is still in the window, plus the "if it gets heavier,
  // call your provider" reminder always.
  const inLochiaWindow = weeksPp <= 6;

  // PPD check-in suggested every 2 weeks for the first 3 months,
  // then monthly to 6 months. Roll forward when the user acknowledges.
  const ppdSuggested = (() => {
    if (weeksPp > 26) return false;
    if (!ppdLastCheck) return true;
    const last = parseISO(ppdLastCheck);
    const sinceCheck = differenceInDays(new Date(), last);
    return weeksPp <= 12 ? sinceCheck >= 14 : sinceCheck >= 30;
  })();

  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="p-4 bg-gradient-to-br from-pink-50 via-primary/5 to-amber-50/40 dark:from-pink-900/10 dark:via-primary/10 dark:to-amber-900/10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Baby className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold">
              {daysPp <= 7
                ? `${daysPp} ${daysPp === 1 ? 'day' : 'days'} postpartum`
                : `Week ${weeksPp} postpartum`}
            </h2>
            <p className="text-xs text-muted-foreground">
              Baby born {format(birthDate, 'MMM d, yyyy')} ·{' '}
              {weeksPp <= 6 ? 'fourth-trimester window' : weeksPp <= 26 ? 'early postpartum recovery' : weeksPp <= 52 ? 'first-year transition' : 'one-year-plus postpartum'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setPendingDate(birthDateStr); setShowBirthForm(true); }}>
            Edit
          </Button>
        </div>

        {showBirthForm && (
          <div className="flex items-end gap-2 mt-3">
            <div className="flex-1">
              <Input type="date" value={pendingDate} onChange={e => setPendingDate(e.target.value)} max={format(new Date(), 'yyyy-MM-dd')} />
            </div>
            <Button onClick={setBirth} size="sm">Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowBirthForm(false)}>Cancel</Button>
          </div>
        )}
      </Card>

      {/* Lochia visualization — reads back the lochia field
          DailyLogging encodes into daily_health_signals.notes.
          Hides itself when no entries exist or past week 8. */}
      {inLochiaWindow && <PostpartumLochiaCard birthDate={birthDate} />}

      {/* Lochia callout (only in the relevant window) */}
      {inLochiaWindow && (
        <Card className="p-3 border-l-4 border-l-red-400 bg-red-50/40 dark:bg-red-900/10">
          <div className="flex items-start gap-2">
            <Droplet className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-medium mb-1">Postpartum bleeding (lochia)</p>
              <p className="text-muted-foreground leading-relaxed">
                Bleeding usually tapers from bright red → pink → brown → yellow over 4–6 weeks.
                Heavy bleeding (soaking a pad in an hour) or passing clots larger than a golf
                ball is <span className="font-medium text-red-700 dark:text-red-300">not normal</span> — call your provider.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Mood self-check */}
      {ppdSuggested && (
        <Card className="p-3 border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-900/10">
          <div className="flex items-start gap-2 mb-2">
            <Heart className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs flex-1">
              <p className="font-medium mb-1">Quick mood check-in</p>
              <p className="text-muted-foreground leading-relaxed mb-2">
                Postpartum depression affects 10–20% of new parents and can develop any time
                in the first year. Quick self-check — any of these for more than two weeks?
              </p>
              <ul className="space-y-1 list-disc list-inside text-foreground/80">
                {PPD_FLAGS.map((f, i) => (
                  <li key={i} className="leading-snug">{f}</li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-2">
                If any of those resonate, talk to your provider — PPD is highly treatable, and
                you don't have to push through it.
              </p>
            </div>
          </div>
          <div className="flex gap-2 ml-6">
            <Button size="sm" variant="outline" onClick={ackPpd}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              I'm doing OK
            </Button>
            {onNavigateToDoctorChat && (
              <Button size="sm" onClick={onNavigateToDoctorChat}>
                Ask the assistant
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Recovery checklist */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Recovery milestones
          </h3>
          <Badge variant="outline" className="text-[10px]">
            {past.length}/{RECOVERY.length} done
          </Badge>
        </div>
        <Progress value={(past.length / RECOVERY.length) * 100} className="h-1.5 mb-3" />

        {dueNow.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Due around now</p>
            <ul className="space-y-1.5">
              {dueNow.map(r => (
                <RecoveryRow key={r.id} item={r} done={!!done[r.id]} onToggle={() => persistDone({ ...done, [r.id]: !done[r.id] })} />
              ))}
            </ul>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Coming up</p>
            <ul className="space-y-1.5">
              {upcoming.slice(0, 3).map(r => (
                <RecoveryRow key={r.id} item={r} done={false} muted onToggle={() => persistDone({ ...done, [r.id]: true })} />
              ))}
            </ul>
          </div>
        )}

        {past.length > 0 && (
          <details>
            <summary className="text-[11px] uppercase tracking-wide text-muted-foreground cursor-pointer">
              Already past / done ({past.length})
            </summary>
            <ul className="space-y-1.5 mt-2">
              {past.map(r => (
                <RecoveryRow key={r.id} item={r} done={!!done[r.id]} muted onToggle={() => persistDone({ ...done, [r.id]: !done[r.id] })} />
              ))}
            </ul>
          </details>
        )}
      </Card>

      {/* Feeding tracker — shows for the first 6 months postpartum
          when feed timing is the most active question. After that
          the cadence stabilises and the tool isn't really needed. */}
      {weeksPp <= 26 && <PostpartumFeedingTracker />}

      {/* Pelvic floor habit — surfaces from week 2 (vaginal) /
          week 6 (C-section), most useful through ~6 months. */}
      {weeksPp >= 2 && weeksPp <= 26 && <PostpartumPelvicFloor />}

      {/* Nutrition reference — bucket-adapted to early / sustained /
          later postpartum windows. */}
      <PostpartumNutrition weeksPostpartum={weeksPp} />

      {/* Wellness tips */}
      <Card className="p-4">
        <h3 className="font-semibold flex items-center gap-2 mb-3">
          <Apple className="h-4 w-4 text-primary" />
          Take care of yourself
        </h3>
        <ul className="space-y-2">
          {WELLNESS_TIPS.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <t.icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${t.color}`} />
              <span className="text-muted-foreground leading-relaxed">{t.label}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

const CATEGORY_TONE: Record<RecoveryItem['category'], string> = {
  visit: 'text-primary',
  physical: 'text-emerald-600',
  emotional: 'text-pink-600',
  baby: 'text-amber-600',
};

interface RecoveryRowProps {
  item: RecoveryItem;
  done: boolean;
  muted?: boolean;
  onToggle: () => void;
}

const RecoveryRow = ({ item, done, muted, onToggle }: RecoveryRowProps) => (
  <li className={`flex items-start gap-2 ${muted ? 'opacity-70' : ''}`}>
    <button
      type="button"
      className={`flex-shrink-0 mt-0.5 h-4 w-4 rounded border ${done ? 'bg-primary border-primary' : 'border-border'} flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
      onClick={onToggle}
      aria-label={done ? `Mark "${item.label}" not done` : `Mark "${item.label}" done`}
    >
      {done && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
    </button>
    <div className="flex-1 text-xs">
      <p className={`leading-snug ${done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
        <span className={`${CATEGORY_TONE[item.category]} mr-1`}>·</span>
        {item.label}
      </p>
      <p className="text-[11px] text-muted-foreground leading-snug">{item.why}</p>
    </div>
  </li>
);

export default PostpartumDashboard;
