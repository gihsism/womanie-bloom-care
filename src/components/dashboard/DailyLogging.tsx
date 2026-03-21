import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Loader2, ChevronDown } from 'lucide-react';
import type { LifeStage } from './DashboardHeader';

interface DailyLoggingProps {
  selectedMode: LifeStage;
}

interface FormData {
  // Foundational
  sleepHours: number;
  sleepQuality: number;
  activityMinutes: number;
  activityType: string;
  mood: number;
  stress: number;
  weight: string;
  waterIntake: number;
  // Cycle
  discharge: string;
  symptoms: string[];
  periodFlow: string;
  pmsSeverity: number;
  basalTemp: string;
  restingHR: string;
  // Contraception
  pillStatus: string;
  breakthroughBleeding: string;
  libido: number;
  // Conception
  lhTest: string;
  cervicalMucus: string;
  intercourse: string;
  // IVF
  medicationStatus: string;
  injectionReaction: number;
  anxiety: number;
  fatigue: number;
  // Pregnancy
  kickCount: string;
  pregnancyWeight: string;
  nausea: number;
  swelling: string;
  contractions: string;
  // Menopause
  hotFlashCount: string;
  hotFlashSeverity: number;
  nightSweats: string;
  brainFog: number;
  periodThisWeek: string;
  // Post-menopause
  vaginalDryness: number;
  painIntercourse: number;
  urinaryEpisodes: string;
  bloodPressure: string;
  energy: number;
  postLibido: number;
}

const initialFormData: FormData = {
  sleepHours: 7, sleepQuality: 5, activityMinutes: 30, activityType: '',
  mood: 5, stress: 5, weight: '', waterIntake: 0,
  discharge: 'none', symptoms: [], periodFlow: 'none', pmsSeverity: 5, basalTemp: '', restingHR: '',
  pillStatus: '', breakthroughBleeding: '', libido: 5,
  lhTest: '', cervicalMucus: '', intercourse: '',
  medicationStatus: '', injectionReaction: 0, anxiety: 5, fatigue: 5,
  kickCount: '', pregnancyWeight: '', nausea: 0, swelling: '', contractions: '',
  hotFlashCount: '', hotFlashSeverity: 5, nightSweats: '', brainFog: 0, periodThisWeek: '',
  vaginalDryness: 0, painIntercourse: 0, urinaryEpisodes: '', bloodPressure: '', energy: 5, postLibido: 5,
};

