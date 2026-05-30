import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { emitHealthDataChange } from '@/lib/data-events';
import { format } from 'date-fns';
import { Loader2, Check } from 'lucide-react';
import type { LifeStage } from './DashboardHeader';

interface DailyLoggingProps {
  selectedMode: LifeStage;
}

const SYMPTOM_OPTIONS = [
  'Cramps', 'Headache', 'Bloating', 'Breast tenderness', 'Back pain',
  'Fatigue', 'Nausea', 'Acne', 'Insomnia', 'Cravings',
  'Dizziness', 'Hot flashes', 'Joint pain', 'Anxiety',
];

const MOOD_OPTIONS = [
  { emoji: '😊', label: 'Happy', value: 'happy' },
  { emoji: '😌', label: 'Calm', value: 'calm' },
  { emoji: '😐', label: 'Neutral', value: 'neutral' },
  { emoji: '😔', label: 'Sad', value: 'sad' },
  { emoji: '😤', label: 'Irritable', value: 'irritable' },
  { emoji: '😰', label: 'Anxious', value: 'anxious' },
  { emoji: '🥰', label: 'Loving', value: 'loving' },
  { emoji: '😴', label: 'Tired', value: 'tired' },
];

const FLOW_OPTIONS = [
  { label: 'None', value: 'none', color: 'bg-muted' },
  { label: 'Spotting', value: 'spotting', color: 'bg-pink-200' },
  { label: 'Light', value: 'light', color: 'bg-pink-300' },
  { label: 'Medium', value: 'medium', color: 'bg-pink-400' },
  { label: 'Heavy', value: 'heavy', color: 'bg-pink-500' },
];

// Postpartum bleeding (lochia) progresses bright-red → pink/brown →
// yellow/clear over 4-6 weeks. Tracking it day-to-day lets the user
// see the expected colour shift and catches re-bleeding (sudden
// bright red after a few days of fading) which can flag retained
// placenta or activity overdone.
const LOCHIA_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Spotting', value: 'spotting' },
  { label: 'Light red', value: 'light-red' },
  { label: 'Heavy red', value: 'heavy-red' },
  { label: 'Pink/brown', value: 'pink-brown' },
  { label: 'Yellow/clear', value: 'yellow-clear' },
];

const DISCHARGE_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Dry', value: 'dry' },
  { label: 'Sticky', value: 'sticky' },
  { label: 'Creamy', value: 'creamy' },
  { label: 'Watery', value: 'watery' },
  { label: 'Egg white', value: 'ewcm' },
];

interface QuickLogData {
  moods: string[];
  symptoms: string[];
  periodFlow: string;
  discharge: string;
  // Mode-specific quick fields
  lhTest: string;
  intercourse: string;
  pillTaken: string;
  medicationTaken: string;
  hotFlashCount: string;
  basalTemp: string;
  // Cross-mode: hours slept (numeric) + perceived quality (1-5).
  // Sleep disruption is the #1 menopause complaint, insomnia is
  // common in pregnancy, and poor sleep affects fertility — so it
  // shows on every mode that uses this form.
  sleepHours: string;
  sleepQuality: string;
  // Postpartum-only: lochia colour/intensity bucket.
  lochia: string;
  notes: string;
}

