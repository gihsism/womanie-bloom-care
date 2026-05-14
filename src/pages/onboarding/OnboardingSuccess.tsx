import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useAuth } from '@/contexts/AuthContext';
import { commitOnboarding } from '@/lib/onboarding-commit';

const OnboardingSuccess = () => {
  const navigate = useNavigate();
  const { data, resetOnboarding } = useOnboarding();
  const { user } = useAuth();
  const [committing, setCommitting] = useState(false);

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
  }, [user?.id, data]);

  const handleStartExploring = () => {
    resetOnboarding();
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 flex justify-center border-b border-border">
        <button type="button" onClick={() => { window.location.href = '/'; }} className="text-xl font-bold text-primary hover:opacity-80 transition-opacity">
          Womanie
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Success icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
        </div>

        {/* Sparkles */}
        <div className="flex justify-center gap-2">
          <Sparkles className="h-5 w-5 text-secondary" aria-hidden="true" />
          <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
          <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">You're all set!</h1>
          <p className="text-muted-foreground">
            Your personalized health dashboard is ready. Everything is tailored to your journey.
          </p>
        </div>

        {/* CTA */}
        <div className="space-y-3 pt-2">
          <Button
            className="w-full text-base py-5"
            onClick={handleStartExploring}
            disabled={committing}
          >
            {committing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving your answers…
              </>
            ) : (
              <>
                Go to my dashboard
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate('/welcome', { replace: true })}
          >
            See what I can do first
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
};

export default OnboardingSuccess;
