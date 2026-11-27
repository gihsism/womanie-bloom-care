import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { isNativeApp } from '@/lib/platform';
import {
  currentSubscription, fetchPushConfig, pushSupport, readPushEnv, serverPushState, updatePushPrefs, type PushPrefs,
} from '@/lib/push';
import {
  formatCountdown, inAppTriggerAlert, isDateStr, isTimeStr, localDateTime, triggerReminderTimes, zonedTimeToUtc,
  type IvfPlan,
} from '@/lib/ivfJourney';
import type { IvfSaveState } from '@/hooks/useIvfPlan';
import { fmtClock, fmtMoment } from './ivfFormat';

// Trigger-shot timer (#ivf-trigger): she types the exact date and time her
// clinic gave her; a live countdown, an in-app alert 1 hour and 10 minutes
// before (while the app is open), and, if she opts in, phone reminders at
// the same moments through the push scheduler (api/_lib/push-schedule.ts,
// type 'ivf_trigger'). Saved in her timezone; the countdown is real time,
// so a clock change in between is handled.

type PushState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'off' }
  | { kind: 'on'; prefs: PushPrefs };

const ALERT_TEXT = {
  hour: { title: 'Trigger shot in about 1 hour', description: 'A good moment to get everything ready.' },
  ten: { title: 'Trigger shot in 10 minutes', description: 'Take your time and follow your clinic\'s instructions.' },
  now: { title: 'It\'s trigger time', description: 'Follow your clinic\'s instructions.' },
} as const;

interface Props {
  plan: IvfPlan;
  tz: string;
  serverOk: boolean;
  onSave: (p: IvfPlan) => Promise<IvfSaveState>;
}

