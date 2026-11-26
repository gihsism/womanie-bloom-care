import { useCallback, useEffect, useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { isNativeApp } from '@/lib/platform';
import {
  type PushPrefs, type PushSupport,
  currentSubscription, enablePush, fetchPushConfig, pushSupport,
  readPushEnv, serverPushState, updatePushPrefs,
} from '@/lib/push';

// Doctor Profile & settings -> "Booking alerts": a phone notification on
// THIS device when a patient books, moves or cancels a visit with you.
// Same Web Push setup as the patient reminders (Me -> Reminders); this
// switch only changes the "bookings" choice for this device, so a doctor
// who also uses Womanie as a patient keeps her own reminders as they are.

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'blocked'; why: Exclude<PushSupport, 'ok'> }
  | { kind: 'ready'; publicKey: string; prefs: PushPrefs | null };

const BLOCKED: Record<Exclude<PushSupport, 'ok'>, string> = {
  'ios-install': 'On iPhone and iPad, alerts work only in the installed app (iOS 16.4 or later): in Safari tap Share, then "Add to Home Screen", and switch them on from there.',
  'native-app': 'Alerts are not available in this app version yet. Open womanie.info in your browser to switch them on.',
  unsupported: 'This browser cannot show notifications from websites. Try Chrome, Edge, Firefox or Safari.',
  denied: 'Notifications are blocked for Womanie in your browser or phone settings. Allow them there, then reload this page.',
};

// A device switched on from here gets booking alerts only; the patient
// reminder types stay off until she turns them on in Me -> Reminders.
const DOCTOR_ONLY_PREFS: PushPrefs = { medicine: false, period: false, appointment: false, bookings: true, documents: false };

export default function BookingAlerts() {
  const { toast } = useToast();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const cfg = await fetchPushConfig();
    if (!cfg.enabled || !cfg.publicKey) { setState({ kind: 'unavailable' }); return; }
    const support = pushSupport(readPushEnv(isNativeApp()));
    if (support !== 'ok') { setState({ kind: 'blocked', why: support }); return; }
    const sub = await currentSubscription();
    const prefs = sub ? await serverPushState(sub) : null;
    setState({ kind: 'ready', publicKey: cfg.publicKey, prefs });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const on = state.kind === 'ready' && !!state.prefs?.bookings;

  const toggle = async (value: boolean) => {
    if (state.kind !== 'ready') return;
    setBusy(true);
    try {
      if (state.prefs) {
        const prefs = { ...state.prefs, bookings: value };
        if (!(await updatePushPrefs(prefs))) throw new Error('save');
        setState({ ...state, prefs });
      } else if (value) {
        const r = await enablePush(state.publicKey, DOCTOR_ONLY_PREFS);
        if (r === 'denied') { setState({ kind: 'blocked', why: 'denied' }); return; }
        if (r !== 'on') throw new Error('enable');
        setState({ ...state, prefs: DOCTOR_ONLY_PREFS });
      }
      toast({ title: value ? 'Booking alerts on for this device' : 'Booking alerts off for this device' });
    } catch {
      toast({ variant: 'destructive', title: 'Could not change booking alerts', description: 'Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="setup-alerts" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5" /> Booking alerts</CardTitle>
        <CardDescription>
          A notification on this phone or computer when a patient books, moves or cancels a visit with you.
          It shows only the time, never the patient's name.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />}
        {state.kind === 'unavailable' && (
          <p className="text-sm text-muted-foreground">Booking alerts are not available yet. New bookings always appear under Appointments.</p>
        )}
        {state.kind === 'blocked' && <p className="text-sm text-muted-foreground">{BLOCKED[state.why]}</p>}
        {state.kind === 'ready' && (
          <div className="flex items-center justify-between gap-4 p-4 border rounded-lg">
            <div>
              <Label htmlFor="booking-alerts">Alert me on this device</Label>
              <p className="text-sm text-muted-foreground">Switch it on separately on each device you use.</p>
            </div>
            <div className="flex items-center gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
              <Switch id="booking-alerts" checked={on} disabled={busy} onCheckedChange={v => void toggle(v)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
