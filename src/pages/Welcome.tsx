import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, MessageSquare, FileText, Activity, ChevronRight, Loader2, Shield } from 'lucide-react';
import { ONBOARDING_PATHS } from '@/lib/onboardingFlow';

// After sign-up: what Womanie does, then ONE next step (set it up for
// your stage, five short screens). Going straight to Home stays a link.
const features = [
  { icon: Calendar, title: 'Track your cycle', description: 'Log periods and symptoms, see what comes next.', path: '/dashboard' },
  { icon: FileText, title: 'Understand your results', description: 'Upload a lab report and read it in plain words.', path: '/dashboard/medical-history' },
  { icon: MessageSquare, title: 'Ask AI', description: 'Answers from medical research, with sources.', path: '/dashboard/ai-doctor' },
  { icon: Activity, title: 'See patterns', description: 'Mood, symptoms and results over time.', path: '/health-statistics' },
];

const Welcome = () => {
  const navigate = useNavigate();
  usePageTitle('Welcome');
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth/login', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" role="status" aria-label="Loading">
        <Loader2 className="h-6 w-6 animate-spin text-stage-accent" />
      </div>
    );
  }

  const userName = user.user_metadata?.full_name?.split(' ')[0] || '';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="w-full max-w-md mx-auto px-4 pt-3 min-h-12 flex items-center">
        <button
          type="button"
          onClick={() => { window.location.href = '/'; }}
          className="relative hit-44 text-xl font-extrabold text-stage-accent hover:opacity-80"
        >
          Womanie
        </button>
      </div>

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-6 pb-6">
        <h1 className="page-title">{userName ? `Welcome, ${userName}` : 'Welcome'}</h1>
        <p className="page-sub mt-2">Your health in one place. Here is what you can do.</p>

        <div className="row-group mt-6">
          {features.map(({ icon: Icon, title, description, path }) => (
            <button
              key={title}
              type="button"
              onClick={() => navigate(path)}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-muted/60"
            >
              <span className="grid place-items-center h-11 w-11 shrink-0 rounded-full bg-stage-tint text-stage-accent" aria-hidden="true">
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] font-bold leading-snug">{title}</span>
                <span className="block text-[14px] leading-snug text-muted-foreground">{description}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>

        <p className="mt-4 flex items-start gap-2 text-[14px] text-muted-foreground">
          <Shield className="h-4 w-4 mt-0.5 shrink-0 text-stage-accent" aria-hidden="true" />
          Your data is encrypted and only you can see it. We never share your health data.
        </p>
      </main>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm">
        <div className="w-full max-w-md mx-auto px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-1">
          <button type="button" className="btn-stage w-full" onClick={() => navigate(ONBOARDING_PATHS.stage)}>
            Set up Womanie for me
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard', { replace: true })}
            className="w-full min-h-11 text-[15px] font-semibold text-muted-foreground hover:text-stage-accent"
          >
            Skip, go to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
