import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import DashboardHeader, { getModeStats, type LifeStage } from '@/components/dashboard/DashboardHeader';
import CycleCalendar from '@/components/dashboard/CycleCalendar';
import PregnancyTracker from '@/components/dashboard/PregnancyTracker';
import IVFTracker from '@/components/dashboard/IVFTracker';
import DailyLogging from '@/components/dashboard/DailyLogging';
import DocumentUpload from '@/components/dashboard/DocumentUpload';
import OvulationPrediction from '@/components/dashboard/OvulationPrediction';
import PreMenstrualDashboard from '@/components/dashboard/PreMenstrualDashboard';
import MenopauseDashboard from '@/components/dashboard/MenopauseDashboard';
import { format, addDays } from 'date-fns';
import { 
  MessageSquare, 
  Activity, 
  FileText, 
  Smartphone, 
  Users, 
  ChevronRight,
  Home,
  Menu,
  Settings,
  Phone,
  HelpCircle,
  Shield,
  Bell,
  Info,
  User as UserIcon,
  LogOut,
  Calendar,
  Sparkles,
  Droplet,
  ArrowLeft
} from 'lucide-react';

interface DocumentSummary {
  id: string;
  file_name: string;
  ai_suggested_name: string | null;
  ai_suggested_category: string | null;
  ai_summary: string | null;
  uploaded_at: string;
  document_type: string;
}


const PatientDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, session, loading } = useAuth();
  const [profile, setProfile] = useState<{ full_name?: string; life_stage?: string; pregnancy_due_date?: string | null; ivf_start_date?: string | null; ivf_phase?: string | null } | null>(null);
  const [selectedMode, setSelectedMode] = useState<LifeStage | null>(null);
  const [ovulationPrediction, setOvulationPrediction] = useState<any>(null);
  const [periodData, setPeriodData] = useState<{ lastPeriodStart: Date; cycleLength: number } | null>(null);
  const [pregnancyDueDate, setPregnancyDueDate] = useState<Date | null>(null);
  const [ivfStartDate, setIvfStartDate] = useState<Date | null>(null);
  const [ivfPhase, setIvfPhase] = useState<string | null>(null);

  // Save life stage to database when it changes
  const handleModeChange = async (mode: LifeStage) => {
    setSelectedMode(mode);
    
    if (user) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ life_stage: mode })
          .eq('id', user.id);
        
        if (error) throw error;
      } catch (error) {
        console.error('Error saving life stage:', error);
        toast({
          title: 'Error',
          description: 'Failed to save life stage preference',
          variant: 'destructive',
        });
      }
    }
  };

  // Load period data
  useEffect(() => {
    if (user) {
      loadPeriodData();
    }
  }, [user]);

  const loadPeriodData = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase
        .from('period_tracking')
        .select('*')
        .eq('user_id', user.id)
        .order('period_start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setPeriodData({
          lastPeriodStart: new Date(data.period_start_date),
          cycleLength: data.cycle_length
        });
      } else {
        // No period data yet — leave as null so CycleCalendar shows empty state
        setPeriodData(null);
      }
    } catch (error) {
      console.error('Error loading period data:', error);
    }
  };

  // Auto-fetch ovulation prediction when we have period data
  useEffect(() => {
    if (user && periodData && (selectedMode === 'conception' || selectedMode === 'menstrual-cycle')) {
      fetchOvulationPrediction();
    }
  }, [user, selectedMode, periodData]);

  const fetchOvulationPrediction = async () => {
    if (!user || !periodData) return;
    
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: healthData } = await supabase
        .from('daily_health_signals')
        .select('*')
        .eq('user_id', user.id)
        .gte('signal_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('signal_date', { ascending: false });

      if (!healthData || healthData.length === 0) return;

      const { data } = await supabase.functions.invoke('predict-ovulation', {
        body: {
          healthData,
          cycleData: {
            cycleLength: periodData.cycleLength,
            lastPeriodStart: periodData.lastPeriodStart.toISOString(),
          },
        },
      });

      if (data?.prediction) {
        setOvulationPrediction(data.prediction);
      }
    } catch (error) {
      console.error('Auto-prediction error:', error);
    }
  };

  const [activeSection, setActiveSection] = useState('overview');
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // Fetch profile and documents when user is available
  useEffect(() => {
    if (user) {
      fetchProfile(user.id);
      fetchDocuments();
    }
  }, [user]);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, life_stage, pregnancy_due_date, ivf_start_date, ivf_phase')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
      
      setSelectedMode((data?.life_stage as LifeStage) || 'menstrual-cycle');
      
      if (data?.pregnancy_due_date) {
        setPregnancyDueDate(new Date(data.pregnancy_due_date));
      }
      if (data?.ivf_start_date) {
        setIvfStartDate(new Date(data.ivf_start_date));
      }
      if (data?.ivf_phase) {
        setIvfPhase(data.ivf_phase);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setSelectedMode('menstrual-cycle');
    }
  };

  const handleSetPregnancyDueDate = async (date: Date) => {
    setPregnancyDueDate(date);
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ pregnancy_due_date: format(date, 'yyyy-MM-dd') })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error saving due date:', error);
      }
    }
  };

  const handleResetPregnancy = async () => {
    setPregnancyDueDate(null);
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ pregnancy_due_date: null })
          .eq('id', user.id);
        toast({ title: 'Pregnancy tracking reset', description: 'You can set it up again anytime.' });
      } catch (error) {
        console.error('Error resetting pregnancy:', error);
      }
    }
  };

  const handleSetIVFStart = async (date: Date, phase: string) => {
    setIvfStartDate(date);
    setIvfPhase(phase);
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ ivf_start_date: format(date, 'yyyy-MM-dd'), ivf_phase: phase })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error saving IVF data:', error);
      }
    }
  };

  const handleUpdateIVFPhase = async (phase: string) => {
    setIvfPhase(phase);
    setIvfStartDate(new Date()); // reset phase start to today
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ ivf_phase: phase, ivf_start_date: format(new Date(), 'yyyy-MM-dd') })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error updating IVF phase:', error);
      }
    }
  };

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('health_documents')
        .select('id, file_name, ai_suggested_name, ai_suggested_category, ai_summary, uploaded_at, document_type')
        .eq('user_id', user!.id)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setDocumentsLoading(false);
    }
  };

  const getCategoryColor = (category: string | null) => {
    const colors: Record<string, string> = {
      lab_results: 'bg-primary/10 text-primary',
      imaging: 'bg-secondary/10 text-secondary',
      prescription: 'bg-accent/10 text-accent',
      consultation_notes: 'bg-muted',
      vaccination_record: 'bg-primary/20 text-primary',
      other: 'bg-muted'
    };
    return colors[category || 'other'] || 'bg-muted';
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

  // Calculate current cycle day
  const currentCycleDay = periodData 
    ? Math.floor((new Date().getTime() - periodData.lastPeriodStart.getTime()) / (1000 * 60 * 60 * 24)) % periodData.cycleLength + 1
    : 14;

  const healthStats = selectedMode ? getModeStats(selectedMode, currentCycleDay, pregnancyDueDate) : [];

  const mainSections = [
    {
      id: 'B1',
      title: 'Healthcare Services',
      icon: MessageSquare,
      subsections: [
        { id: 'B1.1', title: 'Doctor Chat', description: 'AI medical assistant · GPT-5 & Gemini', action: () => navigate('/dashboard/ai-doctor'), visible: true },
        { id: 'B1.2', title: 'Doctor Consultations', description: 'Find doctors & book appointments', action: () => navigate('/find-doctor'), visible: true },
        { id: 'B1.3', title: 'Upload Health Documents', description: 'Upload & get AI analysis', visible: true },
      ],
    },
    {
      id: 'B2',
      title: 'My Health Dashboard',
      icon: Activity,
      subsections: [
        { id: 'B2.1', title: "Today's Overview", description: 'Current status & insights', visible: true },
        { id: 'B2.2', title: 'Cycle & Phase Tracking', description: 'Visual calendar & predictions', visible: true },
        { id: 'B2.3', title: 'Body Insights & Patterns', description: 'Daily tracking & correlations', visible: true },
        { id: 'B2.4', title: 'Medical Data & Test Results', description: 'Lab results & imaging', action: () => navigate('/dashboard/medical-history'), visible: true },
        { id: 'B2.5', title: 'Medical History', description: 'Conditions & medications', action: () => navigate('/dashboard/medical-history'), visible: true },
        { id: 'B2.6', title: 'Pregnancy Tracker', description: 'Week-by-week development', visible: selectedMode === 'pregnancy' },
        { id: 'B2.7', title: 'Wearable Device Data', description: 'Synced health metrics', visible: true },
        { id: 'B2.8', title: 'Health Goals & Progress', description: 'Track your goals', visible: true },
      ],
    },
    {
      id: 'B3',
      title: 'Personal Records',
      icon: FileText,
      subsections: [
        { id: 'B3.1', title: 'My Profile', description: 'Essential & extended info', visible: true },
        { id: 'B3.2', title: 'Document Library', description: 'Upload & organize documents', visible: true },
        { id: 'B3.3', title: 'Health Timeline', description: 'Chronological health events', visible: true },
        { id: 'B3.4', title: 'Settings & Preferences', description: 'Account & privacy settings', visible: true },
      ],
    },
    {
      id: 'B4',
      title: 'Connected Devices',
      icon: Smartphone,
      subsections: [
        { id: 'B4.1', title: 'Device Management', description: 'My devices & connection status', visible: true },
        { id: 'B4.2', title: 'Sync Settings', description: 'Auto-sync & preferences', visible: true },
        { id: 'B4.3', title: 'Troubleshooting', description: 'Connection & sync issues', visible: true },
      ],
    },
    {
      id: 'B5',
      title: 'Community & Support',
      icon: Users,
      subsections: [
        { id: 'B5.1', title: 'My Groups', description: 'Joined groups & activity', visible: true },
        { id: 'B5.2', title: 'Discover Groups', description: 'Browse recommended groups', visible: true },
        { id: 'B5.3', title: 'Educational Content', description: 'Articles & videos', visible: true },
        { id: 'B5.4', title: 'Upcoming Events', description: 'Webinars & sessions', visible: true },
      ],
    },
  ];

  if (loading || !selectedMode) {
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
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/welcome')}
                className="flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5 text-foreground" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Menu className="h-4 w-4" />
                    Menu
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-card z-50">
                  <DropdownMenuLabel>Navigation</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/dashboard/profile')}>
                    <UserIcon className="mr-2 h-4 w-4" />
                    My Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard/settings')}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard/emergency')}>
                    <Phone className="mr-2 h-4 w-4" />
                    Emergency Contacts
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard/help')}>
                    <HelpCircle className="mr-2 h-4 w-4" />
                    Help & Support
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard/privacy')}>
                    <Shield className="mr-2 h-4 w-4" />
                    Privacy & Security
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard/notifications')}>
                    <Bell className="mr-2 h-4 w-4" />
                    Notifications
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard/terms')}>
                    <FileText className="mr-2 h-4 w-4" />
                    Terms & Policies
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/dashboard/about')}>
                    <Info className="mr-2 h-4 w-4" />
                    About Womanie
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
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
                onModeChange={handleModeChange}
                onNavigate={setActiveSection}
                onUploadClick={() => setUploadDialogOpen(true)}
                onDoctorChatClick={() => navigate('/dashboard/ai-doctor')}
                cycleDay={currentCycleDay}
              />
            </div>
          </div>

          <div className="w-full px-4 py-6">
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
              <h3 className="text-base font-semibold mb-3">
                {selectedMode === 'pregnancy' ? 'Pregnancy Tracking' : selectedMode === 'ivf' ? 'IVF Tracking' : 'Health Tracking'}
              </h3>

              {selectedMode === 'ivf' ? (
                /* ─── IVF Mode ─── */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <IVFTracker
                      ivfStartDate={ivfStartDate}
                      ivfPhase={ivfPhase}
                      onSetIVFStart={handleSetIVFStart}
                      onUpdatePhase={handleUpdateIVFPhase}
                    />
                  </div>
                  <div className="lg:col-span-1 space-y-4">
                    <Card className="p-4">
                      <h3 className="text-lg font-bold mb-4">IVF Health</h3>
                      <div className="space-y-4">
                        {healthStats.map((stat) => {
                          const IconComponent = stat.icon;
                          return (
                            <div key={stat.title} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                              <IconComponent className={`h-5 w-5 ${stat.color} mt-1`} />
                              <div className="flex-1">
                                <div className="text-sm font-medium text-muted-foreground mb-1">{stat.title}</div>
                                <div className="text-lg font-bold mb-1">{stat.value}</div>
                                <div className="text-xs text-muted-foreground">{stat.subtitle}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  </div>
                </div>
              ) : selectedMode === 'pregnancy' ? (
                /* ─── Pregnancy Mode ─── */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-4">
                    <PregnancyTracker
                      dueDate={pregnancyDueDate}
                      onSetDueDate={handleSetPregnancyDueDate}
                      onResetPregnancy={handleResetPregnancy}
                    />
                    {pregnancyDueDate && (
                      <CycleCalendar
                        selectedMode={selectedMode}
                        pregnancyDueDate={pregnancyDueDate}
                      />
                    )}
                  </div>
                  <div className="lg:col-span-1 space-y-4">
                    {pregnancyDueDate ? (
                      <>
                        <Card className="p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold">Pregnancy Health</h3>
                            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => navigate('/dashboard/settings')}>
                              <Settings className="h-3.5 w-3.5" />
                              Settings
                            </Button>
                          </div>
                          <div className="space-y-4">
                            {healthStats.map((stat) => {
                              const IconComponent = stat.icon;
                              return (
                                <div key={stat.title} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                                  <IconComponent className={`h-5 w-5 ${stat.color} mt-1`} />
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-muted-foreground mb-1">{stat.title}</div>
                                    <div className="text-lg font-bold mb-1">{stat.value}</div>
                                    <div className="text-xs text-muted-foreground">{stat.subtitle}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </Card>
                      </>
                    ) : (
                      <Card className="p-4 text-center">
                        <h3 className="text-lg font-bold mb-2">Pregnancy Health</h3>
                        <p className="text-sm text-muted-foreground">
                          Set your due date to see pregnancy insights here.
                        </p>
                      </Card>
                    )}
                  </div>
                </div>
              ) : selectedMode === 'pre-menstrual' ? (
                /* ─── Pre-Menstrual Mode ─── */
                <PreMenstrualDashboard />
              ) : (
                /* ─── Cycle Mode ─── */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <CycleCalendar 
                      lastPeriodStart={periodData?.lastPeriodStart} 
                      cycleLength={periodData?.cycleLength ?? 28} 
                      periodLength={5}
                      selectedMode={selectedMode}
                      ovulationPrediction={ovulationPrediction}
                    />
                  </div>
                  <div className="lg:col-span-1 space-y-4">
                    {periodData ? (
                      <>
                        <Card className="p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold">Cycle Health</h3>
                            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => navigate('/dashboard/settings')}>
                              <Settings className="h-3.5 w-3.5" />
                              Settings
                            </Button>
                          </div>
                          <div className="space-y-4">
                            {healthStats.map((stat) => {
                              const IconComponent = stat.icon;
                              return (
                                <div key={stat.title} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                                  <IconComponent className={`h-5 w-5 ${stat.color} mt-1`} />
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-muted-foreground mb-1">{stat.title}</div>
                                    <div className="text-lg font-bold mb-1">{stat.value}</div>
                                    <div className="text-xs text-muted-foreground">{stat.subtitle}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </Card>

                        <Card className="p-4">
                          <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                            Cycle Phases
                          </h4>
                          <div className="space-y-3">
                            <div className="flex justify-between items-start">
                              <div className="flex items-start gap-2 flex-1">
                                <Sparkles className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                                <div className="flex-1">
                                  <div className="text-xs font-medium text-muted-foreground">Next Ovulation</div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {(() => {
                                      const now = new Date();
                                      let nextOv = addDays(periodData.lastPeriodStart, periodData.cycleLength - 13);
                                      while (nextOv < now) nextOv = addDays(nextOv, periodData.cycleLength);
                                      return `${Math.ceil((nextOv.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))} days`;
                                    })()}
                                  </p>
                                </div>
                              </div>
                              <span className="text-sm font-bold whitespace-nowrap">
                                {(() => {
                                  const now = new Date();
                                  let nextOv = addDays(periodData.lastPeriodStart, periodData.cycleLength - 13);
                                  while (nextOv < now) nextOv = addDays(nextOv, periodData.cycleLength);
                                  return format(nextOv, 'MMM d');
                                })()}
                              </span>
                            </div>
                            <div className="flex justify-between items-start">
                              <div className="flex items-start gap-2 flex-1">
                                <Droplet className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                                <div className="flex-1">
                                  <div className="text-xs font-medium text-muted-foreground">Next Period</div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {(() => {
                                      const now = new Date();
                                      let nextP = addDays(periodData.lastPeriodStart, periodData.cycleLength);
                                      while (nextP < now) nextP = addDays(nextP, periodData.cycleLength);
                                      return `${Math.ceil((nextP.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))} days`;
                                    })()}
                                  </p>
                                </div>
                              </div>
                              <span className="text-sm font-bold whitespace-nowrap">
                                {(() => {
                                  const now = new Date();
                                  let nextP = addDays(periodData.lastPeriodStart, periodData.cycleLength);
                                  while (nextP < now) nextP = addDays(nextP, periodData.cycleLength);
                                  return format(nextP, 'MMM d');
                                })()}
                              </span>
                            </div>
                          </div>
                        </Card>
                      </>
                    ) : (
                      <Card className="p-4 text-center">
                        <h3 className="text-lg font-bold mb-2">Cycle Health</h3>
                        <p className="text-sm text-muted-foreground">
                          Mark your first period day on the calendar to see cycle insights and predictions here.
                        </p>
                      </Card>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Ovulation Prediction - Show for conception and menstrual cycle modes */}
            {(selectedMode === 'conception' || selectedMode === 'menstrual-cycle') && user && periodData && (
              <div className="mb-6">
                <OvulationPrediction 
                  userId={user.id}
                  lastPeriodStart={periodData.lastPeriodStart}
                  cycleLength={periodData.cycleLength}
                  onPredictionUpdate={setOvulationPrediction}
                />
              </div>
            )}

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
                          <div key={sub.id}>
                            {sub.id === 'B1.3' ? (
                              <div id="upload-section" className="p-4 rounded-lg border border-border bg-card">
                                <div className="mb-3">
                                  <div className="font-medium text-sm mb-1">{sub.title}</div>
                                  <div className="text-xs text-muted-foreground">{sub.description}</div>
                                </div>
                                <DocumentUpload />
                                
                                {/* Recent Documents Preview */}
                                {documents.length > 0 && (
                                  <div className="mt-4">
                                    <h5 className="text-xs font-semibold mb-2">Recent Uploads</h5>
                                    <div className="space-y-2">
                                      {documents.slice(0, 2).map((doc) => (
                                        <div key={doc.id} className="bg-muted/50 rounded-lg p-2">
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs font-medium truncate">
                                                {doc.ai_suggested_name || doc.file_name}
                                              </div>
                                              <div className="flex items-center gap-1 mt-1">
                                                <Badge variant="outline" className={`text-[10px] px-1 py-0 ${getCategoryColor(doc.ai_suggested_category)}`}>
                                                  {doc.ai_suggested_category || doc.document_type}
                                                </Badge>
                                              </div>
                                            </div>
                                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                          </div>
                                          {doc.ai_summary && (
                                            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                                              {doc.ai_summary}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                className="justify-start h-auto py-3 px-4 w-full"
                                onClick={() => {
                                  if ('action' in sub && typeof sub.action === 'function') {
                                    sub.action();
                                  } else {
                                    toast({
                                      title: sub.title,
                                      description: sub.description + ' - Coming soon!',
                                    });
                                  }
                                }}
                              >
                                <div className="text-left">
                                  <div className="font-medium text-sm">{sub.title}</div>
                                  <div className="text-xs text-muted-foreground">{sub.description}</div>
                                </div>
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        
        {/* Upload dialog triggered from header */}
        <DocumentUpload open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} showTrigger={false} />
      </div>
  );
};

export default PatientDashboard;
