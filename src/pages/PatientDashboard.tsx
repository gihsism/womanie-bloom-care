import { useNavigate } from 'react-router-dom';
import { 
  Stethoscope, 
  Activity, 
  FileText, 
  Watch, 
  Users,
  User,
  LogOut
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const dashboardButtons = [
  {
    id: 'B1',
    title: 'Healthcare Services',
    description: 'Active consultations, chat with AI or doctors',
    icon: Stethoscope,
    color: 'primary',
  },
  {
    id: 'B2',
    title: 'My Health Dashboard',
    description: 'Live tracking, cycle phases, blood results, trends',
    icon: Activity,
    color: 'secondary',
  },
  {
    id: 'B3',
    title: 'Historical Records',
    description: 'Permanent archive, uploaded documents, personal profile',
    icon: FileText,
    color: 'accent',
  },
  {
    id: 'B4',
    title: 'Device Connection',
    description: 'Sync with wearables, background health data',
    icon: Watch,
    color: 'primary',
  },
  {
    id: 'B5',
    title: 'Community',
    description: 'Support groups, shared experiences, Telegram/WhatsApp',
    icon: Users,
    color: 'secondary',
  },
];

const PatientDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to log out',
      });
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-primary">Womanie</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/profile')}
              >
                <User className="h-4 w-4 mr-2" />
                Profile
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Log Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome Banner */}
        <div className="mb-8">
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">
            Welcome to Your Health Journey
          </h2>
          <Card className="p-6 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">
                  Complete your profile for better personalized services
                </h3>
                <p className="text-muted-foreground">
                  Tell us about your health journey to get customized insights, tracking, and recommendations
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
        </div>

        {/* Health Statistics Placeholder */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold mb-4">Your Health Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cycle Day</p>
                  <p className="text-2xl font-bold">-</p>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center">
                  <Stethoscope className="h-6 w-6 text-secondary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Next Appointment</p>
                  <p className="text-2xl font-bold">-</p>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Health Records</p>
                  <p className="text-2xl font-bold">0</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Dashboard Buttons Grid */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold mb-4">Your Health Tools</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboardButtons.map((button) => {
              const Icon = button.icon;
              return (
                <Card
                  key={button.id}
                  className="p-6 cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 group"
                  onClick={() => {
                    toast({
                      title: 'Coming soon',
                      description: `${button.title} will be available soon`,
                    });
                  }}
                >
                  <div className="flex flex-col h-full">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`w-12 h-12 rounded-lg bg-${button.color}/10 flex items-center justify-center group-hover:bg-${button.color}/20 transition-colors`}>
                        <Icon className={`h-6 w-6 text-${button.color}`} />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{button.id}</span>
                    </div>
                    <h4 className="text-lg font-bold mb-2">{button.title}</h4>
                    <p className="text-sm text-muted-foreground flex-1">
                      {button.description}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};

export default PatientDashboard;
