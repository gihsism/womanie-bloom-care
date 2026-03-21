import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRequireRole } from '@/hooks/useRequireRole';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import {
  Users,
  Calendar,
  Settings,
  Stethoscope,
  LogOut,
  UserPlus,
  Clock,
  FileText,
  Video,
  DollarSign,
  ArrowRightLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';

interface DoctorProfile {
  id: string;
  full_name: string;
  specialty: string | null;
  is_verified: boolean;
  verification_status: string | null;
}

interface PatientConnection {
  id: string;
  patient_id: string;
  status: string | null;
  created_at: string;
  connection_type: string | null;
  profiles?: {
    full_name: string | null;
  };
}

interface Appointment {
  id: string;
  patient_id: string;
  scheduled_at: string;
  status: string | null;
  consultation_type: string | null;
  duration: number | null;
}

const DoctorDashboard = () => {
  const navigate = useNavigate();
  usePageTitle('Doctor Portal');
  const { toast } = useToast();
  const { hasRole, loading } = useRequireRole('doctor', '/auth/doctor-login');
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [patients, setPatients] = useState<PatientConnection[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [consultationPrice, setConsultationPrice] = useState<{ price: number; currency: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    if (user) {
      loadDoctorData();
    }
  }, [user]);

  const loadDoctorData = async () => {
    if (!user) return;
    setIsLoadingData(true);

    try {
      // Load doctor profile
      const { data: profile } = await supabase
        .from('doctor_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      setDoctorProfile(profile);

      // Load patient connections
      const { data: connections } = await supabase
        .from('doctor_patient_connections')
        .select('*')
        .eq('doctor_id', user.id)
        .order('created_at', { ascending: false });

      setPatients(connections || []);

      // Load appointments
      const { data: appts } = await supabase
        .from('appointments')
        .select('*')
        .eq('doctor_id', user.id)
        .order('scheduled_at', { ascending: true });

      setAppointments(appts || []);

      // Load consultation price
      const { data: consultSettings } = await supabase
        .from('consultation_settings')
        .select('consultation_price, currency')
        .eq('doctor_id', user.id)
        .maybeSingle();

      if (consultSettings?.consultation_price) {
        setConsultationPrice({
          price: consultSettings.consultation_price,
          currency: consultSettings.currency || 'CHF',
        });
      }
    } catch (error) {
      console.error('Error loading doctor data:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: 'Logged out',
      description: 'You have been logged out successfully.',
    });
    navigate('/');
  };

  const handleSwitchToPatient = () => {
    navigate('/dashboard');
  };

  const getVerificationBadge = () => {
    if (!doctorProfile) return null;
    
    switch (doctorProfile.verification_status) {
      case 'approved':
        return <Badge className="bg-secondary text-secondary-foreground"><CheckCircle className="h-3 w-3 mr-1" /> Verified</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><AlertCircle className="h-3 w-3 mr-1" /> Pending Verification</Badge>;
    }
  };

  const upcomingAppointments = appointments.filter(
    apt => new Date(apt.scheduled_at) > new Date() && apt.status !== 'cancelled'
  );

  const approvedPatients = patients.filter(p => p.status === 'approved');

  if (loading || isLoadingData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-[500px]" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-secondary/10 p-2 rounded-full">
                <Stethoscope className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Doctor Portal</h1>
                <p className="text-sm text-muted-foreground">
                  {doctorProfile?.full_name || 'Doctor'} • {doctorProfile?.specialty || 'Specialist'}
                </p>
              </div>
              {getVerificationBadge()}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSwitchToPatient}>
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Patient Mode
              </Button>
              <a href="/" className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
                Womanie
              </a>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Verification Warning */}
      {doctorProfile?.verification_status !== 'approved' && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-3">
          <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">
              Your account is pending verification. Some features may be limited until your license is verified.
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-4 lg:w-[500px]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="patients">Patients</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{approvedPatients.length}</div>
                  <p className="text-xs text-muted-foreground">Active connections</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{upcomingAppointments.length}</div>
                  <p className="text-xs text-muted-foreground">Scheduled appointments</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{patients.filter(p => p.status === 'pending').length}</div>
                  <p className="text-xs text-muted-foreground">Awaiting response</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Consultation</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {consultationPrice ? `${consultationPrice.currency} ${consultationPrice.price}` : 'Not set'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {consultationPrice ? 'Per session' : 'Set in Settings'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('patients')}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-secondary" />
                    Connect with Patient
                  </CardTitle>
                  <CardDescription>Enter a patient code or send a connection request</CardDescription>
                </CardHeader>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('appointments')}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5 text-primary" />
                    Video Consultations
                  </CardTitle>
                  <CardDescription>Manage your video consultation schedule</CardDescription>
                </CardHeader>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('settings')}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-muted-foreground" />
                    Consultation Settings
                  </CardTitle>
                  <CardDescription>Set prices, schedule, and availability</CardDescription>
                </CardHeader>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingAppointments.length > 0 ? (
                  <div className="space-y-4">
                    {upcomingAppointments.slice(0, 5).map((apt) => (
                      <div key={apt.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 p-2 rounded-full">
                            <Calendar className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">Appointment</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(apt.scheduled_at).toLocaleDateString()} at{' '}
                              {new Date(apt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <Badge variant={apt.consultation_type === 'video' ? 'default' : 'outline'}>
                          {apt.consultation_type || 'consultation'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No upcoming appointments</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Patients Tab */}
          <TabsContent value="patients">
            <PatientManagement 
              patients={patients} 
              onRefresh={loadDoctorData}
              doctorId={user.id}
            />
          </TabsContent>

          {/* Appointments Tab */}
          <TabsContent value="appointments">
            <AppointmentsView appointments={appointments} />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <ConsultationSettings doctorId={user.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// Sub-components
const PatientManagement = ({ patients, onRefresh, doctorId }: { patients: PatientConnection[], onRefresh: () => void, doctorId: string }) => {
  const [accessCode, setAccessCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmitCode = async () => {
    if (!accessCode.trim()) return;
    setIsSubmitting(true);

    try {
      // Find the access code
      const { data: codeData, error: codeError } = await supabase
        .from('patient_access_codes')
        .select('*')
        .eq('code', accessCode.trim())
        .eq('is_used', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (codeError || !codeData) {
        toast({
          variant: 'destructive',
          title: 'Invalid code',
          description: 'This code is invalid, expired, or already used.',
        });
        return;
      }

      // Create connection
      const { error: connectionError } = await supabase
        .from('doctor_patient_connections')
        .insert({
          doctor_id: doctorId,
          patient_id: codeData.patient_id,
          connection_type: 'code',
          status: 'pending',
        });

      if (connectionError) {
        if (connectionError.code === '23505') {
          toast({
            variant: 'destructive',
            title: 'Already connected',
            description: 'You already have a connection with this patient.',
          });
        } else {
          throw connectionError;
        }
        return;
      }

      // Mark code as used
      await supabase
        .from('patient_access_codes')
        .update({ is_used: true })
        .eq('id', codeData.id);

      toast({
        title: 'Connection request sent',
        description: 'The patient will need to approve your connection request.',
      });

      setAccessCode('');
      onRefresh();
    } catch (error) {
      console.error('Error submitting code:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to process the access code.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Enter Access Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Connect with Patient
          </CardTitle>
          <CardDescription>Enter a patient's access code to send a connection request</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Enter 6-digit code"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary bg-background"
              maxLength={6}
            />
            <Button 
              onClick={handleSubmitCode} 
              disabled={accessCode.length < 6 || isSubmitting}
              className="bg-secondary hover:bg-secondary/90"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Code'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Patient List */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Patients</CardTitle>
          <CardDescription>{patients.filter(p => p.status === 'approved').length} approved connections</CardDescription>
        </CardHeader>
        <CardContent>
          {patients.length > 0 ? (
            <div className="space-y-4">
              {patients.map((patient) => (
                <div key={patient.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="bg-muted p-2 rounded-full">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">Patient #{patient.patient_id.slice(0, 8)}</p>
                      <p className="text-sm text-muted-foreground">
                        Connected via {patient.connection_type || 'request'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={patient.status === 'approved' ? 'default' : 'outline'}>
                      {patient.status}
                    </Badge>
                    {patient.status === 'approved' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(`/doctor/patient/${patient.patient_id}`)}
                      >
                        View Details
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No patient connections yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const AppointmentsView = ({ appointments }: { appointments: Appointment[] }) => {
  const upcomingAppointments = appointments.filter(
    apt => new Date(apt.scheduled_at) > new Date() && apt.status !== 'cancelled'
  );

  const pastAppointments = appointments.filter(
    apt => new Date(apt.scheduled_at) <= new Date() || apt.status === 'cancelled'
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingAppointments.length > 0 ? (
            <div className="space-y-4">
              {upcomingAppointments.map((apt) => (
                <div key={apt.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-full">
                      {apt.consultation_type === 'video' ? (
                        <Video className="h-4 w-4 text-primary" />
                      ) : (
                        <Calendar className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {new Date(apt.scheduled_at).toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(apt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                        {apt.duration} min
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{apt.consultation_type || 'consultation'}</Badge>
                    <Button size="sm" variant="outline">
                      {apt.consultation_type === 'video' ? 'Join Call' : 'Details'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No upcoming appointments</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          {pastAppointments.length > 0 ? (
            <div className="space-y-4">
              {pastAppointments.slice(0, 10).map((apt) => (
                <div key={apt.id} className="flex items-center justify-between border-b pb-4 last:border-0 opacity-60">
                  <div>
                    <p className="font-medium">
                      {new Date(apt.scheduled_at).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-muted-foreground">{apt.duration} min • {apt.status}</p>
                  </div>
                  <Badge variant="outline">{apt.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No past appointments</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const ConsultationSettings = ({ doctorId }: { doctorId: string }) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState({
    is_available: false,
    consultation_price: 80,
    currency: 'CHF',
    consultation_duration: 30,
    video_enabled: true,
  });

  useEffect(() => {
    loadSettings();
  }, [doctorId]);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('consultation_settings')
        .select('*')
        .eq('doctor_id', doctorId)
        .maybeSingle();

      if (data) {
        setSettings({
          is_available: data.is_available || false,
          consultation_price: data.consultation_price || 80,
          currency: data.currency || 'CHF',
          consultation_duration: data.consultation_duration || 30,
          video_enabled: data.video_enabled ?? true,
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('consultation_settings')
        .upsert({
          doctor_id: doctorId,
          ...settings,
        });

      if (error) throw error;

      toast({
        title: 'Settings saved',
        description: 'Your consultation settings have been updated.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Consultation Settings
          </CardTitle>
          <CardDescription>Configure your consultation availability and pricing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Availability Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Available for Consultations</p>
              <p className="text-sm text-muted-foreground">Turn on to accept new appointments</p>
            </div>
            <Switch
              checked={settings.is_available}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, is_available: checked }))}
              aria-label="Toggle consultation availability"
            />
          </div>

          {/* Pricing */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Pricing
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Consultation Price</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={settings.consultation_price}
                    onChange={(e) => setSettings(s => ({ ...s, consultation_price: Number(e.target.value) }))}
                    className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary bg-background"
                    min={0}
                  />
                  <select
                    value={settings.currency}
                    onChange={(e) => setSettings(s => ({ ...s, currency: e.target.value }))}
                    className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary bg-background"
                  >
                    <option value="CHF">CHF</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Session Duration (minutes)</label>
                <select
                  value={settings.consultation_duration}
                  onChange={(e) => setSettings(s => ({ ...s, consultation_duration: Number(e.target.value) }))}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary bg-background"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>
            </div>
          </div>

          {/* Video Consultations */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium flex items-center gap-2">
                <Video className="h-4 w-4" aria-hidden="true" />
                Video Consultations
              </p>
              <p className="text-sm text-muted-foreground">Enable video call appointments</p>
            </div>
            <Switch
              checked={settings.video_enabled}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, video_enabled: checked }))}
              aria-label="Toggle video consultations"
            />
          </div>

          {/* Payment Info */}
          <div className="p-4 border rounded-lg bg-muted/50">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Payment Processing</p>
                <p className="text-sm text-muted-foreground">
                  Payment processing will be enabled soon. Patients will be able to pay for consultations directly through the platform.
                </p>
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="w-full bg-secondary hover:bg-secondary/90">
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* Schedule Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Weekly Schedule
          </CardTitle>
          <CardDescription>Set your available hours for each day</CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleEditor doctorId={doctorId} />
        </CardContent>
      </Card>
    </div>
  );
};

const ScheduleEditor = ({ doctorId }: { doctorId: string }) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [schedule, setSchedule] = useState<Record<number, { start: string; end: string; active: boolean }>>({
    0: { start: '09:00', end: '17:00', active: false },
    1: { start: '09:00', end: '17:00', active: true },
    2: { start: '09:00', end: '17:00', active: true },
    3: { start: '09:00', end: '17:00', active: true },
    4: { start: '09:00', end: '17:00', active: true },
    5: { start: '09:00', end: '17:00', active: true },
    6: { start: '09:00', end: '17:00', active: false },
  });

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Load existing schedule
  useEffect(() => {
    const loadSchedule = async () => {
      const { data } = await supabase
        .from('doctor_schedule')
        .select('*')
        .eq('doctor_id', doctorId);

      if (data && data.length > 0) {
        const loaded = { ...schedule };
        data.forEach(s => {
          if (s.day_of_week !== null) {
            loaded[s.day_of_week] = {
              start: s.start_time,
              end: s.end_time,
              active: s.is_active ?? true,
            };
          }
        });
        setSchedule(loaded);
      }
    };
    loadSchedule();
  }, [doctorId]);

  const handleSaveSchedule = async () => {
    setIsSaving(true);
    try {
      // Delete existing schedule
      await supabase.from('doctor_schedule').delete().eq('doctor_id', doctorId);

      // Insert new schedule for active days
      const rows = Object.entries(schedule)
        .filter(([, s]) => s.active)
        .map(([day, s]) => ({
          doctor_id: doctorId,
          day_of_week: Number(day),
          start_time: s.start,
          end_time: s.end,
          is_active: true,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from('doctor_schedule').insert(rows);
        if (error) throw error;
      }

      toast({ title: 'Schedule saved', description: 'Your weekly schedule has been updated.' });
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save schedule.' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    setSchedule(s => ({
      ...s,
      [day]: { ...s[day], active: !s[day].active }
    }));
  };

  const updateTime = (day: number, field: 'start' | 'end', value: string) => {
    setSchedule(s => ({
      ...s,
      [day]: { ...s[day], [field]: value }
    }));
  };

  return (
    <div className="space-y-3">
      {days.map((dayName, index) => (
        <div key={index} className="flex items-center gap-4 p-3 border rounded-lg">
          <button
            onClick={() => toggleDay(index)}
            className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
              schedule[index].active 
                ? 'bg-secondary border-secondary text-secondary-foreground' 
                : 'border-muted-foreground'
            }`}
          >
            {schedule[index].active && <CheckCircle className="h-4 w-4" />}
          </button>
          <span className="w-24 font-medium">{dayName}</span>
          {schedule[index].active ? (
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={schedule[index].start}
                onChange={(e) => updateTime(index, 'start', e.target.value)}
                className="px-3 py-1 border rounded bg-background"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="time"
                value={schedule[index].end}
                onChange={(e) => updateTime(index, 'end', e.target.value)}
                className="px-3 py-1 border rounded bg-background"
              />
            </div>
          ) : (
            <span className="text-muted-foreground">Unavailable</span>
          )}
        </div>
      ))}
      <Button
        className="w-full mt-4 bg-secondary hover:bg-secondary/90"
        onClick={handleSaveSchedule}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          'Save Schedule'
        )}
      </Button>
    </div>
  );
};

export default DoctorDashboard;
