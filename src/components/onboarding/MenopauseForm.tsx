import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useOnboarding } from '@/contexts/OnboardingContext';

const MenopauseForm = () => {
  const navigate = useNavigate();
  const { data, updateMenopause } = useOnboarding();
  
  const [lastPeriod, setLastPeriod] = useState<Date | undefined>(data.menopause?.lastPeriod);
  const [dontRemember, setDontRemember] = useState(data.menopause?.dontRememberLastPeriod || false);
  const [onHRT, setOnHRT] = useState(
    data.menopause?.onHRT !== undefined ? data.menopause.onHRT.toString() : ''
  );
  const [concerns, setConcerns] = useState<string[]>(data.menopause?.mainConcerns || []);

  const concernOptions = [
    { id: 'hot-flashes', label: 'Hot flashes' },
    { id: 'night-sweats', label: 'Night sweats' },
    { id: 'mood-changes', label: 'Mood changes' },
    { id: 'sleep-issues', label: 'Sleep issues' },
    { id: 'weight-changes', label: 'Weight changes' },
    { id: 'bone-health', label: 'Bone health' },
    { id: 'other', label: 'Other' },
  ];

  const toggleConcern = (concernId: string) => {
    setConcerns((prev) =>
      prev.includes(concernId) ? prev.filter((c) => c !== concernId) : [...prev, concernId]
    );
  };

  const isFormValid = () => {
    return (lastPeriod || dontRemember) && onHRT !== '';
  };

  const handleFinish = () => {
    updateMenopause({
      lastPeriod: dontRemember ? undefined : lastPeriod,
      dontRememberLastPeriod: dontRemember,
      onHRT: onHRT === 'true',
      mainConcerns: concerns,
    });
    navigate('/onboarding/success');
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold mb-3">
          Let's support your menopause journey
        </h1>
      </div>

      <Card className="p-6 lg:p-8">
        <div className="space-y-6">
          {/* Last Period */}
          <div className="space-y-4">
            <Label>When was your last period? *</Label>
            {!dontRemember && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !lastPeriod && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {lastPeriod ? format(lastPeriod, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={lastPeriod}
                    onSelect={setLastPeriod}
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

          {/* HRT */}
          <div className="space-y-4">
            <Label>Are you currently on HRT (Hormone Replacement Therapy)? *</Label>
            <RadioGroup value={onHRT} onValueChange={setOnHRT}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="true" id="hrt-yes" />
                <Label htmlFor="hrt-yes" className="cursor-pointer">Yes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="false" id="hrt-no" />
                <Label htmlFor="hrt-no" className="cursor-pointer">No</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Main Concerns */}
          <div className="space-y-4">
            <Label>Main concerns (select all that apply)</Label>
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
