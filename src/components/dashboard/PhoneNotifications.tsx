import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { isNativeApp } from '@/lib/platform';
import {
  DEFAULT_PUSH_PREFS, type PushPrefs, type PushSupport,
  currentSubscription, disablePush, enablePush, fetchPushConfig, pushSupport,
  readPushEnv, sendTestPush, serverPushState, updatePushPrefs,
} from '@/lib/push';

// Me -> Reminders -> "Phone notifications": the opt-in that makes medicine
// times, period and visit reminders reach her when the app is closed.

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }               // server has no VAPID keys yet
  | { kind: 'blocked'; why: Exclude<PushSupport, 'ok'> }
  | { kind: 'off'; publicKey: string }
  | { kind: 'on'; publicKey: string; prefs: PushPrefs };

const TYPES: Array<{ key: keyof PushPrefs; label: string; hint: string }> = [
  { key: 'medicine', label: 'Medicine times', hint: 'At the times you set on each medicine, unless you already logged the dose' },
  { key: 'period', label: 'Period', hint: 'The day before your period is expected, and if it is a few days late' },
  { key: 'appointment', label: 'Visits', hint: 'The day before a visit' },
];

const BLOCKED_TEXT: Record<Exclude<PushSupport, 'ok'>, string> = {
  'ios-install': 'On iPhone and iPad, notifications work only in the installed app (iOS 16.4 or later). In Safari tap Share, then "Add to Home Screen", open Womanie from your Home Screen and switch them on here.',
  'native-app': 'Phone notifications are not available in this app version yet. Open womanie.info in your browser and add it to your Home Screen to get them.',
  unsupported: 'This browser cannot show notifications from websites. Try Chrome, Edge, Firefox or Safari, or add Womanie to your Home Screen.',
  denied: 'Notifications are blocked for Womanie in your browser or phone settings. Allow them there, then come back here.',
};

export default function PhoneNotifications() {
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
    setState(prefs ? { kind: 'on', publicKey: cfg.publicKey, prefs } : { kind: 'off', publicKey: cfg.publicKey });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const turnOn = async (publicKey: string) => {
    setBusy(true);
    const r = await enablePush(publicKey, DEFAULT_PUSH_PREFS);
    setBusy(false);
    if (r === 'on') {
      setState({ kind: 'on', publicKey, prefs: DEFAULT_PUSH_PREFS });
      toast({ title: 'Phone notifications on' });
    } else if (r === 'denied') {
      setState({ kind: 'blocked', why: 'denied' });
    } else {
      toast({ variant: 'destructive', title: 'Could not switch on notifications', description: 'Please try again.' });
    }
  };

  const turnOff = async (publicKey: string) => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setState({ kind: 'off', publicKey });
    toast({ title: 'Phone notifications off' });
  };

  const setPref = async (key: keyof PushPrefs, value: boolean) => {
    if (state.kind !== 'on') return;
    const prefs = { ...state.prefs, [key]: value };
    setState({ ...state, prefs });
    if (!(await updatePushPrefs(prefs))) {
      setState(state);
      toast({ variant: 'destructive', title: 'Could not save', description: 'Please try again.' });
    }
  };

  const test = async () => {
    setBusy(true);
    const ok = await sendTestPush();
    setBusy(false);
    toast(ok ? { title: 'Test sent', description: 'It should appear in a few seconds.' } : { variant: 'destructive', title: 'Test not delivered' });
  };

  return (
    <Card data-testid="phone-notifications">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4" /> Phone notifications</CardTitle>
        <CardDescription>Reminders that reach you when Womanie is closed. Nothing is sent between 22:00 and 07:00 except medicine times you set yourself.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.kind === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {state.kind === 'unavailable' && (
          <p className="text-sm text-muted-foreground">Phone notifications are not available yet. Your reminders still show on Home when you open the app.</p>
        )}
        {state.kind === 'blocked' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground" data-testid="push-blocked">{BLOCKED_TEXT[state.why]}</p>
            {state.why === 'ios-install' && <Link to="/install" className="text-sm underline">How to add Womanie to your Home Screen</Link>}
          </div>
        )}
        {state.kind === 'off' && (
          <Button onClick={() => turnOn(state.publicKey)} disabled={busy} className="w-full">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Turn on phone notifications
          </Button>
        )}
        {state.kind === 'on' && (
          <>
            {TYPES.map((t, i) => (
              <div key={t.key}>
                {i > 0 && <Separator className="mb-4" />}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor={`push-${t.key}`}>{t.label}</Label>
                    <p className="text-sm text-muted-foreground">{t.hint}</p>
                  </div>
                  <Switch id={`push-${t.key}`} checked={state.prefs[t.key]} onCheckedChange={v => void setPref(t.key, v)} />
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={test} disabled={busy}>Send a test</Button>
              <Button variant="ghost" size="sm" onClick={() => turnOff(state.publicKey)} disabled={busy}>Turn off on this device</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
