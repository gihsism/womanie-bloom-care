import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  MessageSquare, 
  Activity, 
  FileText, 
  Smartphone, 
  Users, 
  LogOut,
  Calendar,
  Droplet,
  Heart,
  Pill,
  TrendingUp
} from 'lucide-react';
import type { User, Session } from '@supabase/supabase-js';

const PatientDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ full_name?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Fetch profile when user logs in
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth/login');
    }
  }, [user, loading, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: 'Logged out',
      description: 'You have been logged out successfully.',
    });
    navigate('/');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getUserName = () => {
    if (profile?.full_name) {
      return profile.full_name.split(' ')[0]; // First name only
    }
    return 'there';
  };

  const dashboardButtons = [
    {
      id: 'B1',
      title: 'Healthcare Services',
      description: 'Active consultations, chat with AI or doctors',
      icon: MessageSquare,
      color: 'bg-primary',
    },
    {
      id: 'B2',
      title: 'My Health Dashboard',
      description: 'Live tracking, cycle phases, blood results, trends',
      icon: Activity,
      color: 'bg-secondary',
    },
    {
      id: 'B3',
      title: 'Historical Records',
      description: 'Permanent archive, uploaded documents, personal profile',
      icon: FileText,
      color: 'bg-accent',
    },
    {
      id: 'B4',
      title: 'Device Connection',
      description: 'Sync with wearables, background health data',
      icon: Smartphone,
      color: 'bg-muted',
    },
    {
      id: 'B5',
      title: 'Community',
      description: 'Support groups, shared experiences, Telegram/WhatsApp',
      icon: Users,
      color: 'bg-primary/70',
    },
  ];

  const healthStats = [
    {
      title: 'Cycle Day',
      value: '14',
      subtitle: 'Ovulation window',
      icon: Calendar,
      color: 'text-primary',
    },
    {
      title: 'Hormones',
      value: 'Optimal',
      subtitle: 'Estrogen & Progesterone',
      icon: TrendingUp,
      color: 'text-secondary',
    },
    {
      title: 'Vitamins',
      value: '8/10',
      subtitle: 'Daily intake goal',
      icon: Pill,
      color: 'text-accent',
    },
    {
      title: 'Ovulation',
      value: 'High',
      subtitle: 'Fertility today',
      icon: Droplet,
      color: 'text-primary',
    },
    {
      title: 'Ovaries',
      value: 'Healthy',
      subtitle: 'Last scan: 2 weeks ago',
      icon: Heart,
      color: 'text-secondary',
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                {getGreeting()}, {getUserName()}! 👋
              </h1>
              <p className="text-muted-foreground mt-1">
                Welcome to your personalized health dashboard
              </p>
            </div>
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Health Statistics */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Your Health Today</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {healthStats.map((stat) => {
              const IconComponent = stat.icon;
              return (
                <Card key={stat.title} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <IconComponent className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div className="text-2xl font-bold mb-1">{stat.value}</div>
                  <div className="text-sm font-medium text-foreground mb-1">
                    {stat.title}
                  </div>
                  <div className="text-xs text-muted-foreground">{stat.subtitle}</div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Cycle Calendar Teaser */}
        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-semibold mb-2">Menstrual Cycle Calendar</h3>
              <p className="text-muted-foreground">
                Track your cycle, symptoms, mood, and fertility window
              </p>
            </div>
            <Calendar className="h-12 w-12 text-primary" />
          </div>
          <div className="bg-muted/30 rounded-lg p-8 text-center">
            <p className="text-muted-foreground">
              Calendar view coming soon - Track symptoms, mood, and more
            </p>
          </div>
        </Card>

        {/* Dashboard Actions */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Quick Actions</h2>
            <Button variant="outline" onClick={() => navigate('/onboarding/basic-info')}>
              Complete Profile
            </Button>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboardButtons.map((button) => {
              const IconComponent = button.icon;
              return (
                <Card
                  key={button.id}
                  className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() =>
                    toast({
                      title: button.title,
                      description: 'This feature is coming soon!',
                    })
                  }
                >
                  <div className={`w-12 h-12 rounded-lg ${button.color} flex items-center justify-center mb-4`}>
                    <IconComponent className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{button.title}</h3>
                  <p className="text-sm text-muted-foreground">{button.description}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDashboard;