const DailyLogging = ({ selectedMode }: DailyLoggingProps) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [showModeFields, setShowModeFields] = useState(true);

  useEffect(() => {
    loadTodaysData();
  }, []);

  const loadTodaysData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = format(new Date(), 'yyyy-MM-dd');
      const { data } = await supabase
        .from('daily_health_signals')
        .select('*')
        .eq('user_id', user.id)
        .eq('signal_date', today)
        .maybeSingle();

      if (data) {
        setFormData(prev => ({
          ...prev,
          mood: data.mood?.[0] === 'happy' ? 8 : data.mood?.[0] === 'sad' ? 3 : 5,
          stress: data.mood?.includes('anxious') ? 7 : 4,
          discharge: data.discharge || 'none',
          symptoms: data.symptoms || [],
        }));
      }
    } catch (error) {
      console.error('Error loading today data:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const today = format(new Date(), 'yyyy-MM-dd');

      const moodArray = formData.mood >= 7 ? ['happy', 'energetic'] :
                       formData.mood <= 4 ? ['sad'] : ['calm'];
      if (formData.stress >= 6) moodArray.push('anxious');

      // Build comprehensive notes from all tracked fields
      const noteParts = [
        `Sleep: ${formData.sleepHours}h (${formData.sleepQuality}/10)`,
        formData.activityType && `Exercise: ${formData.activityMinutes}min ${formData.activityType}`,
        formData.waterIntake > 0 && `Water: ${formData.waterIntake} glasses`,
        formData.weight && `Weight: ${formData.weight}`,
        formData.basalTemp && `BBT: ${formData.basalTemp}°F`,
        formData.restingHR && `RHR: ${formData.restingHR}`,
        formData.periodFlow !== 'none' && `Flow: ${formData.periodFlow}`,
        formData.kickCount && `Kicks: ${formData.kickCount}`,
        formData.hotFlashCount && `Hot flashes: ${formData.hotFlashCount}`,
        formData.bloodPressure && `BP: ${formData.bloodPressure}`,
      ].filter(Boolean).join(', ');

      const { error } = await supabase
        .from('daily_health_signals')
        .upsert({
          user_id: user.id,
          signal_date: today,
          mood: moodArray,
          discharge: formData.discharge,
          symptoms: formData.symptoms,
          notes: noteParts,
        }, {
          onConflict: 'user_id,signal_date'
        });

      if (error) throw error;

      toast({
        title: 'Daily log saved!',
        description: 'Your health data has been recorded.',
      });
    } catch (error) {
      console.error('Error saving daily log:', error);
      toast({
        title: 'Error',
        description: 'Failed to save daily log',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const update = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const getModeSpecificFields = () => {
    switch (selectedMode) {
      case 'menstrual-cycle':
      case 'pre-menstrual':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cervical Discharge</Label>
              <Select value={formData.discharge} onValueChange={(val) => update('discharge', val)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="dry">Dry</SelectItem>
                  <SelectItem value="sticky">Sticky</SelectItem>
                  <SelectItem value="creamy">Creamy</SelectItem>
                  <SelectItem value="watery">Watery</SelectItem>
                  <SelectItem value="ewcm">EWCM (Egg White) - Fertile!</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period Flow</Label>
              <Select value={formData.periodFlow} onValueChange={(val) => update('periodFlow', val)}>
                <SelectTrigger><SelectValue placeholder="Select flow" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="spotting">Spotting</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="heavy">Heavy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>PMS Severity (1-10)</Label>
              <Slider value={[formData.pmsSeverity]} onValueChange={(val) => update('pmsSeverity', val[0])} max={10} min={0} step={1} />
              <span className="text-sm text-muted-foreground">{formData.pmsSeverity}/10</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Basal Body Temp (°F)</Label>
                <Input type="number" step="0.1" placeholder="97.8" value={formData.basalTemp} onChange={(e) => update('basalTemp', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Resting Heart Rate</Label>
                <Input type="number" placeholder="65" value={formData.restingHR} onChange={(e) => update('restingHR', e.target.value)} />
              </div>
            </div>
          </div>
        );

      case 'contraception':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pill Taken On Time?</Label>
              <Select value={formData.pillStatus} onValueChange={(val) => update('pillStatus', val)}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes - On Time</SelectItem>
                  <SelectItem value="late">Late (within 12h)</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Breakthrough Bleeding</Label>
              <Select value={formData.breakthroughBleeding} onValueChange={(val) => update('breakthroughBleeding', val)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="spotting">Light Spotting</SelectItem>
                  <SelectItem value="bleeding">Bleeding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Libido (1-10)</Label>
              <Slider value={[formData.libido]} onValueChange={(val) => update('libido', val[0])} max={10} min={1} step={1} />
              <span className="text-sm text-muted-foreground">{formData.libido}/10</span>
            </div>
          </div>
        );

      case 'conception':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>LH Test Result</Label>
              <Select value={formData.lhTest} onValueChange={(val) => update('lhTest', val)}>
                <SelectTrigger><SelectValue placeholder="Select result" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not-tested">Not Tested</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                  <SelectItem value="positive">Positive (LH Surge!)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Basal Body Temperature (°F)</Label>
              <Input type="number" step="0.1" placeholder="97.8" value={formData.basalTemp} onChange={(e) => update('basalTemp', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cervical Mucus Quality</Label>
              <Select value={formData.cervicalMucus} onValueChange={(val) => update('cervicalMucus', val)}>
                <SelectTrigger><SelectValue placeholder="Select quality" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dry">Dry</SelectItem>
                  <SelectItem value="sticky">Sticky</SelectItem>
                  <SelectItem value="creamy">Creamy</SelectItem>
                  <SelectItem value="watery">Watery</SelectItem>
                  <SelectItem value="ewcm">Egg White (EWCM) - Most Fertile!</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Intercourse Today?</Label>
              <Select value={formData.intercourse} onValueChange={(val) => update('intercourse', val)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'ivf':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Medication Taken?</Label>
              <Select value={formData.medicationStatus} onValueChange={(val) => update('medicationStatus', val)}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All doses on time</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="missed">Missed dose</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Injection Site Reaction (0-10)</Label>
              <Slider value={[formData.injectionReaction]} onValueChange={(val) => update('injectionReaction', val[0])} max={10} min={0} step={1} />
              <span className="text-sm text-muted-foreground">{formData.injectionReaction}/10</span>
            </div>
            <div className="space-y-2">
              <Label>Anxiety Level (1-10)</Label>
              <Slider value={[formData.anxiety]} onValueChange={(val) => update('anxiety', val[0])} max={10} min={1} step={1} />
              <span className="text-sm text-muted-foreground">{formData.anxiety}/10</span>
            </div>
            <div className="space-y-2">
              <Label>Fatigue Level (1-10)</Label>
              <Slider value={[formData.fatigue]} onValueChange={(val) => update('fatigue', val[0])} max={10} min={1} step={1} />
              <span className="text-sm text-muted-foreground">{formData.fatigue}/10</span>
            </div>
          </div>
        );

      case 'pregnancy':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fetal Kick Count</Label>
              <Input type="number" placeholder="Count kicks in 1 hour" value={formData.kickCount} onChange={(e) => update('kickCount', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Weight Today</Label>
              <Input type="number" placeholder="Enter weight" value={formData.pregnancyWeight} onChange={(e) => update('pregnancyWeight', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nausea Severity (0-10)</Label>
              <Slider value={[formData.nausea]} onValueChange={(val) => update('nausea', val[0])} max={10} min={0} step={1} />
              <span className="text-sm text-muted-foreground">{formData.nausea}/10</span>
            </div>
            <div className="space-y-2">
              <Label>Swelling/Edema</Label>
              <Select value={formData.swelling} onValueChange={(val) => update('swelling', val)}>
                <SelectTrigger><SelectValue placeholder="Select severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="mild">Mild</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="severe">Severe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contractions Today?</Label>
              <Select value={formData.contractions} onValueChange={(val) => update('contractions', val)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="braxton">Braxton Hicks</SelectItem>
                  <SelectItem value="regular">Regular Contractions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'menopause':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Hot Flashes Today</Label>
              <Input type="number" placeholder="Count episodes" value={formData.hotFlashCount} onChange={(e) => update('hotFlashCount', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hot Flash Severity (0-10)</Label>
              <Slider value={[formData.hotFlashSeverity]} onValueChange={(val) => update('hotFlashSeverity', val[0])} max={10} min={0} step={1} />
              <span className="text-sm text-muted-foreground">{formData.hotFlashSeverity}/10</span>
            </div>
            <div className="space-y-2">
              <Label>Night Sweats</Label>
              <Select value={formData.nightSweats} onValueChange={(val) => update('nightSweats', val)}>
                <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="mild">Mild (1-2 times)</SelectItem>
                  <SelectItem value="moderate">Moderate (3-4 times)</SelectItem>
                  <SelectItem value="severe">Severe (5+ times)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Brain Fog/Memory Issues (0-10)</Label>
              <Slider value={[formData.brainFog]} onValueChange={(val) => update('brainFog', val[0])} max={10} min={0} step={1} />
              <span className="text-sm text-muted-foreground">{formData.brainFog}/10</span>
            </div>
            <div className="space-y-2">
              <Label>Period This Week?</Label>
              <Select value={formData.periodThisWeek} onValueChange={(val) => update('periodThisWeek', val)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="spotting">Spotting</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'post-menopause':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Vaginal Dryness (0-10)</Label>
              <Slider value={[formData.vaginalDryness]} onValueChange={(val) => update('vaginalDryness', val[0])} max={10} min={0} step={1} />
              <span className="text-sm text-muted-foreground">{formData.vaginalDryness}/10</span>
            </div>
            <div className="space-y-2">
              <Label>Pain During Intercourse (0-10)</Label>
              <Slider value={[formData.painIntercourse]} onValueChange={(val) => update('painIntercourse', val[0])} max={10} min={0} step={1} />
              <span className="text-sm text-muted-foreground">{formData.painIntercourse}/10</span>
            </div>
            <div className="space-y-2">
              <Label>Urinary Incontinence Episodes</Label>
              <Input type="number" placeholder="Count episodes" value={formData.urinaryEpisodes} onChange={(e) => update('urinaryEpisodes', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Blood Pressure</Label>
                <Input placeholder="120/80" value={formData.bloodPressure} onChange={(e) => update('bloodPressure', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Weight</Label>
                <Input type="number" placeholder="Enter weight" value={formData.pregnancyWeight} onChange={(e) => update('pregnancyWeight', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Energy Level (1-10)</Label>
              <Slider value={[formData.energy]} onValueChange={(val) => update('energy', val[0])} max={10} min={1} step={1} />
              <span className="text-sm text-muted-foreground">{formData.energy}/10</span>
            </div>
            <div className="space-y-2">
              <Label>Libido (1-10)</Label>
              <Slider value={[formData.postLibido]} onValueChange={(val) => update('postLibido', val[0])} max={10} min={1} step={1} />
              <span className="text-sm text-muted-foreground">{formData.postLibido}/10</span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const modeLabel: Record<string, string> = {
    'menstrual-cycle': 'Cycle Tracking',
    'pre-menstrual': 'Cycle Tracking',
    'contraception': 'Contraception Tracking',
    'conception': 'Conception Tracking',
    'ivf': 'IVF Protocol Tracking',
    'pregnancy': 'Pregnancy Tracking',
    'menopause': 'Menopause Tracking',
    'post-menopause': 'Post-Menopause Tracking',
  };

  const modeFields = getModeSpecificFields();

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Daily Health Log</h3>
        <p className="text-sm text-muted-foreground">
          Track your daily metrics for personalized insights
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Foundational metrics */}
        <div>
          <h4 className="font-semibold mb-3">Foundational Metrics</h4>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sleep Duration (hours)</Label>
                <Input type="number" value={formData.sleepHours} onChange={(e) => update('sleepHours', Number(e.target.value))} placeholder="7" />
              </div>
              <div className="space-y-2">
                <Label>Sleep Quality (1-10)</Label>
                <Slider value={[formData.sleepQuality]} onValueChange={(val) => update('sleepQuality', val[0])} max={10} min={1} step={1} />
                <span className="text-sm text-muted-foreground">{formData.sleepQuality}/10</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Exercise Type</Label>
                <Select value={formData.activityType} onValueChange={(val) => update('activityType', val)}>
                  <SelectTrigger><SelectValue placeholder="Select activity" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cardio">Cardio</SelectItem>
                    <SelectItem value="strength">Strength Training</SelectItem>
                    <SelectItem value="yoga">Yoga/Stretching</SelectItem>
                    <SelectItem value="walking">Walking</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Exercise Minutes</Label>
                <Input type="number" value={formData.activityMinutes} onChange={(e) => update('activityMinutes', Number(e.target.value))} placeholder="30" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mood (1-10)</Label>
                <Slider value={[formData.mood]} onValueChange={(val) => update('mood', val[0])} max={10} min={1} step={1} />
                <span className="text-sm text-muted-foreground">{formData.mood}/10</span>
              </div>
              <div className="space-y-2">
                <Label>Stress (1-10)</Label>
                <Slider value={[formData.stress]} onValueChange={(val) => update('stress', val[0])} max={10} min={1} step={1} />
                <span className="text-sm text-muted-foreground">{formData.stress}/10</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Weight (optional)</Label>
                <Input type="number" value={formData.weight} onChange={(e) => update('weight', e.target.value)} placeholder="Enter weight" />
              </div>
              <div className="space-y-2">
                <Label>Water Intake (glasses)</Label>
                <Input type="number" value={formData.waterIntake} onChange={(e) => update('waterIntake', Number(e.target.value))} placeholder="0" />
              </div>
            </div>
          </div>
        </div>

        {/* Mode-specific fields */}
        {modeFields && (
          <div className="pt-4 border-t">
            <button
              type="button"
              onClick={() => setShowModeFields(!showModeFields)}
              className="flex items-center justify-between w-full mb-3"
            >
              <h4 className="font-semibold">{modeLabel[selectedMode] || 'Additional Tracking'}</h4>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showModeFields ? 'rotate-180' : ''}`} />
            </button>
            {showModeFields && modeFields}
          </div>
        )}

        <Button type="submit" className="w-full mt-6" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Daily Log'
          )}
        </Button>
      </form>
    </Card>
  );
};

export default DailyLogging;
