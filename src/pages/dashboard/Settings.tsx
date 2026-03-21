import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ArrowLeft, Baby, Calendar, Heart, Flower2, Sunset, Pill, Shield, Bell, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';

const lifeStageOptions = [
  {
    value: 'pre-menstrual',
    icon: Flower2,
    title: 'Pre-Menstrual',
    description: 'Before first period',
  },
  {
    value: 'menstrual-cycle',
    icon: Calendar,
    title: 'Regular Menstrual Cycle',
    description: 'Tracking my cycle',
  },
  {
    value: 'contraception',
    icon: Shield,
    title: 'Contraception Mode',
    description: 'Managing birth control',
  },
  {
    value: 'conception',
    icon: Heart,
    title: 'Trying to Conceive',
    description: 'Planning pregnancy',
  },
  {
    value: 'ivf',
    icon: Heart,
    title: 'IVF Mode',
    description: 'Fertility treatment tracking',
  },
  {
    value: 'pregnancy',
    icon: Baby,
    title: 'Pregnancy Mode',
    description: 'Expecting a baby',
  },
  {
    value: 'menopause',
    icon: Sunset,
    title: 'Menopause',
    description: 'Managing menopause transition',
  },
  {
    value: 'post-menopause',
    icon: Sunset,
    title: 'Post-Menopause',
    description: 'After menopause',
  },
];

const Settings = () => {
  const navigate = useNavigate();
  usePageTitle('Settings');
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedStage, setSelectedStage] = useState<LifeStage>('menstrual-cycle');
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState({
    cycleReminders: true,
    appointmentReminders: true,
    healthTips: true,
  });

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('life_stage')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (data?.life_stage) {
        setSelectedStage(data.life_stage as LifeStage);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleLifeStageChange = async (value: string) => {
    const stage = value as LifeStage;
    setSelectedStage(stage);
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ life_stage: stage })
        .eq('id', user?.id);

      if (error) throw error;
      
      toast({
        title: 'Settings saved',
        description: 'Your life stage has been updated.',
      });
    } catch (error) {
      console.error('Error saving life stage:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/dashboard')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="h-6 w-px bg-border" />
              <h1 className="text-xl font-bold text-primary">Settings</h1>
            </div>
            <a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
              Womanie
            </a>
          </div>
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Life Stage Mode */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Life Stage Mode
            </CardTitle>
            <CardDescription>
              Choose your current life stage to personalize your dashboard, tracking features, and health insights.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={selectedStage}
              onValueChange={handleLifeStageChange}
              className="grid gap-3"
              disabled={saving}
            >
              {lifeStageOptions.map((stage) => {
                const Icon = stage.icon;
                return (
                  <div
                    key={stage.value}
                    className={`flex items-center space-x-4 rounded-lg border p-4 cursor-pointer transition-all hover:border-primary/50 ${
                      selectedStage === stage.value ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onClick={() => handleLifeStageChange(stage.value)}
                  >
                    <RadioGroupItem value={stage.value} id={stage.value} />
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        selectedStage === stage.value ? 'bg-primary/20' : 'bg-muted'
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${
                          selectedStage === stage.value ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={stage.value} className="font-medium cursor-pointer">
                        {stage.title}
                      </Label>
                      <p className="text-sm text-muted-foreground">{stage.description}</p>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Account
            </CardTitle>
            <CardDescription>
              Your account details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">{user?.email || '—'}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Member since</span>
              <span className="text-sm font-medium">
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : '—'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>
              Manage your notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Cycle Reminders</Label>
                <p className="text-sm text-muted-foreground">Get notified about your cycle phases</p>
              </div>
              <Switch
                checked={notifications.cycleReminders}
                onCheckedChange={(checked) => {
                  setNotifications(prev => ({ ...prev, cycleReminders: checked }));
                  toast({ title: checked ? 'Cycle reminders enabled' : 'Cycle reminders disabled' });
                }}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Appointment Reminders</Label>
                <p className="text-sm text-muted-foreground">Reminders for upcoming doctor appointments</p>
              </div>
              <Switch
                checked={notifications.appointmentReminders}
                onCheckedChange={(checked) => {
                  setNotifications(prev => ({ ...prev, appointmentReminders: checked }));
                  toast({ title: checked ? 'Appointment reminders enabled' : 'Appointment reminders disabled' });
                }}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Health Tips</Label>
                <p className="text-sm text-muted-foreground">Daily tips based on your health journey</p>
              </div>
              <Switch
                checked={notifications.healthTips}
                onCheckedChange={(checked) => {
                  setNotifications(prev => ({ ...prev, healthTips: checked }));
                  toast({ title: checked ? 'Health tips enabled' : 'Health tips disabled' });
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Privacy & Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy & Security
            </CardTitle>
            <CardDescription>
              Manage your data and privacy settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/dashboard/privacy')}>
              Manage Privacy Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
