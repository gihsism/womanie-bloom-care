import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Calendar, 
  MessageSquare, 
  FileText, 
  Activity, 
  ArrowRight, 
  Sparkles,
  Heart,
  Shield
} from 'lucide-react';

const features = [
  {
    icon: Calendar,
    title: 'Cycle Tracking',
    description: 'Log your period, track symptoms, and get personalised cycle predictions.',
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
  {
    icon: MessageSquare,
    title: 'AI Health Assistant',
    description: 'Chat with our AI doctor for instant health guidance powered by latest models.',
    color: 'text-secondary',
    bg: 'bg-secondary/10',
  },
  {
    icon: FileText,
    title: 'Document Analysis',
    description: 'Upload lab results and medical documents for AI-powered summaries.',
    color: 'text-purple',
    bg: 'bg-purple/10',
  },
  {
    icon: Activity,
    title: 'Health Insights',
    description: 'Track patterns in your mood, symptoms, and overall wellbeing over time.',
    color: 'text-accent',
    bg: 'bg-accent/10',
  },
];

const Welcome = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth/login', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || !user) return null;

  const userName = user.user_metadata?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-border">
        <h1 className="text-xl font-bold text-primary">Womanie</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard', { replace: true })}
          className="text-muted-foreground"
        >
          Skip to dashboard
        </Button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {step === 0 && (
            <div className="text-center space-y-6 animate-in fade-in duration-500">
              {/* Welcome illustration area */}
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 via-secondary/10 to-accent/10 flex items-center justify-center mx-auto">
                <Heart className="h-10 w-10 text-primary" />
              </div>

              <div>
                <h2 className="text-3xl font-bold text-foreground mb-2">
                  Welcome, {userName}! 🎉
                </h2>
                <p className="text-muted-foreground text-lg">
                  We're so glad you're here. Let's set up your personal health companion.
                </p>
              </div>

              <Card className="p-5 text-left space-y-3 bg-primary/5 border-primary/20">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-sm text-foreground">Your data is private & secure</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Everything you log stays encrypted and visible only to you. We never share your health data.
                </p>
              </Card>

              <Button
                size="lg"
                className="w-full gap-2"
                onClick={() => setStep(1)}
              >
                Let's get started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-primary">What you can do</span>
                </div>
                <h2 className="text-2xl font-bold text-foreground">
                  Your health toolkit
                </h2>
                <p className="text-muted-foreground mt-1">
                  Here's what Womanie can help you with
                </p>
              </div>

              <div className="space-y-3">
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <Card key={feature.title} className="p-4 flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl ${feature.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`h-5 w-5 ${feature.color}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground text-sm">{feature.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                      </div>
                    </Card>
                  );
                })}
              </div>

              <div className="space-y-3">
                <Button
                  size="lg"
                  className="w-full gap-2"
                  onClick={() => navigate('/onboarding/basic-info')}
                >
                  Complete my profile
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => navigate('/dashboard', { replace: true })}
                >
                  Go to dashboard
                </Button>
              </div>

              {/* Step dots */}
              <div className="flex justify-center gap-2">
                <button onClick={() => setStep(0)} className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Welcome;
