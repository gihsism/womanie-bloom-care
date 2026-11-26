import { useEffect, type ReactNode } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { applyStageTheme } from '@/lib/stageTheme';
import { ONBOARDING_SCREENS, onboardingStage } from '@/lib/onboardingFlow';

// One first-run screen (idea 4): Back + wordmark, a five-dot progress
// line, ONE question as the page title, its answers, and one primary
// button pinned at the bottom. The screen wears the colours of the stage
// picked so far (the picker passes the stage being tapped).

interface Props {
  step: number;
  title: string;
  sub?: string;
  onBack?: () => void;
  /** Colour set for this screen; default = the stage the answers so far would save. */
  stage?: LifeStage | null;
  primary: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean; busyLabel?: string };
  secondary?: { label: string; onClick: () => void };
  children?: ReactNode;
}

export default function OnboardingScreen({ step, title, sub, onBack, stage, primary, secondary, children }: Props) {
  const { data } = useOnboarding();
  const theme = stage !== undefined ? stage : onboardingStage(data);
  useEffect(() => {
    if (theme) applyStageTheme(theme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="w-full max-w-md mx-auto px-4 pt-3 flex items-center justify-between min-h-12">
        {onBack ? (
          <button type="button" onClick={onBack} className="flex items-center gap-2 min-h-11 -ml-1 px-1 text-foreground hover:text-stage-accent" aria-label="Go back">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[15px] font-medium">Back</span>
          </button>
        ) : <span />}
        <a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }} className="relative hit-44 text-xl font-extrabold text-stage-accent hover:opacity-80">
          Womanie
        </a>
      </div>

      <div className="w-full max-w-md mx-auto px-4 pt-3">
        <div
          role="progressbar"
          aria-label={`Step ${step} of ${ONBOARDING_SCREENS}`}
          aria-valuemin={1}
          aria-valuemax={ONBOARDING_SCREENS}
          aria-valuenow={step}
          className="flex gap-1.5"
        >
          {Array.from({ length: ONBOARDING_SCREENS }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < step ? 'bg-stage-accent' : 'bg-line'}`} />
          ))}
        </div>
        <p className="mt-2 text-[13px] font-semibold text-muted-foreground">Step {step} of {ONBOARDING_SCREENS}</p>
      </div>

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-6">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub mt-2">{sub}</p>}
        {children && <div className="mt-6">{children}</div>}
      </main>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm">
        <div className="w-full max-w-md mx-auto px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-1">
          <button type="button" className="btn-stage w-full" onClick={primary.onClick} disabled={primary.disabled || primary.busy}>
            {primary.busy ? (<><Loader2 className="h-4 w-4 animate-spin" />{primary.busyLabel ?? primary.label}</>) : primary.label}
          </button>
          {secondary && (
            <button type="button" onClick={secondary.onClick} className="w-full min-h-11 text-[15px] font-semibold text-muted-foreground hover:text-stage-accent">
              {secondary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
