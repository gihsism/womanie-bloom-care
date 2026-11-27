import { Card } from '@/components/ui/card';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { hormoneKeyForTitle, type HormoneKey } from '@/lib/hormone-reference';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { differenceInDays, parseISO, formatDistanceToNowStrict } from 'date-fns';
import { Clock, AlertCircle } from 'lucide-react';

// "When did you last check…" prompts.
//
// Patients with chronic-tracking concerns (thyroid, PCOS, fertility,
// menopause) often forget when their last labs were done. We have
// every lab the user uploaded with date_recorded — surfacing the gap
// for the labs that matter for their mode lets them book a recheck
// before things drift.
//
// Recommended intervals are conservative (longer than minimal best
// practice) so the card flags genuinely stale labs, not routine
// monitoring.

type Mode = 'menstrual-cycle' | 'pre-menstrual' | 'contraception' | 'conception' | 'pregnancy' | 'ivf' | 'menopause' | 'post-menopause' | string;

interface LabFreshnessCardProps {
  mode: Mode;
}

// Per-mode labs to surface. Number = recommended max gap in months
// before a recheck nudge fires. These are Womanie's own reminder
// intervals, not guideline intervals: USPSTF finds too little evidence to
// screen the thyroid of women without symptoms, so the reasons below say
// why a value matters rather than calling a recheck "routine". FSH is not
// listed for menopause: NICE NG23 (2015, updated 2024) and The Menopause
// Society say not to use FSH to diagnose menopause after 45. AMH is not
// listed for conception: ASRM says AMH does not predict natural fertility,
// so a yearly AMH nudge while trying to conceive had no source.
// Pregnancy LOWERS the upper TSH limit (ATA 2017: about 4.0 mIU/L).
const MODE_TARGETS: Record<string, Array<{ key: HormoneKey; label: string; monthsBeforeNudge: number; reason: string }>> = {
  conception: [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 12, reason: 'Thyroid affects cycle regularity and fertility.' },
    { key: 'prolactin', label: 'Prolactin', monthsBeforeNudge: 18, reason: 'Elevated levels can suppress ovulation.' },
  ],
  ivf: [
    { key: 'amh', label: 'AMH', monthsBeforeNudge: 6, reason: 'Clinics use AMH to plan the dose of stimulation medicines. Your clinic decides how recent it must be.' },
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 6, reason: 'Clinics usually check the thyroid before treatment. Your clinic decides how recent it must be.' },
    { key: 'fsh', label: 'FSH (day 3)', monthsBeforeNudge: 6, reason: 'Some clinics still check day-3 FSH before treatment. Your clinic decides whether you need it.' },
  ],
  'menstrual-cycle': [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 24, reason: 'Thyroid changes can affect your cycle. Worth rechecking if your cycle or energy changes.' },
  ],
  'pre-menstrual': [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 24, reason: 'Thyroid changes can feel like PMS (tiredness, low mood). Worth rechecking if symptoms change.' },
  ],
  contraception: [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 36, reason: 'Thyroid changes can affect your bleeding pattern. Worth rechecking if it changes.' },
  ],
  menopause: [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 12, reason: 'Thyroid and menopause symptoms overlap (tiredness, mood, heat), so a recent value helps tell them apart.' },
  ],
  'post-menopause': [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 24, reason: 'Thyroid problems become more common with age. Worth rechecking if you feel more tired or your weight changes.' },
  ],
  pregnancy: [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 3, reason: 'Thyroid targets are lower in pregnancy. Your doctor decides how often to check.' },
  ],
};

export default function LabFreshnessCard({ mode }: LabFreshnessCardProps) {
  const { user } = useAuth();
  const [latestByKey, setLatestByKey] = useState<Partial<Record<HormoneKey, string>>>({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('current_extracted_data')
      .select('title, date_recorded')
      .eq('user_id', user.id)
      .eq('data_type', 'lab_result');
    const map: Partial<Record<HormoneKey, string>> = {};
    for (const r of (data ?? []) as Array<{ title: string; date_recorded: string | null }>) {
      const key = hormoneKeyForTitle(r.title);
      if (!key || !r.date_recorded) continue;
      const prev = map[key];
      if (!prev || Date.parse(r.date_recorded) > Date.parse(prev)) {
        map[key] = r.date_recorded;
      }
    }
    setLatestByKey(map);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const items = useMemo(() => {
    const targets = MODE_TARGETS[mode];
    if (!targets) return [];
    const now = new Date();
    return targets.map(t => {
      const lastDate = latestByKey[t.key] ?? null;
      const daysSince = lastDate ? differenceInDays(now, parseISO(lastDate)) : null;
      const monthsSince = daysSince !== null ? daysSince / 30.4 : null;
      const overdue = monthsSince !== null && monthsSince > t.monthsBeforeNudge;
      const never = lastDate === null;
      return { ...t, lastDate, daysSince, monthsSince, overdue, never };
    });
  }, [latestByKey, mode]);

  // Only surface items that are overdue OR never measured. If
  // everything is fresh, hide entirely.
  const flagged = items.filter(i => i.overdue || i.never);

  if (!loaded) return null;
  if (flagged.length === 0) return null;
  if (!MODE_TARGETS[mode]) return null;

  return (
    <Card className="p-4 mb-4 border-l-4 border-l-blue-500 bg-blue-50/40 dark:bg-blue-900/10">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
          <Clock className="h-4 w-4 text-blue-700 dark:text-blue-300" />
        </div>
        <div>
          <p className="text-sm font-semibold">Worth rechecking</p>
          <p className="text-[11px] text-muted-foreground">
            App reminders for your current mode, not guideline intervals.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {flagged.map(item => (
          <li key={item.key} className="flex items-start gap-2 text-xs">
            <AlertCircle className="h-3.5 w-3.5 text-blue-700 dark:text-blue-300 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>
                <span className="font-medium text-foreground/90">{item.label}:</span>{' '}
                {item.never
                  ? <span>never uploaded</span>
                  : <span>last {formatDistanceToNowStrict(parseISO(item.lastDate!), { addSuffix: true })}</span>}
                <span className="text-muted-foreground"> · app reminder every {item.monthsBeforeNudge >= 12 ? `${item.monthsBeforeNudge / 12} yr` : `${item.monthsBeforeNudge} mo`}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">{item.reason}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
        Suggestions only — your clinician's interval is the one to follow. Hide a lab from this card by archiving older readings, or upload a fresher one to dismiss.
      </p>
    </Card>
  );
}
