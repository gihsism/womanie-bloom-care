import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import ContraceptionDashboard from '@/components/dashboard/ContraceptionDashboard';
import HealthSummaryWidget from '@/components/dashboard/HealthSummaryWidget';
import PregnancyLabInsights from '@/components/dashboard/PregnancyLabInsights';
import CycleLabInsights from '@/components/dashboard/CycleLabInsights';
import { usePageTitle } from '@/hooks/usePageTitle';
import { format, addDays, differenceInDays } from 'date-fns';
import { useMemo } from 'react';
import {
  MessageSquare,
  Activity,
  FileText,
  Smartphone,
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

const PatientDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, session, loading } = useAuth();
  usePageTitle('Dashboard');
  const [profile, setProfile] = useState<{ full_name?: string; life_stage?: string; pregnancy_due_date?: string | null; ivf_start_date?: string | null; ivf_phase?: string | null } | null>(null);
  const [selectedMode, setSelectedMode] = useState<LifeStage | null>(null);
  const [ovulationPrediction, setOvulationPrediction] = useState<{
    ovulationDate?: string;
    fertileWindowStart?: string;
    fertileWindowEnd?: string;
    confidence?: string;
  } | null>(null);
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

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // Fetch profile when user is available or when navigating back to this page
  const location = useLocation();
  useEffect(() => {
    if (user) {
      fetchProfile(user.id);
    }
  }, [user, location.key]);

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

  // Pre-compute next ovulation and period dates to avoid repeated inline calculations
  const cyclePhases = useMemo(() => {
    if (!periodData) return null;
    const now = new Date();
    let nextOvulation = addDays(periodData.lastPeriodStart, periodData.cycleLength - 13);
    while (nextOvulation < now) nextOvulation = addDays(nextOvulation, periodData.cycleLength);
    let nextPeriod = addDays(periodData.lastPeriodStart, periodData.cycleLength);
    while (nextPeriod < now) nextPeriod = addDays(nextPeriod, periodData.cycleLength);
    return {
      nextOvulation,
      nextPeriod,
      daysToOvulation: differenceInDays(nextOvulation, now),
      daysToPeriod: differenceInDays(nextPeriod, now),
    };
  }, [periodData]);

  // Context-aware quick links based on life stage
  const quickLinks = [
    { icon: MessageSquare, label: 'AI Doctor', description: 'Ask health questions', action: () => navigate('/dashboard/ai-doctor'), color: 'bg-primary/10 text-primary' },
    { icon: FileText, label: 'Health Records', description: 'Analysis & trends', action: () => navigate('/dashboard/medical-history'), color: 'bg-secondary/10 text-secondary' },
    { icon: Activity, label: 'Find Doctor', description: 'Book consultation', action: () => navigate('/find-doctor'), color: 'bg-accent/10 text-accent' },
    { icon: Settings, label: 'Settings', description: 'Preferences', action: () => navigate('/dashboard/settings'), color: 'bg-muted text-muted-foreground' },
  ];

  // Life-stage specific tips
  const stageTips: Record<string, { emoji: string; tip: string }[]> = {
    'pregnancy': [
      { emoji: '💊', tip: 'Take your prenatal vitamins daily' },
      { emoji: '💧', tip: 'Drink at least 8 glasses of water' },
      { emoji: '🚶', tip: '30 minutes of gentle exercise helps' },
      { emoji: '📋', tip: 'Upload your latest scan results for analysis' },
    ],
    'conception': [
      { emoji: '🥚', tip: 'Track your ovulation signs daily' },
      { emoji: '🌡️', tip: 'Log basal temperature for better predictions' },
      { emoji: '🥬', tip: 'Start folic acid at least 3 months before' },
    ],
    'menstrual-cycle': [
      { emoji: '📅', tip: 'Log your period start day for better predictions' },
      { emoji: '💤', tip: 'Sleep quality affects your cycle' },
      { emoji: '🩸', tip: 'Upload blood test results for personalized insights' },
    ],
    'menopause': [
      { emoji: '🌡️', tip: 'Log hot flashes to track patterns' },
      { emoji: '🦴', tip: 'Check vitamin D and calcium levels' },
      { emoji: '🏃', tip: 'Weight-bearing exercise supports bone health' },
    ],
  };

  if (loading || !selectedMode) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-6 w-20 ml-auto" />
          </div>
          <div className="mt-4 flex gap-3">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
        <div className="px-4 py-6 space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
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
             <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => navigate('/welcome')}
                className="flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-md hover:bg-muted transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
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
              
              <a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }} className="text-xl font-bold text-primary hover:opacity-80 transition-opacity">
                Womanie
              </a>
            </div>
                <div className="flex items-center gap-2" />
              </div>
              <DashboardHeader 
                userName={getUserName()}
                selectedMode={selectedMode}
                onModeChange={handleModeChange}
                onNavigate={() => {}}
                onUploadClick={() => setUploadDialogOpen(true)}
                onDoctorChatClick={() => navigate('/dashboard/ai-doctor')}
                cycleDay={currentCycleDay}
              />
            </div>
          </div>

          <div className="w-full px-4 py-6">
            {/* Profile Completion Banner — only show if name isn't set */}
            {!profile?.full_name && (
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
            )}

            {/* Health Summary from medical documents */}
            <HealthSummaryWidget />

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
                    <PregnancyLabInsights />
                    {pregnancyDueDate && (
                      <Card className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-bold">Pregnancy Stats</h3>
                          <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => navigate('/dashboard/settings')}>
                            <Settings className="h-3 w-3" />
                            Settings
                          </Button>
                        </div>
                        <div className="space-y-3">
                          {healthStats.map((stat) => {
                            const IconComponent = stat.icon;
                            return (
                              <div key={stat.title} className="flex items-start gap-2.5 pb-2.5 border-b last:border-0 last:pb-0">
                                <IconComponent className={`h-4 w-4 ${stat.color} mt-0.5`} aria-hidden="true" />
                                <div className="flex-1">
                                  <div className="text-[10px] text-muted-foreground">{stat.title}</div>
                                  <div className="text-sm font-bold">{stat.value}</div>
                                  <div className="text-[10px] text-muted-foreground">{stat.subtitle}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    )}
                  </div>
                </div>
              ) : selectedMode === 'pre-menstrual' ? (
                /* ─── Pre-Menstrual Mode ─── */
                <PreMenstrualDashboard />
              ) : (selectedMode === 'menopause' || selectedMode === 'post-menopause') ? (
                /* ─── Menopause / Post-Menopause Mode ─── */
                <MenopauseDashboard isPostMenopause={selectedMode === 'post-menopause'} />
              ) : selectedMode === 'contraception' ? (
                /* ─── Contraception Mode ─── */
                <ContraceptionDashboard onNavigateToDoctorChat={() => navigate('/dashboard/ai-doctor')} />
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
                    <CycleLabInsights mode={selectedMode} />
                    {periodData ? (
                      <>
                        <Card className="p-4">
                          <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                            Cycle Phases
                          </h4>
                          {cyclePhases && (
                          <div className="space-y-3">
                            <div className="flex justify-between items-start">
                              <div className="flex items-start gap-2 flex-1">
                                <Sparkles className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" aria-hidden="true" />
                                <div className="flex-1">
                                  <div className="text-xs font-medium text-muted-foreground">Next Ovulation</div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {cyclePhases.daysToOvulation} days
                                  </p>
                                </div>
                              </div>
                              <span className="text-sm font-bold whitespace-nowrap">
                                {format(cyclePhases.nextOvulation, 'MMM d')}
                              </span>
                            </div>
                            <div className="flex justify-between items-start">
                              <div className="flex items-start gap-2 flex-1">
                                <Droplet className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" aria-hidden="true" />
                                <div className="flex-1">
                                  <div className="text-xs font-medium text-muted-foreground">Next Period</div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {cyclePhases.daysToPeriod} days
                                  </p>
                                </div>
                              </div>
                              <span className="text-sm font-bold whitespace-nowrap">
                                {format(cyclePhases.nextPeriod, 'MMM d')}
                              </span>
                            </div>
                          </div>
                          )}
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

            {/* Two-column layout: Tips + Quick Links */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Daily Tips */}
              {stageTips[selectedMode] && (
                <Card className="p-4">
                  <h3 className="text-sm font-bold mb-3">Daily Reminders</h3>
                  <div className="space-y-2">
                    {stageTips[selectedMode].map((item, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-sm">
                        <span className="text-base">{item.emoji}</span>
                        <span className="text-muted-foreground">{item.tip}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Quick Links */}
              <Card className="p-4">
                <h3 className="text-sm font-bold mb-3">Quick Access</h3>
                <div className="grid grid-cols-2 gap-2">
                  {quickLinks.map(link => {
                    const Icon = link.icon;
                    return (
                      <button
                        key={link.label}
                        onClick={link.action}
                        className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className={`w-8 h-8 rounded-lg ${link.color} flex items-center justify-center flex-shrink-0`}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold">{link.label}</p>
                          <p className="text-[10px] text-muted-foreground">{link.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* Upload + Daily Log side by side */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <DocumentUpload />
              <DailyLogging selectedMode={selectedMode} />
            </div>
          </div>

        {/* Upload dialog triggered from header */}
        <DocumentUpload open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} showTrigger={false} />
      </div>
  );
};

export default PatientDashboard;
