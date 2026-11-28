import { useConfirm } from '@/components/ConfirmDialog';
import { deleteAccountConfirm } from '@/lib/confirmCopy';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ArrowLeft, Baby, Calendar, Heart, Flower2, Sunset, Shield, Bell, User, Download, Loader2, Trash2, Wand2, KeyRound, Eye, EyeOff, Pill, Inbox, Phone, Smartphone, Users, HelpCircle, Info, LogOut, UserCog, FileText, Activity } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { scorePassword } from '@/lib/password-strength';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ChartAccessLog from '@/components/dashboard/ChartAccessLog';
import ConsentLog from '@/components/dashboard/ConsentLog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { normalizeLifeStage } from '@/lib/lifeStage';
import { pushAccountData, useAccountDataVersion } from '@/lib/account-data';
import { LIFE_STAGE_LABELS, LIFE_STAGE_DESCRIPTIONS } from '@/lib/lifeStageLabels';
import MedicineLog from '@/components/dashboard/MedicineLog';
import PhoneNotifications from '@/components/dashboard/PhoneNotifications';
import { IN_APP_SWITCHES, REMINDER_OVERVIEW, phoneLabel, type InAppPref } from '@/lib/reminderSwitches';
import { useAttentionCount } from '@/hooks/useAttentionCount';
import { MeRow, MeGroup } from './me/MeRow';
import { ME_SECTIONS, meSectionFromHash } from './me/sections';

// Labels come from the one label map (src/lib/lifeStageLabels.ts); the
// stored values (profiles.life_stage) are unchanged.
const stageIcons: Record<LifeStage, typeof Calendar> = {
  'pre-menstrual': Flower2,
  'menstrual-cycle': Calendar,
  contraception: Shield,
  conception: Heart,
  ivf: Heart,
  pregnancy: Baby,
  postpartum: Baby,
  menopause: Sunset,
  'post-menopause': Sunset,
};

const lifeStageOptions = (Object.keys(stageIcons) as LifeStage[]).map((value) => ({
  value,
  icon: stageIcons[value],
  title: LIFE_STAGE_LABELS[value],
  description: LIFE_STAGE_DESCRIPTIONS[value],
}));

