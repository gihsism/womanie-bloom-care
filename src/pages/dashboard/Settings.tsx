import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ArrowLeft, Baby, Calendar, Heart, Flower2, Sunset, Pill, Shield, Bell, User, Download, Loader2, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import UserMenu from '@/components/UserMenu';
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
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [normalizing, setNormalizing] = useState(false);

  const handleNormalizeTitles = async () => {
    setNormalizing(true);
    try {
      const resp = await fetch('/api/me/normalize-titles', { method: 'POST' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const { scanned, updated } = await resp.json();
      if (updated === 0) {
        toast({
          title: 'Already clean',
          description: `Scanned ${scanned} test names, all already canonical.`,
        });
      } else {
        toast({
          title: 'Test names cleaned up',
          description: `Renamed ${updated} of ${scanned} entries to canonical forms (e.g. Hb → Hemoglobin).`,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Cleanup failed',
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setNormalizing(false);
    }
  };

  const handleDeleteAccount = async () => {
    // Double gate: an initial warning, then a type-to-confirm step so
    // a stray click on the destructive button doesn't eat months of
    // health data.
    if (!window.confirm("This will permanently erase everything Womanie has on you — documents, analyses, cycle logs, chats. This cannot be undone.\n\nContinue?")) {
      return;
    }
    const typed = window.prompt('To confirm, type exactly: DELETE MY ACCOUNT');
    if (typed !== 'DELETE MY ACCOUNT') {
      toast({ title: 'Account delete cancelled' });
      return;
    }
    setDeleting(true);
    try {
      const resp = await fetch('/api/me/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      toast({
        title: 'Account deleted',
        description: 'Your data has been removed. Goodbye.',
      });
      // Full reload so AuthContext drops the now-invalid cookie.
      window.location.href = '/';
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      setDeleting(false);
    }
  };

  const handleDownloadData = async () => {
    setExporting(true);
    try {
      const resp = await fetch('/api/me/export');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `womanie-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: 'Download started',
        description: 'Your Womanie export is saving to your device.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setExporting(false);
    }
  };
  // Notification preferences live in localStorage (no schema change
  // required). When we add a `profiles.notification_settings` JSONB
  // column this can swap to a server round-trip keyed on user.id
  // while keeping the same shape.
  const NOTIFICATION_STORAGE_KEY = user ? `womanie_notification_prefs_${user.id}` : 'womanie_notification_prefs';
  const [notifications, setNotifications] = useState(() => {
    const fallback = { cycleReminders: true, appointmentReminders: true, healthTips: true };
    try {
      const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return { ...fallback, ...parsed };
    } catch {
      return fallback;
    }
  });

  // Re-read when the user id settles (initial mount may run before user
  // loads from AuthContext; this keeps preferences correct per-account).
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setNotifications((prev: typeof notifications) => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await db
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
      const { error } = await db
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
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full" onClick={() => navigate('/dashboard/privacy')}>
              Manage Privacy Settings
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleDownloadData}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download my data
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Exports everything Womanie has on you — profile, documents, analyses, cycle + daily logs, chat history, doctor connections — as a single JSON file.
            </p>
            <Separator />
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleNormalizeTitles}
              disabled={normalizing}
            >
              {normalizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Clean up test names
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Renames any inconsistently-extracted test titles in your existing data (e.g. "Hb" → "Hemoglobin", "FT4" → "Free T4") so trends and history connect properly. New uploads are normalized automatically.
            </p>
            <Separator />
            <Button
              variant="outline"
              className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/30"
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete my account
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Permanently erases your profile, every uploaded document, all analyses, cycle + daily logs, chat history, and doctor connections. This cannot be undone. Consider downloading your data first.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
