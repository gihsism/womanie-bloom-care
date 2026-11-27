import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarCheck, Check, Clock, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { onHealthDataChange } from '@/lib/data-events';
import { pushAccountData, useAccountDataVersion } from '@/lib/account-data';
import { gestationalWeek } from '@/lib/pregnancyVaccines';
import {
  PREGNANCY_SCHEDULE, PREG_CHECKUPS_KEY, SCHEDULE_ASK_LINE, SWISS_CHECKUPS_LINE, doneCount, glucoseTestInPregnancy, scheduleStatus,
  type CheckupState, type LabRow, type ScheduleStatusKind,
} from '@/lib/pregnancySchedule';

// Pregnancy: "Check-ups and scans". Only the steps whose timing a source in
// the research library states, each with its source; the rest goes to her
// midwife or doctor. She marks a step done (saved to her account, like the
// vaccination marks); a glucose test result in her records counts too.
// Same card layout as PregnancyVaccinations. Rules: lib/pregnancySchedule.ts.

const TONE: Record<ScheduleStatusKind, string> = {
  done: 'bg-primary/10 text-primary',
  now: 'bg-primary/5 text-primary',
  upcoming: 'bg-muted text-muted-foreground',
  earlier: 'bg-muted text-muted-foreground',
  anytime: 'bg-muted text-muted-foreground',
};

export default function PregnancyCheckupsCard({ dueDate }: { dueDate: Date | null }) {
  const { user } = useAuth();
  const [state, setState] = useState<CheckupState>({});
  const [labs, setLabs] = useState<LabRow[]>([]);

  const accountVersion = useAccountDataVersion([user ? PREG_CHECKUPS_KEY(user.id) : null]);
  useEffect(() => {
    if (!user) return;
    try {
      const raw = window.localStorage.getItem(PREG_CHECKUPS_KEY(user.id));
      const parsed = raw ? JSON.parse(raw) : null;
      setState(parsed && typeof parsed === 'object' ? parsed : {});
    } catch { /* ignore */ }
  }, [user, accountVersion]);

  const loadLabs = useCallback(async () => {
    if (!user) return;
    const { data } = await db.from('current_extracted_data').select('title, date_recorded')
      .eq('user_id', user.id).eq('data_type', 'lab_result');
    setLabs(Array.isArray(data) ? (data as LabRow[]) : []);
  }, [user]);
  useEffect(() => { void loadLabs(); }, [loadLabs]);
  useEffect(() => onHealthDataChange(loadLabs), [loadLabs]);

  const persist = (next: CheckupState) => {
    if (!user) return;
    try { window.localStorage.setItem(PREG_CHECKUPS_KEY(user.id), JSON.stringify(next)); } catch { /* ignore */ }
    pushAccountData(user.id, PREG_CHECKUPS_KEY(user.id));
    setState(next);
  };

  const week = gestationalWeek(dueDate);
  if (!dueDate || week === null) return null;
  const glucose = glucoseTestInPregnancy(labs, dueDate);
  const done = doneCount(week, state, glucose);

  return (
    <Card className="p-4 mb-4" data-testid="pregnancy-checkups">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <CalendarCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Check-ups and scans</p>
          <p className="text-[11px] text-muted-foreground">Week {week} · {done} of {PREGNANCY_SCHEDULE.length} marked done</p>
        </div>
      </div>

      <ul className="space-y-2">
        {PREGNANCY_SCHEDULE.map(item => {
          const st = scheduleStatus(item, week, state, glucose);
          return (
            <li key={item.key} className="border rounded-lg p-3 bg-card">
              <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
                <span className="text-sm font-semibold">{item.label}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${TONE[st.kind]}`}>{st.label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-1">
                <Clock className="h-3 w-3 inline mr-1 -mt-0.5" aria-hidden="true" />
                {item.when}
              </p>
              <p className="text-[11px] text-muted-foreground mb-1">{item.note}</p>
              <p className="text-[10px] text-muted-foreground mb-2">
                Source:{' '}
                <a href={item.source.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{item.source.label}</a>
              </p>
              {[item.swiss, item.swissMore].map((sw) => sw && (
                <p key={sw.source.url} className="text-[11px] text-muted-foreground mb-2">
                  {sw.note}{' '}
                  <span className="text-[10px]">
                    Source:{' '}
                    <a href={sw.source.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{sw.source.label}</a>
                  </span>
                </p>
              ))}
              {st.kind !== 'done' && (
                <Button
                  size="sm"
                  className="tap-target h-7 text-[11px]"
                  variant={st.kind === 'now' ? 'default' : 'outline'}
                  onClick={() => persist({ ...state, [item.key]: { doneDate: format(new Date(), 'yyyy-MM-dd') } })}
                >
                  <Check className="h-3 w-3 mr-1" aria-hidden="true" />
                  Mark done
                </Button>
              )}
              {st.kind === 'done' && st.from === 'mark' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] text-muted-foreground"
                  onClick={() => { const next = { ...state }; delete next[item.key]; persist(next); }}
                >
                  Undo
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-foreground mt-3 leading-relaxed">{SCHEDULE_ASK_LINE}</p>
      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
        {SWISS_CHECKUPS_LINE.note}{' '}
        <span className="text-[10px]">
          Source:{' '}
          <a href={SWISS_CHECKUPS_LINE.source.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{SWISS_CHECKUPS_LINE.source.label}</a>
        </span>
      </p>
      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed flex items-start gap-1.5">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <span>Only steps whose timing a source in the Womanie research library states are listed; the Swiss notes cite official Swiss sources (BAG, SGGG). Your marks are saved to your account.</span>
      </p>
    </Card>
  );
}
