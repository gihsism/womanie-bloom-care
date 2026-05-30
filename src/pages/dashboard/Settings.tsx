import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ArrowLeft, Baby, Calendar, Heart, Flower2, Sunset, Pill, Shield, Bell, User, Download, Loader2, Trash2, Wand2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { scorePassword } from '@/lib/password-strength';
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
    value: 'postpartum',
    icon: Baby,
    title: 'Postpartum',
    description: 'After giving birth — fourth-trimester and beyond',
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
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Personal info parked in localStorage by onboarding (commitOnboarding
  // in src/lib/onboarding-commit.ts) because profiles doesn't yet have
  // columns for DOB / height / weight / blood type. Editing it here
  // keeps callers on the same key so the data is visible end-to-end
  // until the schema lands.
  const basicInfoKey = user ? `womanie_basic_info_${user.id}` : null;
  const [basicInfo, setBasicInfo] = useState<{
    dateOfBirth: string | null;
    heightCm: number | null;
    weightKg: number | null;
    bloodType: string | null;
  }>({ dateOfBirth: null, heightCm: null, weightKg: null, bloodType: null });

  useEffect(() => {
    if (!basicInfoKey) return;
    try {
      const raw = localStorage.getItem(basicInfoKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setBasicInfo({
          dateOfBirth: parsed.dateOfBirth ?? null,
          heightCm: typeof parsed.heightCm === 'number' ? parsed.heightCm : null,
          weightKg: typeof parsed.weightKg === 'number' ? parsed.weightKg : null,
          bloodType: parsed.bloodType ?? null,
        });
      }
    } catch {
      // Corrupt JSON — leave fields empty.
    }
  }, [basicInfoKey]);

  const saveBasicInfo = (next: typeof basicInfo) => {
    setBasicInfo(next);
    if (!basicInfoKey) return;
    try {
      localStorage.setItem(basicInfoKey, JSON.stringify(next));
    } catch {
      // Quota / private mode — silently ignore.
    }
  };

  const ageFromDob = (dob: string | null): number | null => {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 0 && age <= 130 ? age : null;
  };

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswords(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ variant: 'destructive', title: 'Password too short', description: 'Use at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Passwords do not match', description: 'Re-type the new password.' });
      return;
    }
    setChangingPassword(true);
    try {
      const resp = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      toast({
        title: 'Password updated',
        description: 'Other devices have been signed out.',
      });
      resetPasswordForm();
      setShowPasswordForm(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not change password',
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleNormalizeTitles = async () => {
    setNormalizing(true);
    try {
      const resp = await fetch('/api/me/normalize-titles', { method: 'POST' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const { scanned, titlesUpdated, unitsUpdated } = await resp.json() as {
        scanned: number;
        titlesUpdated?: number;
        unitsUpdated?: number;
      };
      const tu = titlesUpdated ?? 0;
      const uu = unitsUpdated ?? 0;
      if (tu === 0 && uu === 0) {
        toast({
          title: 'Already clean',
          description: `Scanned ${scanned} entries — names + units are all canonical.`,
        });
      } else {
        const parts: string[] = [];
        if (tu > 0) parts.push(`${tu} test name${tu > 1 ? 's' : ''}`);
        if (uu > 0) parts.push(`${uu} unit${uu > 1 ? 's' : ''}`);
        toast({
          title: 'Cleanup complete',
          description: `Normalized ${parts.join(' + ')} across ${scanned} entries (e.g. Hb → Hemoglobin, μg/L casing).`,
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

        {/* Personal info — DOB / height / weight / blood type. Lives in
            localStorage scoped by user.id until the profiles schema gets
            dedicated columns. Onboarding writes the same key, so this is
            the place to view + edit what you entered then. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal info
            </CardTitle>
            <CardDescription>
              These show up in your health summary and help personalize insights. Stored on this device for now.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dob">Date of birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={basicInfo.dateOfBirth ?? ''}
                  onChange={(e) =>
                    saveBasicInfo({ ...basicInfo, dateOfBirth: e.target.value || null })
                  }
                />
                {ageFromDob(basicInfo.dateOfBirth) !== null && (
                  <p className="text-[11px] text-muted-foreground">
                    Age {ageFromDob(basicInfo.dateOfBirth)}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="blood-type">Blood type</Label>
                <Select
                  value={basicInfo.bloodType ?? ''}
                  onValueChange={(v) =>
                    saveBasicInfo({ ...basicInfo, bloodType: v === 'unknown' ? null : v })
                  }
                >
                  <SelectTrigger id="blood-type">
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A+">A+</SelectItem>
                    <SelectItem value="A-">A−</SelectItem>
                    <SelectItem value="B+">B+</SelectItem>
                    <SelectItem value="B-">B−</SelectItem>
                    <SelectItem value="AB+">AB+</SelectItem>
                    <SelectItem value="AB-">AB−</SelectItem>
                    <SelectItem value="O+">O+</SelectItem>
                    <SelectItem value="O-">O−</SelectItem>
                    <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                    <SelectItem value="unknown">Clear</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="height">Height (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  inputMode="decimal"
                  min={50}
                  max={250}
                  value={basicInfo.heightCm ?? ''}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    saveBasicInfo({
                      ...basicInfo,
                      heightCm: Number.isFinite(n) ? n : null,
                    });
                  }}
                  placeholder="e.g. 165"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={300}
                  step={0.1}
                  value={basicInfo.weightKg ?? ''}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    saveBasicInfo({
                      ...basicInfo,
                      weightKg: Number.isFinite(n) ? n : null,
                    });
                  }}
                  placeholder="e.g. 62"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              These fields autosave as you change them.
            </p>
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

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Password
            </CardTitle>
            <CardDescription>
              Change the password you use to sign in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showPasswordForm ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowPasswordForm(true)}
              >
                Change password
              </Button>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input
                    id="current-password"
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  {newPassword ? (
                    (() => {
                      const s = scorePassword(newPassword);
                      return (
                        <div className="space-y-1">
                          <div className="flex gap-1" aria-hidden="true">
                            {[1, 2, 3, 4, 5].map((tick) => (
                              <div
                                key={tick}
                                className={`h-1 flex-1 rounded-full ${
                                  tick <= s.score ? s.color : 'bg-muted'
                                }`}
                              />
                            ))}
                          </div>
                          <p className="text-[11px] flex items-center justify-between" role="status">
                            <span className="font-medium">{s.label}</span>
                            <span className="text-muted-foreground">{s.hint}</span>
                          </p>
                        </div>
                      );
                    })()
                  ) : (
                    <p className="text-[11px] text-muted-foreground">At least 8 characters.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showPasswords ? 'Hide passwords' : 'Show passwords'}
                </button>
                <p className="text-[11px] text-muted-foreground">
                  Changing your password signs out every other device.
                </p>
                <div className="flex gap-2">
                  <Button type="submit" disabled={changingPassword} className="flex-1">
                    {changingPassword ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating…</>
                    ) : (
                      'Update password'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { resetPasswordForm(); setShowPasswordForm(false); }}
                    disabled={changingPassword}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
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
              Clean up test names + units
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Renames any inconsistently-extracted test titles and unit notations in your existing data (e.g. "Hb" → "Hemoglobin", "mcg/L" → "μg/L") so trends and history connect properly. New uploads are normalized automatically.
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
