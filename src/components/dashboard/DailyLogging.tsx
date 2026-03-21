import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
  notes: string;
}

const DailyLogging = ({ selectedMode }: DailyLoggingProps) => {
  const { toast } = useToast();
  const [data, setData] = useState<QuickLogData>({
    moods: [], symptoms: [], periodFlow: 'none', discharge: 'none',
    lhTest: '', intercourse: '', pillTaken: '', medicationTaken: '',
    hotFlashCount: '', basalTemp: '', notes: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadTodaysData();
  }, []);

  const loadTodaysData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data: existing } = await supabase
        .from('daily_health_signals')
        .select('*')
        .eq('user_id', user.id)
        .eq('signal_date', today)
        .maybeSingle();

      if (existing) {
        setData(prev => ({
          ...prev,
          moods: existing.mood || [],
          symptoms: existing.symptoms || [],
          discharge: existing.discharge || 'none',
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
      const { data: { user } } = await supabase.auth.getUser();
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
        data.notes,
      ].filter(Boolean).join('. ');

      const { error } = await supabase
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