const Settings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Me is a list of rows; each row opens a sub-page at #<section>.
  const section = meSectionFromHash(location.hash);
  usePageTitle(section ? ME_SECTIONS[section] : 'Me');
  const openSection = (id: keyof typeof ME_SECTIONS) => navigate(`/dashboard/settings#${id}`);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section]);
  const attention = useAttentionCount();
  const { user } = useAuth();
  const { toast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [selectedStage, setSelectedStage] = useState<LifeStage>('menstrual-cycle');
  // Her name (profiles.full_name): the Home greeting and Ask AI use it,
  // and Home's "Add your name" row leads here.
  const [savedName, setSavedName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  // Google-only accounts have no password yet: offer "Set a password".
  const [passwordJustSet, setPasswordJustSet] = useState(false);
  const settingFirst = user?.hasPassword === false && !passwordJustSet;
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

  const accountVersion = useAccountDataVersion([basicInfoKey, user ? `womanie_notification_prefs_${user.id}` : null]);
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
  }, [basicInfoKey, accountVersion]);

  const saveBasicInfo = (next: typeof basicInfo) => {
    setBasicInfo(next);
    if (!basicInfoKey) return;
    try {
      localStorage.setItem(basicInfoKey, JSON.stringify(next));
      pushAccountData(user?.id, basicInfoKey);
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
        body: JSON.stringify(settingFirst ? { newPassword } : { currentPassword, newPassword }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      toast(settingFirst
        ? { title: 'Password set', description: 'You can now also sign in with your email and this password.' }
        : { title: 'Password updated', description: 'Other devices have been signed out.' });
      if (settingFirst) setPasswordJustSet(true);
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
    // Double gate in one in-app dialog: the warning, then a
    // type-to-confirm field, so a stray click on the destructive button
    // doesn't eat months of health data.
    if (!(await confirm(deleteAccountConfirm()))) {
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
  // healthTips: kept in the saved shape, but its switch is gone: the daily
  // tip card it controlled left Home on 2026-11-23 and nothing reads it.
  type NotificationPrefs = { cycleReminders: boolean; appointmentReminders: boolean; healthTips: boolean };
  const [notifications, setNotifications] = useState<NotificationPrefs>(() => {
    const fallback: NotificationPrefs = { cycleReminders: true, appointmentReminders: true, healthTips: true };
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
  }, [user?.id, accountVersion]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
      pushAccountData(user?.id, NOTIFICATION_STORAGE_KEY);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  const stagePicked = useRef(false);
  const loadSettings = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await db
        .from('profiles')
        .select('life_stage, full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      // A stage tapped while this load was in flight wins: the late reply
      // holds the old value and used to snap the picker back to it.
      if (data?.life_stage && !stagePicked.current) {
        setSelectedStage(normalizeLifeStage(data.life_stage));
      }
      const name = (data as { full_name?: string | null } | null)?.full_name?.trim() || null;
      setSavedName(name);
      setNameInput(name ?? '');
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim().slice(0, 80);
    if (!user || !trimmed || trimmed === savedName) return;
    setSavingName(true);
    try {
      const { error } = await db.from('profiles').update({ full_name: trimmed }).eq('id', user.id);
      if (error) throw error;
      setSavedName(trimmed);
      setNameInput(trimmed);
      toast({ title: 'Name saved', description: `We'll call you ${trimmed.split(' ')[0]}.` });
    } catch (err) {
      console.error('Save name failed:', err);
      toast({ variant: 'destructive', title: 'Could not save your name', description: 'Please try again.' });
    } finally {
      setSavingName(false);
    }
  };

  // One tap on a stage card reaches this twice (the radio's onValueChange
  // and the card's onClick); live that was two saves per tap. Skip a
  // repeat for the stage that is already being saved.
  const savingStage = useRef<string | null>(null);
  const handleLifeStageChange = async (value: string) => {
    if (savingStage.current === value) return;
    savingStage.current = value;
    stagePicked.current = true;
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
      savingStage.current = null;
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
    {confirmDialog}
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {section && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/dashboard/settings')}
                    className="gap-2"
                    aria-label="Back to Me"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Me
                  </Button>
                  <div className="h-6 w-px bg-border" />
                </>
              )}
              <h1 className="font-display text-xl font-medium">{section ? ME_SECTIONS[section] : 'Me'}</h1>
            </div>
          </div>
        </div>
      </div>

      {!section && (
        <div className="w-full max-w-3xl mx-auto px-4 py-6 space-y-6" data-testid="me-list">
          <MeGroup>
            <MeRow icon={User} label={savedName || user?.name || 'Your profile'} value={savedName || user?.name ? 'Profile' : user?.email} onClick={() => openSection('profile')} testId="me-row-profile" />
            <MeRow icon={Calendar} label="Life stage" value={LIFE_STAGE_LABELS[selectedStage]} onClick={() => openSection('life-stage')} testId="me-row-life-stage" />
          </MeGroup>
          <MeGroup>
            <MeRow icon={Activity} label="Health overview" value="Your numbers over time" onClick={() => navigate('/dashboard/health-overview')} testId="me-row-health-overview" />
            <MeRow icon={Pill} label="Medicines & supplements" onClick={() => openSection('medicines')} testId="me-row-medicines" />
            <MeRow icon={Bell} label="Reminders" onClick={() => openSection('reminders')} testId="me-row-reminders" />
            <MeRow icon={FileText} label="Prepare a visit summary" value="For any doctor" onClick={() => navigate('/dashboard/visit-summary/print')} testId="me-row-visit-summary" />
            <MeRow icon={Inbox} label="Needs your attention" badge={attention.total} onClick={() => navigate('/dashboard/notifications')} testId="me-row-attention" />
            <MeRow icon={Phone} label="Emergency contacts" onClick={() => navigate('/dashboard/emergency')} testId="me-row-emergency" />
            <MeRow icon={Smartphone} label="Connected devices" onClick={() => navigate('/dashboard/devices')} testId="me-row-devices" />
            <MeRow icon={Users} label="Community" onClick={() => navigate('/community')} testId="me-row-community" />
          </MeGroup>
          <MeGroup>
            <MeRow icon={Shield} label="Privacy & your data" onClick={() => openSection('privacy')} testId="me-row-privacy" />
            <MeRow icon={KeyRound} label="Password & sign-in" onClick={() => openSection('password')} testId="me-row-password" />
            <MeRow icon={HelpCircle} label="Help" onClick={() => navigate('/dashboard/help')} testId="me-row-help" />
            <MeRow icon={Info} label="About & terms" onClick={() => navigate('/about')} testId="me-row-about" />
            {user?.isAdmin && (
              <MeRow icon={UserCog} label="Doctor approvals (admin)" onClick={() => navigate('/admin/doctors')} testId="me-row-admin" />
            )}
          </MeGroup>
          <Button
            variant="outline"
            className="w-full gap-2 text-destructive hover:text-destructive"
            onClick={() => { window.location.href = '/api/auth/logout'; }}
            data-testid="me-logout"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out
          </Button>
        </div>
      )}

      {section && (
      <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Life stage: the ONE place the life stage is changed. */}
        {section === 'life-stage' && (
        <Card id="life-stage">
          <CardHeader>
            <CardDescription>
              Choose what fits you now. Home, tracking and tips follow your choice.
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
        )}

        {section === 'medicines' && <MedicineLog stage={selectedStage} />}

        {section === 'profile' && (<>
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
            <form className="space-y-1.5" onSubmit={saveName}>
              <Label htmlFor="profile-name">Your name</Label>
              <div className="flex gap-2">
                <Input
                  id="profile-name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="What should we call you?"
                  maxLength={80}
                  autoComplete="given-name"
                />
                <Button type="submit" variant="outline" disabled={savingName || !nameInput.trim() || nameInput.trim() === savedName}>
                  {savingName ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Save name'}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Used in your Home greeting and by Ask AI.</p>
            </form>
            <Separator />
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

        {/* Personal info — DOB / height / weight / blood type. Saved to the
            account (user_app_data via src/lib/account-data.ts) with a
            localStorage copy. Onboarding writes the same key, so this is
            the place to view + edit what you entered then. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal info
            </CardTitle>
            <CardDescription>
              These show up in your health summary and help personalize insights. Saved to your account.
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
        </>)}

        {/* Notifications */}
        {section === 'reminders' && (<>
        <Card data-testid="reminder-overview">
          <CardHeader>
            <CardDescription>
              Which switch does what. Phone switches only change what this device receives; the switches under "In the app" only change what shows inside Womanie, on all your devices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {REMINDER_OVERVIEW.map(r => (
                <li key={r.phone} className="text-sm">
                  <p className="font-medium">{r.what}</p>
                  <p className="text-muted-foreground">
                    In the app: {r.inApp}{r.inAppSwitch ? ` (switch "${IN_APP_SWITCHES[r.inAppSwitch].label}")` : ''}
                  </p>
                  <p className="text-muted-foreground">On your phone: switch "{phoneLabel(r.phone)}"</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <PhoneNotifications />
        <Card data-testid="in-app-reminders">
          <CardHeader>
            <CardTitle className="text-base">In the app</CardTitle>
            <CardDescription>
              What shows inside Womanie. Saved in your account, so it is the same on all your devices. It does not change phone notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(Object.keys(IN_APP_SWITCHES) as InAppPref[]).map((key, i) => (
              <div key={key}>
                {i > 0 && <Separator className="mb-4" />}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor={`inapp-${key}`}>{IN_APP_SWITCHES[key].label}</Label>
                    <p className="text-sm text-muted-foreground">{IN_APP_SWITCHES[key].hint}</p>
                  </div>
                  <Switch id={`inapp-${key}`}
                    checked={notifications[key]}
                    onCheckedChange={(checked) => {
                      setNotifications(prev => ({ ...prev, [key]: checked }));
                      toast({ title: `${IN_APP_SWITCHES[key].label}: ${checked ? 'on' : 'off'}` });
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        </>)}

        {/* Password */}
        {section === 'password' && (
        <Card>
          <CardHeader>
            <CardDescription>
              {settingFirst
                ? 'Your account uses Google sign-in. Set a password to also sign in with your email address.'
                : 'Change the password you use to sign in.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showPasswordForm ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowPasswordForm(true)}
              >
                {settingFirst ? 'Set a password' : 'Change password'}
              </Button>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                {!settingFirst && <div className="space-y-1.5">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input
                    id="current-password"
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>}
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
        )}

        {section === 'privacy' && (<>
        {/* Chart access transparency */}
        <ChartAccessLog />

        {/* Privacy policy acceptance (consent_log, migration 024) */}
        <ConsentLog />

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
        </>)}
      </div>
      )}
    </main>
  );
};

export default Settings;
