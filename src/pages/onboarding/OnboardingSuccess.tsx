import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Sparkles, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/contexts/OnboardingContext';

const OnboardingSuccess = () => {
  const navigate = useNavigate();
  const { resetOnboarding } = useOnboarding();

  useEffect(() => {
    // Auto-redirect after 3 seconds
    const timer = setTimeout(() => {
      handleStartExploring();
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleStartExploring = () => {
    // Navigate to dashboard
    navigate('/dashboard');
  };

  const handleTour = () => {
    // Placeholder for future tour functionality
    console.log('Starting tour...');
    handleStartExploring();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Home Button */}
      <div className="p-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-foreground hover:text-primary"
          aria-label="Go to home"
        >
          <Home className="h-5 w-5" />
          <span className="text-sm">Home</span>
        </button>
      </div>
      
      <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl text-center">
        {/* Success Animation */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 animate-ping">
              <CheckCircle2 className="h-24 w-24 text-primary opacity-20" />
            </div>
            <CheckCircle2 className="h-24 w-24 text-primary relative animate-fade-in" />
          </div>
        </div>

        {/* Confetti-like decoration */}
        <div className="mb-6 flex justify-center gap-2 animate-fade-in-delay-1">
          <Sparkles className="h-6 w-6 text-secondary animate-pulse" />
          <Sparkles className="h-8 w-8 text-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
          <Sparkles className="h-6 w-6 text-accent animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>

        {/* Heading */}
        <h1 className="text-4xl lg:text-5xl font-bold mb-4 animate-fade-in-delay-2">
          You're all set!
        </h1>
        <p className="text-lg text-muted-foreground mb-12 animate-fade-in-delay-3">
          Your personalized health dashboard is ready. Let's explore!
        </p>

        {/* Buttons */}
        <div className="space-y-4 max-w-md mx-auto animate-fade-in-delay-3">
          <Button
            className="w-full text-lg py-6"
            onClick={handleStartExploring}
          >
            Start Exploring
          </Button>
          <Button
            variant="outline"
            className="w-full text-lg py-6"
            onClick={handleTour}
          >
            Take a Quick Tour
          </Button>
        </div>

        {/* Auto-redirect hint */}
        <p className="mt-8 text-sm text-muted-foreground animate-fade-in-delay-3">
          Redirecting automatically in 3 seconds...
        </p>
      </div>
      </div>
    </div>
  );
};

export default OnboardingSuccess;