export default function TriggerShotTimer({ plan, tz, serverOk, onSave }: Props) {
  const { toast } = useToast();
  const zone = plan.triggerTz ?? tz;
  const initial = plan.triggerAt ? localDateTime(new Date(plan.triggerAt), zone) : { date: '', time: '' };
  const [editing, setEditing] = useState(!plan.triggerAt);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [now, setNow] = useState(() => new Date());
  const [push, setPush] = useState<PushState>({ kind: 'loading' });
  const alerted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!plan.triggerAt) return;
    const l = localDateTime(new Date(plan.triggerAt), zone);
    setDate(l.date); setTime(l.time); setEditing(false);
  }, [plan.triggerAt, zone]);

  // Tick every second in the last hour, otherwise every 20 seconds.
  const msLeft = plan.triggerAt ? Date.parse(plan.triggerAt) - now.getTime() : null;
  const fast = msLeft != null && msLeft < 3_600_000 && msLeft > -60_000;
  useEffect(() => {
    if (!plan.triggerAt) return;
    const id = window.setInterval(() => setNow(new Date()), fast ? 1000 : 20_000);
    return () => window.clearInterval(id);
  }, [plan.triggerAt, fast]);

  // In-app alert while the app is open (the phone push covers it closed).
  useEffect(() => {
    const kind = inAppTriggerAlert(plan.triggerAt, now);
    if (!kind || !plan.triggerAt) return;
    const key = `${plan.triggerAt}:${kind}`;
    if (alerted.current.has(key)) return;
    alerted.current.add(key);
    toast(ALERT_TEXT[kind]);
  }, [now, plan.triggerAt, toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cfg = await fetchPushConfig();
      if (!cfg.enabled || pushSupport(readPushEnv(isNativeApp())) !== 'ok') { if (!cancelled) setPush({ kind: 'unavailable' }); return; }
      const sub = await currentSubscription();
      const prefs = sub ? await serverPushState(sub) : null;
      if (!cancelled) setPush(prefs ? { kind: 'on', prefs } : { kind: 'off' });
    })();
    return () => { cancelled = true; };
  }, []);

  const setPhoneReminder = async (on: boolean) => {
    if (push.kind !== 'on') return;
    const prefs = { ...push.prefs, ivf_trigger: on };
    setPush({ kind: 'on', prefs });
    if (!(await updatePushPrefs(prefs))) {
      setPush(push);
      toast({ variant: 'destructive', title: 'Could not save', description: 'Please try again.' });
    }
  };

  const save = async () => {
    if (!isDateStr(date) || !isTimeStr(time)) return;
    const at = zonedTimeToUtc(date, time, tz).toISOString();
    const stored = await onSave({ ...plan, triggerAt: at, triggerTz: tz });
    const shown = localDateTime(new Date(at), tz);
    toast({
      title: 'Trigger time saved',
      description: shown.time !== time
        ? `The clocks change that night, so ${time} does not exist; saved as ${shown.time}. Please check with your clinic.`
        : stored === 'device' ? 'Saved on this phone.' : undefined,
    });
  };

  const clear = async () => {
    await onSave({ ...plan, triggerAt: null, triggerTz: null });
    setDate(''); setTime(''); setEditing(true);
  };

  const reminders = plan.triggerAt ? triggerReminderTimes(plan.triggerAt) : [];
  const past = msLeft != null && msLeft <= 0;

  return (
    <Card className="p-4 space-y-3 scroll-mt-4 md:scroll-mt-28" id="ivf-trigger" data-testid="ivf-trigger">
      <h4 className="font-semibold flex items-center gap-2">
        <AlarmClock className="h-4 w-4 text-primary" />
        Trigger shot
      </h4>

      {plan.triggerAt && !editing && (
        <div className="space-y-1">
          <p className="label-mono">{past ? 'Given at' : 'Countdown'}</p>
          {!past && (
            <p className="font-display text-[40px] leading-none tabular-nums" aria-live={fast ? 'off' : 'polite'} data-testid="ivf-countdown">
              {formatCountdown(msLeft ?? 0)}
            </p>
          )}
          <p className="text-sm">
            {fmtMoment(plan.triggerAt, tz)}
            {zone !== tz && <span className="text-muted-foreground"> (entered as {fmtMoment(plan.triggerAt, zone)} {zone.replace('_', ' ')})</span>}
          </p>
          {past && (
            <p className="text-sm text-muted-foreground">Egg retrieval is usually about 36 hours after the trigger. Your clinic confirms the time.</p>
          )}
        </div>
      )}

      {editing ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Enter the exact date and time your clinic gave you. It is usually late in the evening, about 36 hours before the egg retrieval.</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="ivf-trigger-date" className="text-sm font-medium">Date</label>
              <Input id="ivf-trigger-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="ivf-trigger-time" className="text-sm font-medium">Time</label>
              <Input id="ivf-trigger-time" type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={!isDateStr(date) || !isTimeStr(time)} data-testid="ivf-trigger-save">Save time</Button>
            {plan.triggerAt && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Change time</Button>
          <Button size="sm" variant="ghost" onClick={() => void clear()}>Remove</Button>
        </div>
      )}

      {plan.triggerAt && !past && (
        <div className="border-t border-border pt-3 space-y-2">
          {push.kind === 'on' && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="ivf-trigger-push">Remind me on this phone</Label>
                <p className="text-xs text-muted-foreground">
                  At {reminders.map(r => fmtClock(r.at, tz)).join(' and ')} (1 hour and 10 minutes before), also at night.
                  {!serverOk && ' Needs your account copy, which is not available yet.'}
                </p>
              </div>
              <Switch id="ivf-trigger-push" checked={push.prefs.ivf_trigger === true} onCheckedChange={v => void setPhoneReminder(v)} />
            </div>
          )}
          {push.kind === 'off' && (
            <p className="text-xs text-muted-foreground">
              For a reminder when Womanie is closed, <Link to="/dashboard/settings#reminders" className="underline">turn on phone notifications</Link>, then switch on "IVF trigger shot".
            </p>
          )}
          <p className="text-xs text-muted-foreground">While the app is open you also get a reminder here. Setting an alarm on your phone as well is a good idea.</p>
        </div>
      )}
    </Card>
  );
}
