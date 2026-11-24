import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { commitOnboarding } from '@/lib/onboarding-commit';
import OnboardingScreen from '@/components/onboarding/OnboardingScreen';
import { lifeStageLabel } from '@/lib/lifeStageLabels';
import { onboardingStage } from '@/lib/onboardingFlow';

// Screen 5 of 5: done. Saves every answer to the account, then Home.
const OnboardingSuccess = () => {
  usePageTitle('All set');
  const navigate = useNavigate();
  const { data, resetOnboarding } = useOnboarding();
  const { user, loading: authLoading } = useAuth();
  const [committing, setCommitting] = useState(false);
  const stage = onboardingStage(data);

  // Persist on mount: everything the user just entered is in the
  // onboarding context. Without this, resetOnboarding() in
  // handleStartExploring would wipe the localStorage cache without
  // ever writing to the database, so the user would land on a blank
  // dashboard that ignored their answers.
  const didCommit = useRef(false);
  useEffect(() => {
    if (!user?.id || didCommit.current) return;
    didCommit.current = true;
    setCommitting(true);
    commitOnboarding(user, data)
      .catch((e) => console.error('Onboarding commit failed', e))
      .finally(() => setCommitting(false));
  }, [user, data]);

  const handleStartExploring = () => {
    resetOnboarding();
    navigate('/dashboard', { replace: true });
  };

  return (
    <OnboardingScreen
      step={5}
      title="You're all set"
      sub={stage ? `Home is set up for your stage: ${lifeStageLabel(stage)}. You can change anything later in Me.` : 'You can change anything later in Me.'}
      // Until the session is known the answers are not saved yet: going on
      // would clear them first (resetOnboarding) and save an empty profile.
      primary={{ label: 'Go to Home', onClick: handleStartExploring, busy: committing || authLoading, busyLabel: 'Saving your answers…' }}
      secondary={{ label: 'See what I can do first', onClick: () => navigate('/welcome', { replace: true }) }}
    >
      <div className="grid place-items-center pt-6">
        <span className="grid place-items-center h-24 w-24 rounded-full bg-stage-head text-stage-ink" aria-hidden="true">
          <Check className="h-11 w-11" strokeWidth={2.4} />
        </span>
      </div>
    </OnboardingScreen>
  );
};

export default OnboardingSuccess;
