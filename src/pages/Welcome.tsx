import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Calendar, 
  MessageSquare, 
  FileText, 
  Activity, 
  ArrowRight, 
  Heart,
  Shield,
  Sparkles,
} from 'lucide-react';

const features = [
  {
    icon: Calendar,
    title: 'Cycle Tracking',
    description: 'Log your period, track symptoms, and get personalised predictions.',
    bg: 'bg-primary/10',
    color: 'text-primary',
    path: '/dashboard',
  },
  {
    icon: MessageSquare,
    title: 'AI Health Assistant',
    description: 'Get instant health guidance powered by latest AI models.',
    bg: 'bg-secondary/10',
    color: 'text-secondary',
    path: '/dashboard/ai-doctor',
  },
  {
    icon: FileText,
    title: 'Document Analysis',
    description: 'Upload lab results for AI-powered summaries and insights.',
    bg: 'bg-purple/10',
    color: 'text-purple',
    path: '/dashboard/medical-history',
  },
  {
    icon: Activity,
    title: 'Health Insights',
    description: 'Track patterns in mood, symptoms, and overall wellbeing.',
    bg: 'bg-accent/10',
    color: 'text-accent',
    path: '/health-statistics',
  },
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 via-secondary/10 to-accent/10 flex items-center justify-center animate-pulse">
            <Heart className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading your space...</p>
        </div>
      </div>
    );
  }

  const userName = user.user_metadata?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-border">
        <button
          type="button"
          onClick={() => { window.location.href = '/'; }}
          className="text-xl font-bold text-primary hover:opacity-80 transition-opacity z-50 relative cursor-pointer"
        >
          Womanie
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard', { replace: true })}
          className="text-muted-foreground"
        >
          Go to dashboard
        </Button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg space-y-6">
          {/* Greeting */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 via-secondary/10 to-accent/10 flex items-center justify-center mx-auto">
              <Heart className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold text-foreground">
              Welcome, {userName}! 🎉
            </h2>
            <p className="text-muted-foreground text-base">
              Your personal health companion is ready. Here's what you can do:
            </p>
          </div>

          {/* Features */}
          <div className="space-y-2.5">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={feature.title}
                  className="p-3.5 flex items-center gap-3.5 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(feature.path)}
                >
                  <div className={`w-9 h-9 rounded-lg ${feature.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`h-4.5 w-4.5 ${feature.color}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground text-sm">{feature.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </Card>
              );
            })}
          </div>

          {/* Privacy note */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/10">
            <Shield className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-xs text-muted-foreground">
              Your data is encrypted and visible only to you. We never share your health data.
            </span>
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-1">
            <Button
              size="lg"
              className="w-full"
              onClick={() => navigate('/dashboard', { replace: true })}
            >
              Explore dashboard
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2"
              onClick={() => navigate('/onboarding/basic-info')}
            >
              <Sparkles className="h-4 w-4" />
              Personalise my experience
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
