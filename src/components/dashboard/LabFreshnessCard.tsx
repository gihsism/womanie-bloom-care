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
// before a recheck nudge fires. Sources: USPSTF / ASRM / NAMS general
// monitoring guidance; conservative thresholds.
const MODE_TARGETS: Record<string, Array<{ key: HormoneKey; label: string; monthsBeforeNudge: number; reason: string }>> = {
  conception: [
    { key: 'amh', label: 'AMH', monthsBeforeNudge: 12, reason: 'Ovarian reserve drifts year over year, especially after 35.' },
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 12, reason: 'Thyroid affects cycle regularity and fertility.' },
    { key: 'prolactin', label: 'Prolactin', monthsBeforeNudge: 18, reason: 'Elevated levels can suppress ovulation.' },
  ],
  ivf: [
    { key: 'amh', label: 'AMH', monthsBeforeNudge: 6, reason: 'Most clinics want AMH dated within 6 months of a cycle start.' },
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 6, reason: 'Active IVF cycles need recent thyroid status.' },
    { key: 'fsh', label: 'FSH (day 3)', monthsBeforeNudge: 6, reason: 'Day-3 FSH is part of standard IVF screening.' },
  ],
  'menstrual-cycle': [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 24, reason: 'Routine thyroid monitoring.' },
  ],
  'pre-menstrual': [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 24, reason: 'Routine thyroid monitoring.' },
  ],
  contraception: [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 36, reason: 'Routine thyroid monitoring.' },
  ],
  menopause: [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 12, reason: 'Thyroid + menopause symptoms overlap; periodic recheck advised.' },
    { key: 'fsh', label: 'FSH', monthsBeforeNudge: 12, reason: 'FSH trend is the key signal of menopause progression.' },
  ],
  'post-menopause': [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 24, reason: 'Routine thyroid monitoring.' },
  ],
  pregnancy: [
    { key: 'tsh', label: 'TSH', monthsBeforeNudge: 3, reason: 'Pregnancy raises TSH targets; periodic recheck per OB.' },
  ],
};

export default function LabFreshnessCard({ mode }: LabFreshnessCardProps) {
  const { user } = useAuth();
  const [latestByKey, setLatestByKey] = useState<Partial<Record<HormoneKey, string>>>({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('medical_extracted_data')
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
            Labs we'd expect to see refreshed for your current mode.
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
                <span className="text-muted-foreground"> · suggested every {item.monthsBeforeNudge >= 12 ? `${item.monthsBeforeNudge / 12} yr` : `${item.monthsBeforeNudge} mo`}</span>
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
