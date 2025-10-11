import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AppSidebar } from '@/components/dashboard/AppSidebar';
import DashboardHeader, { getModeStats, type LifeStage } from '@/components/dashboard/DashboardHeader';
import CycleCalendar from '@/components/dashboard/CycleCalendar';
import DailyLogging from '@/components/dashboard/DailyLogging';
import { 
  MessageSquare, 
  Activity, 
  FileText, 
  Smartphone, 
  Users, 
  ChevronRight,
  Home,
  Menu
} from 'lucide-react';
import type { User, Session } from '@supabase/supabase-js';

const PatientDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ full_name?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<LifeStage>('menstrual-cycle');
  const [activeSection, setActiveSection] = useState('overview');

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
      return profile.full_name.split(' ')[0];
    }
    return 'there';
  };

  const healthStats = getModeStats(selectedMode);

  const mainSections = [
    {
      id: 'B1',
      title: 'Healthcare Services',
      icon: MessageSquare,
      subsections: [
        { id: 'B1.1', title: 'AI Health Assistant', description: 'Symptom checker & health guidance' },
        { id: 'B1.2', title: 'Doctor Consultations', description: 'Start consultation & history' },
      ],
    },
    {
      id: 'B2',
      title: 'My Health Dashboard',
      icon: Activity,
      subsections: [
        { id: 'B2.1', title: "Today's Overview", description: 'Current status & insights' },
        { id: 'B2.2', title: 'Cycle & Phase Tracking', description: 'Visual calendar & predictions' },
        { id: 'B2.3', title: 'Body Insights & Patterns', description: 'Daily tracking & correlations' },
        { id: 'B2.4', title: 'Medical Data & Test Results', description: 'Lab results & imaging' },
        { id: 'B2.5', title: 'Medical History', description: 'Conditions & medications' },
        { id: 'B2.6', title: 'Pregnancy Tracker', description: 'Week-by-week development', visible: selectedMode === 'pregnancy' },
        { id: 'B2.7', title: 'Wearable Device Data', description: 'Synced health metrics' },
        { id: 'B2.8', title: 'Health Goals & Progress', description: 'Track your goals' },
      ],
    },
    {
      id: 'B3',
      title: 'Personal Records',
      icon: FileText,
      subsections: [
        { id: 'B3.1', title: 'My Profile', description: 'Essential & extended info' },
        { id: 'B3.2', title: 'Document Library', description: 'Upload & organize documents' },
        { id: 'B3.3', title: 'Health Timeline', description: 'Chronological health events' },
        { id: 'B3.4', title: 'Settings & Preferences', description: 'Account & privacy settings' },
      ],
    },
    {
      id: 'B4',
      title: 'Connected Devices',
      icon: Smartphone,
      subsections: [
        { id: 'B4.1', title: 'Device Management', description: 'My devices & connection status' },
        { id: 'B4.2', title: 'Sync Settings', description: 'Auto-sync & preferences' },
        { id: 'B4.3', title: 'Troubleshooting', description: 'Connection & sync issues' },
      ],
    },
    {
      id: 'B5',
      title: 'Community & Support',
      icon: Users,
      subsections: [
        { id: 'B5.1', title: 'My Groups', description: 'Joined groups & activity' },
        { id: 'B5.2', title: 'Discover Groups', description: 'Browse recommended groups' },
        { id: 'B5.3', title: 'Educational Content', description: 'Articles & videos' },
        { id: 'B5.4', title: 'Upcoming Events', description: 'Webinars & sessions' },
      ],
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
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col min-h-screen w-full">
          {/* Header */}
          <div className="border-b border-border bg-card sticky top-0 z-10">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => navigate('/')}
                    className="gap-2"
                  >
                    <Home className="h-4 w-4" />
                    Main Site
                  </Button>
                  <div className="h-6 w-px bg-border" />
                  <h1 className="text-xl font-bold text-primary">Womanie</h1>
                </div>
                <div className="flex items-center gap-2">
                  {activeSection !== 'overview' && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setActiveSection('overview')}
                      className="gap-2"
                    >
                      <Home className="h-4 w-4" />
                      Dashboard Home
                    </Button>
                  )}
                </div>
              </div>
              <DashboardHeader 
                userName={getUserName()}
                selectedMode={selectedMode}
                onModeChange={setSelectedMode}
                onNavigate={setActiveSection}
              />
            </div>
          </div>

          <div className="container mx-auto px-4 py-6 flex-1">
            {/* Health Statistics */}
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-3">Your Health Today</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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

            {/* Profile Completion Banner */}
            <Card className="p-4 mb-6 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold mb-2">
                    Complete your profile for better personalized services
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Tell us about your health journey to get customized insights, tracking, and recommendations tailored to your needs.
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={() => navigate('/onboarding/basic-info')}
                >
                  Complete Profile
                </Button>
              </div>
            </Card>

            {/* Health Tracking Section */}
            <div className="mb-6">
              <h3 className="text-base font-semibold mb-3">Health Tracking</h3>
              <CycleCalendar 
                lastPeriodStart={new Date(2025, 9, 1)} 
                cycleLength={28} 
                periodLength={5}
                selectedMode={selectedMode}
              />
            </div>

            {/* Daily Logging */}
            <div className="mb-6">
              <DailyLogging selectedMode={selectedMode} />
            </div>

            {/* Main Sections */}
            <div className="space-y-4">
              {mainSections.map((section) => {
                const IconComponent = section.icon;
                const visibleSubsections = section.subsections.filter(sub => sub.visible !== false);
                
                return (
                  <Card key={section.id} className="p-4">
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setActiveSection(section.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <IconComponent className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{section.title}</h3>
                          <p className="text-xs text-muted-foreground">{visibleSubsections.length} features</p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                    
                    {activeSection === section.id && (
                      <div className="mt-4 grid md:grid-cols-2 gap-3">
                        {visibleSubsections.map((sub) => (
                          <Button
                            key={sub.id}
                            variant="outline"
                            className="justify-start h-auto py-3 px-4"
                            onClick={() => {
                              toast({
                                title: sub.title,
                                description: sub.description + ' - Coming soon!',
                              });
                            }}
                          >
                            <div className="text-left">
                              <div className="font-medium text-sm">{sub.title}</div>
                              <div className="text-xs text-muted-foreground">{sub.description}</div>
                            </div>
                          </Button>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default PatientDashboard;
