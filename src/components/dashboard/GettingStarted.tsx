import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, CircleDashed, Sparkles } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
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

const CELEBRATION_LABELS: Record<string, { title: string; description: string }> = {
  profile: {
    title: 'Profile set up',
    description: 'Womanie now knows who it\'s helping.',
  },
  upload: {
    title: 'First document uploaded',
    description: 'Watch for the AI analysis in Health Records.',
  },
  log: {
    title: 'First daily log saved',
    description: 'Log regularly and your trends get sharper each cycle.',
  },
  done: {
    title: 'You\'re all set',
    description: 'Your dashboard is fully lit up now.',
  },
};

export default function GettingStarted() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
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

  // Track which steps we've already congratulated so a re-fetch of
  // still-completed state doesn't re-fire toasts. Initial mount
  // captures the current state without celebrating.
  const congratulatedRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!loaded) return;
    const nowDone = new Set<string>();
    if (profileName) nowDone.add('profile');
    if (docCount > 0) nowDone.add('upload');
    if (signalCount > 0) nowDone.add('log');

    if (congratulatedRef.current === null) {
      // First load — remember current state silently.
      congratulatedRef.current = nowDone;
      return;
    }

    const already = congratulatedRef.current;
    const newlyDone = [...nowDone].filter(k => !already.has(k));
    for (const key of newlyDone) {
      const labels = CELEBRATION_LABELS[key];
      if (labels) toast({ title: `🎉 ${labels.title}`, description: labels.description });
    }
    if (newlyDone.length > 0 && nowDone.size === 3 && already.size < 3) {
      // Last box just ticked off — send a final "you're all set" toast.
      const d = CELEBRATION_LABELS.done;
      toast({ title: `✨ ${d.title}`, description: d.description });
    }
    congratulatedRef.current = nowDone;
  }, [loaded, profileName, docCount, signalCount, toast]);

  if (!loaded) return null;

  const steps: StepDef[] = [
    {
      key: 'profile',
      done: Boolean(profileName),
      title: 'Add your name',
      // The inline name banner directly above this card is the action,
      // so we point users to it rather than the old /onboarding/basic-info
      // route — that form never collected a name and would just route
      // them back here with the step still incomplete.
      description: profileName
        ? 'A one-minute profile tells Womanie who it\'s helping.'
        : 'Use the "What should we call you?" box above to fill this in.',
      ctaLabel: 'Complete profile',
      ctaHref: '#name-banner',
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
                onClick={() => {
                  // Hash hrefs scroll to an anchor on the same page;
                  // path hrefs navigate. Keeps the in-page "use the
                  // name banner above" pointer working without a route.
                  if (step.ctaHref.startsWith('#')) {
                    const id = step.ctaHref.slice(1);
                    document.getElementById(id)?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'center',
                    });
                  } else {
                    navigate(step.ctaHref);
                  }
                }}
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
