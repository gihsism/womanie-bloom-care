import { DATE_FMT } from '@/lib/dateFormat';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useOnboarding } from '@/contexts/OnboardingContext';

// The last period sets the stage (12 months or more = post-menopause) and
// seeds the menopause stage tracker (period_tracking); the concerns seed
// the symptoms the menopause page tracks (lib/onboarding-commit.ts). The
// old required HRT question was never saved or used, so it is gone.

const MenopauseForm = () => {
  const navigate = useNavigate();
  const { data, updateMenopause } = useOnboarding();
  // One date picker open at a time; picking a day closes it (it used to
  // stay open over the Finish button on a phone).
  const [openPicker, setOpenPicker] = useState<number | null>(null);
  
  const [lastPeriod, setLastPeriod] = useState<Date | undefined>(data.menopause?.lastPeriod);
  const [dontRemember, setDontRemember] = useState(data.menopause?.dontRememberLastPeriod || false);
  const [concerns, setConcerns] = useState<string[]>(data.menopause?.mainConcerns || []);

  const concernOptions = [
    { id: 'hot-flashes', label: 'Hot flashes' },
    { id: 'night-sweats', label: 'Night sweats' },
    { id: 'mood-changes', label: 'Mood changes' },
    { id: 'sleep-issues', label: 'Sleep issues' },
    { id: 'weight-changes', label: 'Weight changes' },
    { id: 'bone-health', label: 'Bone health' },
  ];

  const toggleConcern = (concernId: string) => {
    setConcerns((prev) =>
      prev.includes(concernId) ? prev.filter((c) => c !== concernId) : [...prev, concernId]
    );
  };

  const isFormValid = () => {
    return !!(lastPeriod || dontRemember);
  };

  const handleFinish = () => {
    updateMenopause({
      lastPeriod: dontRemember ? undefined : lastPeriod,
      dontRememberLastPeriod: dontRemember,
      onHRT: false,
      mainConcerns: concerns,
    });
    navigate('/onboarding/success');
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold mb-3">
          Tell us where you are with menopause
        </h1>
      </div>

      <Card className="p-6 lg:p-8">
        <div className="space-y-6">
          {/* Last Period */}
          <div className="space-y-4">
            <Label>When was your last period? *</Label>
            <p className="text-sm text-muted-foreground">Twelve months or more without a period counts as after menopause; Home then shows that stage.</p>
            {!dontRemember && (
              <Popover open={openPicker === 0} onOpenChange={(o) => setOpenPicker(o ? 0 : null)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !lastPeriod && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {lastPeriod ? format(lastPeriod, DATE_FMT) : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={lastPeriod}
                    onSelect={(d) => { setLastPeriod(d); setOpenPicker(null); }}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="dont-remember"
                checked={dontRemember}
                onCheckedChange={(checked) => {
                  setDontRemember(checked as boolean);
                  if (checked) setLastPeriod(undefined);
                }}
              />
              <label
                htmlFor="dont-remember"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                I don't remember
              </label>
            </div>
          </div>

          {/* Main Concerns */}
          <div className="space-y-4">
            <Label>Main concerns (select all that apply)</Label>
            <p className="text-sm text-muted-foreground">Your menopause page will track these for you. You can change them there.</p>
            <div className="space-y-3">
              {concernOptions.map((option) => (
                <div key={option.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={option.id}
                    checked={concerns.includes(option.id)}
                    onCheckedChange={() => toggleConcern(option.id)}
                  />
                  <label
                    htmlFor={option.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Button
          className="w-full mt-8"
          onClick={handleFinish}
          disabled={!isFormValid()}
        >
          Finish Setup
        </Button>
      </Card>
    </div>
  );
};

export default MenopauseForm;
