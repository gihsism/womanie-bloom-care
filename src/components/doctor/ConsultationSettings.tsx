import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { db } from '@/integrations/db/client';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle, Clock, DollarSign, Loader2, Settings, Video } from 'lucide-react';

// Consultation price/availability and the weekly schedule. Lives under
// the doctor's "Profile & settings" view (moved out of DoctorDashboard).

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

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await db
        .from('consultation_settings')
        .select('*')
        .eq('doctor_id', doctorId)
        .maybeSingle();

      if (data) {
        setSettings({
          is_available: data.is_available || false,
          // ?? not ||: a doctor who set a free (0) visit must not see 80 again.
          consultation_price: data.consultation_price ?? 80,
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
     
  }, [doctorId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await db
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
      <Card className="panel rounded-[1.25rem] border-line bg-card shadow-none">
        <CardHeader className="p-4 pb-3">
          <CardTitle className="section-title flex items-center gap-2">
            <Settings className="h-5 w-5 text-stage-accent" strokeWidth={1.9} aria-hidden="true" />
            Bookings and price
          </CardTitle>
          <CardDescription>Whether patients can book you, and what a visit costs</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-6">
          {/* Availability Toggle */}
          <div id="setup-bookings" className="flex items-center justify-between p-4 border rounded-lg scroll-mt-24">
            <div>
              <p className="font-medium">Accept new bookings</p>
              <p className="text-sm text-muted-foreground">Patients can find and book you only while this is on (and once your licence is verified). Remember to press Save.</p>
            </div>
            <Switch
              checked={settings.is_available}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, is_available: checked }))}
              aria-label="Toggle consultation availability"
            />
          </div>

          {/* Pricing */}
          <div id="setup-price" className="space-y-4 scroll-mt-24">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4" aria-hidden="true" />
                  Price per visit
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={settings.consultation_price}
                    onChange={(e) => setSettings(s => ({ ...s, consultation_price: Number(e.target.value) }))}
                    className="flex-1 h-11 px-4 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-stage-accent bg-background"
                    min={0}
                  />
                  <select
                    value={settings.currency}
                    onChange={(e) => setSettings(s => ({ ...s, currency: e.target.value }))}
                    className="h-11 px-4 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-stage-accent bg-background"
                  >
                    <option value="CHF">CHF</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Visit length</label>
                <select
                  value={settings.consultation_duration}
                  onChange={(e) => setSettings(s => ({ ...s, consultation_duration: Number(e.target.value) }))}
                  className="w-full h-11 px-4 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-stage-accent bg-background"
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
                Video visits
              </p>
              <p className="text-sm text-muted-foreground">Let patients book a video call</p>
            </div>
            <Switch
              checked={settings.video_enabled}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, video_enabled: checked }))}
              aria-label="Toggle video consultations"
            />
          </div>

          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            Online payment through Womanie is not available yet.
          </p>

          <Button variant="outline" onClick={handleSave} disabled={isSaving} className="w-full h-12 border-stage-accent text-[15px] font-semibold text-stage-accent hover:text-stage-accent">
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      {/* Schedule Card */}
      <Card id="setup-hours" className="scroll-mt-24 panel rounded-[1.25rem] border-line bg-card shadow-none">
        <CardHeader className="p-4 pb-3">
          <CardTitle className="section-title flex items-center gap-2">
            <Clock className="h-5 w-5 text-stage-accent" strokeWidth={1.9} aria-hidden="true" />
            Opening hours
          </CardTitle>
          <CardDescription>Patients can book you inside these hours. Times are Swiss time (Zurich), also for patients abroad.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
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
      const { data } = await db
        .from('doctor_schedule')
        .select('*')
        .eq('doctor_id', doctorId);

      if (data && data.length > 0) {
        setSchedule(prev => {
          const loaded = { ...prev };
          data.forEach((s: { day_of_week: number | null; start_time: string; end_time: string; is_active: boolean | null }) => {
            if (s.day_of_week !== null) {
              loaded[s.day_of_week] = {
                start: s.start_time,
                end: s.end_time,
                active: s.is_active ?? true,
              };
            }
          });
          return loaded;
        });
      }
    };
    loadSchedule();
  }, [doctorId]);

  // Identify any active day whose end_time isn't strictly after start_time.
  // A 0- or negative-length window would otherwise sit in the schedule
  // table and silently produce zero bookable slots for that day.
  const invalidDays = Object.entries(schedule)
    .filter(([, s]) => s.active && s.start >= s.end)
    .map(([day]) => Number(day));

  const handleSaveSchedule = async () => {
    if (invalidDays.length > 0) {
      const dayList = invalidDays.map((d) => days[d]).join(', ');
      toast({
        variant: 'destructive',
        title: 'Fix the highlighted days',
        description: `End time must be after start time on ${dayList}.`,
      });
      return;
    }
    setIsSaving(true);
    try {
      // Replace the whole schedule atomically server-side. A previous
      // delete-then-insert via /api/db could wipe the schedule and then
      // fail the insert, leaving the doctor unbookable.
      const days = Object.entries(schedule)
        .filter(([, s]) => s.active)
        .map(([day, s]) => ({
          day_of_week: Number(day),
          start_time: s.start,
          end_time: s.end,
        }));

      const resp = await fetch('/api/doctors/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ days }),
      });
      if (!resp.ok) {
        const { error } = await resp.json().catch(() => ({ error: 'Failed to save schedule' }));
        throw new Error(error || 'Failed to save schedule');
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
      {days.map((dayName, index) => {
        const invalid = invalidDays.includes(index);
        return (
          <div
            key={index}
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 p-3 border border-line rounded-2xl ${
              invalid ? 'border-destructive bg-destructive/5' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => toggleDay(index)}
              aria-pressed={schedule[index].active}
              aria-label={`Work on ${dayName}`}
              className={`relative hit-44 w-6 h-6 rounded border-2 flex items-center justify-center ${
                schedule[index].active
                  ? 'bg-stage-accent border-stage-accent text-stage-on'
                  : 'border-muted-foreground'
              }`}
            >
              {schedule[index].active && <CheckCircle className="h-4 w-4" />}
            </button>
            <span className="w-24 font-medium">{dayName}</span>
            {schedule[index].active ? (
              // Phone width: the two times wrap under the day instead of
              // running off the screen.
              <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1 basis-[15rem]">
                <input
                  type="time"
                  value={schedule[index].start}
                  onChange={(e) => updateTime(index, 'start', e.target.value)}
                  aria-label={`${dayName} from`}
                  className={`min-w-0 w-[7.5rem] h-11 px-3 py-1.5 border border-input rounded-full bg-background ${invalid ? 'border-destructive' : ''}`}
                />
                <span className="text-muted-foreground">to</span>
                <input
                  type="time"
                  value={schedule[index].end}
                  onChange={(e) => updateTime(index, 'end', e.target.value)}
                  aria-label={`${dayName} to`}
                  className={`min-w-0 w-[7.5rem] h-11 px-3 py-1.5 border border-input rounded-full bg-background ${invalid ? 'border-destructive' : ''}`}
                />
                {invalid && (
                  <span className="basis-full text-xs text-destructive">End must be after start</span>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">Unavailable</span>
            )}
          </div>
        );
      })}
      <Button
        variant="outline"
        className="mt-4 w-full h-12 border-stage-accent text-[15px] font-semibold text-stage-accent hover:text-stage-accent"
        onClick={handleSaveSchedule}
        disabled={isSaving || invalidDays.length > 0}
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          'Save hours'
        )}
      </Button>
    </div>
  );
};

export default ConsultationSettings;
