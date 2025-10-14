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
import type { LifeStage } from './DashboardHeader';

interface DailyLoggingProps {
  selectedMode: LifeStage;
}

const DailyLogging = ({ selectedMode }: DailyLoggingProps) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Record<string, any>>({
    // Foundational metrics (all modes)
    sleepHours: 7,
    sleepQuality: 5,
    activityMinutes: 30,
    activityType: '',
    mood: 5,
    stress: 5,
    weight: '',
    waterIntake: 0,
    // Cycle tracking
    discharge: 'none',
    symptoms: [] as string[],
    periodFlow: 'none',
  });
  const [isLoading, setIsLoading] = useState(false);

  // Load today's data on mount
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
      
      // Map mood score to mood array
      const moodArray = formData.mood >= 7 ? ['happy', 'energetic'] : 
                       formData.mood <= 4 ? ['sad'] : ['calm'];
      
      if (formData.stress >= 6) moodArray.push('anxious');

      const { error } = await supabase
        .from('daily_health_signals')
        .upsert({
          user_id: user.id,
          signal_date: today,
          mood: moodArray,
          discharge: formData.discharge,
          symptoms: formData.symptoms,
          notes: `Sleep: ${formData.sleepHours}h (${formData.sleepQuality}/10), Exercise: ${formData.activityMinutes}min ${formData.activityType}, Water: ${formData.waterIntake} glasses`,
        }, {
          onConflict: 'user_id,signal_date'
        });

      if (error) throw error;

      toast({
        title: 'Daily log saved!',
        description: 'Your health data has been recorded and will be used for cycle predictions.',
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

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Foundational metrics for ALL modes
  const foundationalFields = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Sleep Duration (hours)</Label>
          <Input
            type="number"
            value={formData.sleepHours}
            onChange={(e) => updateField('sleepHours', e.target.value)}
            placeholder="7"
          />
        </div>
        <div className="space-y-2">
          <Label>Sleep Quality (1-10)</Label>
          <Slider
            value={[formData.sleepQuality]}
            onValueChange={(val) => updateField('sleepQuality', val[0])}
            max={10}
            min={1}
            step={1}
          />
          <span className="text-sm text-muted-foreground">{formData.sleepQuality}/10</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Exercise Type</Label>
          <Select value={formData.activityType} onValueChange={(val) => updateField('activityType', val)}>
            <SelectTrigger>
              <SelectValue placeholder="Select activity" />
            </SelectTrigger>
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
          <Input
            type="number"
            value={formData.activityMinutes}
            onChange={(e) => updateField('activityMinutes', e.target.value)}
            placeholder="30"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Mood Score (1-10)</Label>
          <Slider
            value={[formData.mood]}
            onValueChange={(val) => updateField('mood', val[0])}
            max={10}
            min={1}
            step={1}
          />
          <span className="text-sm text-muted-foreground">{formData.mood}/10</span>
        </div>
        <div className="space-y-2">
          <Label>Stress Level (1-10)</Label>
          <Slider
            value={[formData.stress]}
            onValueChange={(val) => updateField('stress', val[0])}
            max={10}
            min={1}
            step={1}
          />
          <span className="text-sm text-muted-foreground">{formData.stress}/10</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Weight (optional)</Label>
          <Input
            type="number"
            value={formData.weight}
            onChange={(e) => updateField('weight', e.target.value)}
            placeholder="Enter weight"
          />
        </div>
        <div className="space-y-2">
          <Label>Water Intake (glasses)</Label>
          <Input
            type="number"
            value={formData.waterIntake}
            onChange={(e) => updateField('waterIntake', e.target.value)}
            placeholder="0"
          />
        </div>
      </div>
    </>
  );

  // Mode-specific fields
  const getModeSpecificFields = () => {
    switch (selectedMode) {
      case 'menstrual-cycle':
      case 'pre-menstrual':
        return (
          <>
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-3">Cycle Tracking</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Cervical Discharge</Label>
                  <Select value={formData.discharge} onValueChange={(val) => updateField('discharge', val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
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
                  <Select value={formData.periodFlow} onValueChange={(val) => updateField('periodFlow', val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select flow" />
                    </SelectTrigger>
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
                  <Label>PMS Symptoms Severity (1-10)</Label>
                  <Slider defaultValue={[5]} max={10} min={0} step={1} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Basal Body Temp (°F)</Label>
                    <Input type="number" step="0.1" placeholder="97.8" />
                  </div>
                  <div className="space-y-2">
                    <Label>Resting Heart Rate</Label>
                    <Input type="number" placeholder="65" />
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case 'contraception':
        return (
          <>
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-3">Contraception Tracking</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Pill Taken On Time?</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes - On Time</SelectItem>
                      <SelectItem value="late">Late (within 12h)</SelectItem>
                      <SelectItem value="missed">Missed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Breakthrough Bleeding</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="spotting">Light Spotting</SelectItem>
                      <SelectItem value="bleeding">Bleeding</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Libido Score (1-10)</Label>
                  <Slider defaultValue={[5]} max={10} min={1} step={1} />
                </div>
              </div>
            </div>
          </>
        );

      case 'conception':
        return (
          <>
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-3">Conception Tracking</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>LH Test Result</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select result" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not-tested">Not Tested</SelectItem>
                      <SelectItem value="negative">Negative</SelectItem>
                      <SelectItem value="positive">Positive (LH Surge!)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Basal Body Temperature (°F)</Label>
                  <Input type="number" step="0.1" placeholder="97.8" />
                </div>
                <div className="space-y-2">
                  <Label>Cervical Mucus Quality</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select quality" />
                    </SelectTrigger>
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
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </>
        );

      case 'ivf':
        return (
          <>
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-3">IVF Protocol Tracking</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Medication Taken?</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All doses on time</SelectItem>
                      <SelectItem value="late">Late</SelectItem>
                      <SelectItem value="missed">Missed dose</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Injection Site Reaction (1-10)</Label>
                  <Slider defaultValue={[0]} max={10} min={0} step={1} />
                </div>
                <div className="space-y-2">
                  <Label>Anxiety Level (1-10)</Label>
                  <Slider defaultValue={[5]} max={10} min={1} step={1} />
                </div>
                <div className="space-y-2">
                  <Label>Fatigue Level (1-10)</Label>
                  <Slider defaultValue={[5]} max={10} min={1} step={1} />
                </div>
              </div>
            </div>
          </>
        );

      case 'pregnancy':
        return (
          <>
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-3">Pregnancy Tracking</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Fetal Kick Count</Label>
                  <Input type="number" placeholder="Count kicks in 1 hour" />
                </div>
                <div className="space-y-2">
                  <Label>Weight Today</Label>
                  <Input type="number" placeholder="Enter weight" />
                </div>
                <div className="space-y-2">
                  <Label>Nausea Severity (1-10)</Label>
                  <Slider defaultValue={[0]} max={10} min={0} step={1} />
                </div>
                <div className="space-y-2">
                  <Label>Swelling/Edema</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
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
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="braxton">Braxton Hicks</SelectItem>
                      <SelectItem value="regular">Regular Contractions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </>
        );

      case 'menopause':
        return (
          <>
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-3">Menopause Tracking</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Hot Flashes Today</Label>
                  <Input type="number" placeholder="Count episodes" />
                </div>
                <div className="space-y-2">
                  <Label>Hot Flash Severity (1-10)</Label>
                  <Slider defaultValue={[5]} max={10} min={0} step={1} />
                </div>
                <div className="space-y-2">
                  <Label>Night Sweats</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="mild">Mild (1-2 times)</SelectItem>
                      <SelectItem value="moderate">Moderate (3-4 times)</SelectItem>
                      <SelectItem value="severe">Severe (5+ times)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Brain Fog/Memory Issues (1-10)</Label>
                  <Slider defaultValue={[0]} max={10} min={0} step={1} />
                </div>
                <div className="space-y-2">
                  <Label>Period This Week?</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="spotting">Spotting</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </>
        );

      case 'post-menopause':
        return (
          <>
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-3">Post-Menopause Tracking</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Vaginal Dryness (1-10)</Label>
                  <Slider defaultValue={[0]} max={10} min={0} step={1} />
                </div>
                <div className="space-y-2">
                  <Label>Pain During Intercourse (1-10)</Label>
                  <Slider defaultValue={[0]} max={10} min={0} step={1} />
                </div>
                <div className="space-y-2">
                  <Label>Urinary Incontinence Episodes</Label>
                  <Input type="number" placeholder="Count episodes" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Blood Pressure</Label>
                    <Input placeholder="120/80" />
                  </div>
                  <div className="space-y-2">
                    <Label>Weight</Label>
                    <Input type="number" placeholder="Enter weight" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Energy Level (1-10)</Label>
                  <Slider defaultValue={[5]} max={10} min={1} step={1} />
                </div>
                <div className="space-y-2">
                  <Label>Libido Score (1-10)</Label>
                  <Slider defaultValue={[5]} max={10} min={1} step={1} />
                </div>
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Daily Health Log</h3>
        <p className="text-sm text-muted-foreground">
          Track your daily metrics for personalized insights
        </p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h4 className="font-semibold mb-3">Foundational Metrics</h4>
          {foundationalFields}
        </div>

        {getModeSpecificFields()}

        <Button type="submit" className="w-full mt-6" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Daily Log'}
        </Button>
      </form>
    </Card>
  );
};

export default DailyLogging;