const DailyLogging = ({ selectedMode }: DailyLoggingProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<QuickLogData>({
    moods: [], symptoms: [], periodFlow: 'none', discharge: 'none',
    lhTest: '', intercourse: '', pillTaken: '', medicationTaken: '',
    hotFlashCount: '', basalTemp: '', sleepHours: '', sleepQuality: '', lochia: '', notes: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadTodaysData();
  }, []);

  const loadTodaysData = async () => {
    try {
      if (!user) return;
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data: existing } = await db
        .from('daily_health_signals')
        .select('*')
        .eq('user_id', user.id)
        .eq('signal_date', today)
        .maybeSingle();

      if (existing) {
        // Parse the encoded segments out of `notes` so reopening the
        // form mid-day repopulates BBT / LH / Pill / Medication / Hot
        // flashes / Flow / Sleep. Without this, saving a second time
        // (e.g. just to log mood) would clobber notes with whatever's
        // in the form — silently dropping the rest of the day's
        // structured logs.
        const notes: string = existing.notes ?? '';
        const flow = notes.match(/Flow:\s*(spotting|light|medium|heavy)/i)?.[1] ?? '';
        const lhTest = notes.match(/LH test:\s*(not-tested|positive|negative)/i)?.[1] ?? '';
        const intercourse = notes.match(/Intercourse:\s*(no|yes-protected|yes-unprotected)/i)?.[1] ?? '';
        const pillTaken = notes.match(/Pill:\s*(on-time|late|missed)/i)?.[1] ?? '';
        const medication = notes.match(/Medication:\s*(all-on-time|late|missed)/i)?.[1] ?? '';
        const hotFlashCount = notes.match(/Hot flashes:\s*(\d+)/i)?.[1] ?? '';
        const bbt = notes.match(/BBT:\s*(\d+(?:\.\d+)?)/i)?.[1] ?? '';
        const sleepHours = notes.match(/Sleep:\s*(\d+(?:\.\d+)?)\s*h/i)?.[1] ?? '';
        const sleepQuality = notes.match(/Sleep quality:\s*([1-5])\/5/i)?.[1] ?? '';
        const lochia = notes.match(/Lochia:\s*(none|spotting|light-red|heavy-red|pink-brown|yellow-clear)/i)?.[1] ?? '';
        // What remains after stripping the encoded segments is the
        // user's freeform note. Each segment is separated by `. ` per
        // handleSave's join, so split on that, drop matches, rejoin.
        const freeform = notes
          .split('.')
          .map(s => s.trim())
          .filter(s =>
            s &&
            !/^Flow:\s*(spotting|light|medium|heavy)$/i.test(s) &&
            !/^LH test:\s*(not-tested|positive|negative)$/i.test(s) &&
            !/^Intercourse:\s*(no|yes-protected|yes-unprotected)$/i.test(s) &&
            !/^Pill:\s*(on-time|late|missed)$/i.test(s) &&
            !/^Medication:\s*(all-on-time|late|missed)$/i.test(s) &&
            !/^Hot flashes:\s*\d+$/i.test(s) &&
            !/^BBT:\s*\d+(?:\.\d+)?°?F?$/i.test(s) &&
            !/^Sleep:\s*\d+(?:\.\d+)?h$/i.test(s) &&
            !/^Sleep quality:\s*[1-5]\/5$/i.test(s) &&
            !/^Lochia:\s*(none|spotting|light-red|heavy-red|pink-brown|yellow-clear)$/i.test(s)
          )
          .join('. ');

        setData(prev => ({
          ...prev,
          moods: existing.mood || [],
          symptoms: existing.symptoms || [],
          discharge: existing.discharge || 'none',
          periodFlow: flow || 'none',
          lhTest,
          intercourse,
          pillTaken,
          medicationTaken: medication,
          hotFlashCount,
          basalTemp: bbt,
          sleepHours,
          sleepQuality,
          lochia,
          notes: freeform,
        }));
      }
    } catch (error) {
      console.error('Error loading today data:', error);
    }
  };

  const toggleMood = (mood: string) => {
    setData(prev => ({
      ...prev,
      moods: prev.moods.includes(mood) ? prev.moods.filter(m => m !== mood) : [...prev.moods, mood],
    }));
    setSaved(false);
  };

  const toggleSymptom = (symptom: string) => {
    setData(prev => ({
      ...prev,
      symptoms: prev.symptoms.includes(symptom) ? prev.symptoms.filter(s => s !== symptom) : [...prev.symptoms, symptom],
    }));
    setSaved(false);
  };

  const update = <K extends keyof QuickLogData>(field: K, value: QuickLogData[K]) => {
    setData(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      if (!user) throw new Error('Not authenticated');
      const today = format(new Date(), 'yyyy-MM-dd');

      const noteParts = [
        data.periodFlow !== 'none' && `Flow: ${data.periodFlow}`,
        data.lhTest && `LH test: ${data.lhTest}`,
        data.intercourse && `Intercourse: ${data.intercourse}`,
        data.pillTaken && `Pill: ${data.pillTaken}`,
        data.medicationTaken && `Medication: ${data.medicationTaken}`,
        data.hotFlashCount && `Hot flashes: ${data.hotFlashCount}`,
        data.basalTemp && `BBT: ${data.basalTemp}°F`,
        data.sleepHours && `Sleep: ${data.sleepHours}h`,
        data.sleepQuality && `Sleep quality: ${data.sleepQuality}/5`,
        data.lochia && `Lochia: ${data.lochia}`,
        data.notes,
      ].filter(Boolean).join('. ');

      const { error } = await db
        .from('daily_health_signals')
        .upsert({
          user_id: user.id,
          signal_date: today,
          mood: data.moods.length > 0 ? data.moods : null,
          discharge: data.discharge !== 'none' ? data.discharge : null,
          symptoms: data.symptoms.length > 0 ? data.symptoms : null,
          notes: noteParts || null,
        }, { onConflict: 'user_id,signal_date' });

      if (error) throw error;
      setSaved(true);
      toast({ title: 'Saved!', description: 'Your daily log has been recorded.' });
      emitHealthDataChange();
    } catch (error) {
      console.error('Error saving:', error);
      toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // Show cycle-relevant fields
  const showFlow = ['menstrual-cycle', 'pre-menstrual', 'contraception', 'conception'].includes(selectedMode);
  const showDischarge = ['menstrual-cycle', 'conception', 'pre-menstrual'].includes(selectedMode);
  const showLH = selectedMode === 'conception';
  const showIntercourse = selectedMode === 'conception';
  const showPill = selectedMode === 'contraception';
  const showMedication = selectedMode === 'ivf';
  const showHotFlashes = selectedMode === 'menopause' || selectedMode === 'post-menopause';
  const showBBT = selectedMode === 'conception' || selectedMode === 'menstrual-cycle';
  // Postpartum bleeding (lochia) only matters in the active recovery
  // window. Birth date lives in localStorage — read it to decide
  // whether to show this field. If we can't find it or the user is
  // > 6 weeks postpartum, the field hides itself.
  const showLochia = (() => {
    if (selectedMode !== 'postpartum') return false;
    if (!user?.id) return false;
    try {
      const raw = window.localStorage.getItem(`womanie_postpartum_birth_${user.id}`);
      if (!raw) return true; // show it anyway — better than burying it
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return true;
      const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
      return days >= 0 && days <= 56; // 8 weeks gives a buffer past the 6-week clinical window
    } catch {
      return true;
    }
  })();

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">Today's Quick Log</h3>
          <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</p>
        </div>
        {saved && (
          <Badge variant="outline" className="text-green-600 border-green-300 gap-1">
            <Check className="h-3 w-3" /> Saved
          </Badge>
        )}
      </div>

      <div className="space-y-5">
        {/* Mood — emoji tap */}
        <div>
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">How are you feeling?</Label>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map(m => (
              <button
                key={m.value}
                onClick={() => toggleMood(m.value)}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl border transition-all text-center ${
                  data.moods.includes(m.value)
                    ? 'border-primary bg-primary/10 scale-105'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <span className="text-lg">{m.emoji}</span>
                <span className="text-[10px]">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Period flow — tap to select */}
        {showFlow && (
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Period flow</Label>
            <div className="flex gap-2">
              {FLOW_OPTIONS.map(f => (
                <button
                  key={f.value}
                  onClick={() => update('periodFlow', f.value)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                    data.periodFlow === f.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full mx-auto mb-1 ${f.color}`} />
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lochia (postpartum bleeding) — first 6-8 weeks only */}
        {showLochia && (
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Lochia (postpartum bleeding)
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {LOCHIA_OPTIONS.map(l => (
                <button
                  key={l.value}
                  onClick={() => update('lochia', data.lochia === l.value ? '' : l.value)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                    data.lochia === l.value
                      ? 'border-primary bg-primary/10 font-semibold'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Heavy red lasting past week 2, or new bright red after fading, is worth a call to your provider.
            </p>
          </div>
        )}

        {/* Discharge — tap to select */}
        {showDischarge && (
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Discharge</Label>
            <div className="flex flex-wrap gap-1.5">
              {DISCHARGE_OPTIONS.map(d => (
                <button
                  key={d.value}
                  onClick={() => update('discharge', d.value)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                    data.discharge === d.value
                      ? 'border-primary bg-primary/10 font-semibold'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  {d.label}
                  {d.value === 'ewcm' && ' 🥚'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Symptoms — tap checkboxes */}
        <div>
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Symptoms</Label>
          <div className="flex flex-wrap gap-1.5">
            {SYMPTOM_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => toggleSymptom(s)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                  data.symptoms.includes(s)
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 font-semibold text-amber-700 dark:text-amber-400'
                    : 'border-border hover:border-amber-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Mode-specific quick fields */}
        {(showLH || showIntercourse || showPill || showMedication || showHotFlashes || showBBT) && (
          <div className="grid grid-cols-2 gap-3">
            {showLH && (
              <div className="space-y-1.5">
                <Label className="text-xs">LH Test</Label>
                <Select value={data.lhTest} onValueChange={(v) => update('lhTest', v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not-tested">Not tested</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                    <SelectItem value="positive">Positive!</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {showIntercourse && (
              <div className="space-y-1.5">
                <Label className="text-xs">Intercourse</Label>
                <Select value={data.intercourse} onValueChange={(v) => update('intercourse', v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes-protected">Yes (protected)</SelectItem>
                    <SelectItem value="yes-unprotected">Yes (unprotected)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {showPill && (
              <div className="space-y-1.5">
                <Label className="text-xs">Pill taken?</Label>
                <Select value={data.pillTaken} onValueChange={(v) => update('pillTaken', v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on-time">On time</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="missed">Missed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {showMedication && (
              <div className="space-y-1.5">
                <Label className="text-xs">Medication</Label>
                <Select value={data.medicationTaken} onValueChange={(v) => update('medicationTaken', v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-on-time">All on time</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="missed">Missed dose</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {showHotFlashes && (
              <div className="space-y-1.5">
                <Label className="text-xs">Hot flashes today</Label>
                <Input type="number" placeholder="0" className="h-9" value={data.hotFlashCount} onChange={(e) => update('hotFlashCount', e.target.value)} />
              </div>
            )}
            {showBBT && (
              <div className="space-y-1.5">
                <Label className="text-xs">Basal temp (°F)</Label>
                <Input type="number" step="0.1" placeholder="97.8" className="h-9" value={data.basalTemp} onChange={(e) => update('basalTemp', e.target.value)} />
              </div>
            )}
          </div>
        )}

        {/* Sleep — shown for every mode. Hours + a 1-5 quality rating,
            both optional so users can log just one. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Sleep (hours)</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              max="24"
              placeholder="7.5"
              className="h-9"
              value={data.sleepHours}
              onChange={(e) => update('sleepHours', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sleep quality</Label>
            <Select value={data.sleepQuality} onValueChange={(v) => update('sleepQuality', v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Rate 1–5" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">😩 1 — Terrible</SelectItem>
                <SelectItem value="2">😪 2 — Poor</SelectItem>
                <SelectItem value="3">😐 3 — OK</SelectItem>
                <SelectItem value="4">🙂 4 — Good</SelectItem>
                <SelectItem value="5">😴 5 — Great</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Optional note */}
        <div>
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Notes (optional)</Label>
          <Input
            placeholder="Anything else to note today..."
            value={data.notes}
            onChange={(e) => update('notes', e.target.value)}
            className="h-9"
          />
        </div>

        <Button onClick={handleSave} className="w-full" disabled={isLoading}>
          {isLoading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
          ) : saved ? (
            <><Check className="h-4 w-4 mr-2" />Saved — tap to update</>
          ) : (
            'Save today\'s log'
          )}
        </Button>
      </div>
    </Card>
  );
};

export default DailyLogging;
