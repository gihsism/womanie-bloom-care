import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, CircleDashed, Sparkles } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';

// Three-step getting-started checklist for brand-new patient accounts.
// Widget hides itself once all three are done, so it's invisible for
// established users. The widget below each remaining step has a CTA
// button that either navigates or triggers the relevant flow.
//
// Steps:
//   1. Profile has a name (done at onboarding /onboarding/basic-info)
//   2. At least one health document uploaded
//   3. At least one day of daily health signals logged

interface StepDef {
  key: string;
  done: boolean;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

export default function GettingStarted() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profileName, setProfileName] = useState<string | null>(null);
  const [docCount, setDocCount] = useState<number>(0);
  const [signalCount, setSignalCount] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [profileRes, docsRes, signalsRes] = await Promise.all([
      db.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      db.from('health_documents').select('id').eq('user_id', user.id),
      db.from('daily_health_signals').select('id').eq('user_id', user.id),
    ]);
    const name = (profileRes.data as { full_name?: string | null } | null)?.full_name ?? null;
    setProfileName(name && name.trim().length > 0 ? name : null);
    setDocCount(Array.isArray(docsRes.data) ? docsRes.data.length : 0);
    setSignalCount(Array.isArray(signalsRes.data) ? signalsRes.data.length : 0);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  if (!loaded) return null;

  const steps: StepDef[] = [
    {
      key: 'profile',
      done: Boolean(profileName),
      title: 'Add your name',
      description: 'A one-minute profile tells Womanie who it\'s helping.',
      ctaLabel: 'Complete profile',
      ctaHref: '/onboarding/basic-info',
    },
    {
      key: 'upload',
      done: docCount > 0,
      title: 'Upload your first document',
      description: 'Lab results, imaging reports, prescriptions — we\'ll analyze them for you.',
      ctaLabel: 'Upload',
      ctaHref: '/dashboard/medical-history',
    },
    {
      key: 'log',
      done: signalCount > 0,
      title: 'Log today\'s symptoms',
      description: 'Your tracked data makes every future prediction sharper.',
      ctaLabel: 'Log today',
      ctaHref: '/dashboard',
    },
  ];

  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card className="p-4 mb-4 border-l-4 border-l-primary">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">Getting started</p>
          <p className="text-[11px] text-muted-foreground">
            {doneCount} of {steps.length} done — a couple more steps to light up the dashboard.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {steps.map(step => (
          <li
            key={step.key}
            className={`flex items-center gap-3 p-2 rounded-lg ${
              step.done ? 'bg-green-50/60 dark:bg-green-900/10' : 'bg-muted/30'
            }`}
          >
            {step.done ? (
              <Check className="h-4 w-4 text-green-700 dark:text-green-300 flex-shrink-0" />
            ) : (
              <CircleDashed className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.done ? 'line-through text-muted-foreground' : ''}`}>
                {step.title}
              </p>
              {!step.done && (
                <p className="text-[11px] text-muted-foreground">{step.description}</p>
              )}
            </div>
            {!step.done && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => navigate(step.ctaHref)}
              >
                {step.ctaLabel}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
