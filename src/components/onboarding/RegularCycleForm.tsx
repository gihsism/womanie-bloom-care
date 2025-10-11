import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useOnboarding } from '@/contexts/OnboardingContext';

const RegularCycleForm = () => {
  const navigate = useNavigate();
  const { data, updateRegularCycle } = useOnboarding();
  
  const [lastPeriodStart, setLastPeriodStart] = useState<Date | undefined>(
    data.regularCycle?.lastPeriodStart
  );
  const [cycleLength, setCycleLength] = useState(data.regularCycle?.averageCycleLength || 28);
  const [mainFocus, setMainFocus] = useState(data.regularCycle?.mainFocus || '');

  const isFormValid = () => {
    return lastPeriodStart && cycleLength && mainFocus;
  };

  const handleFinish = () => {
    updateRegularCycle({
      lastPeriodStart,
      averageCycleLength: cycleLength,
      mainFocus,
    });
    navigate('/onboarding/success');
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold mb-3">Tell us about your cycle</h1>
      </div>

      <Card className="p-6 lg:p-8">
        <div className="space-y-6">
          {/* Last Period Start */}
          <div className="space-y-2">
            <Label>When did your last period start? *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !lastPeriodStart && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {lastPeriodStart ? format(lastPeriodStart, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={lastPeriodStart}
                  onSelect={setLastPeriodStart}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Average Cycle Length */}
          <div className="space-y-2">
            <Label>Average cycle length (days) *</Label>
            <Select value={cycleLength.toString()} onValueChange={(v) => setCycleLength(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 25 }, (_, i) => i + 21).map((day) => (
                  <SelectItem key={day} value={day.toString()}>
                    {day} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Main Focus */}
          <div className="space-y-4">
            <Label>What's your main focus? *</Label>
            <RadioGroup value={mainFocus} onValueChange={setMainFocus}>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setMainFocus('contraception')}>
                  <RadioGroupItem value="contraception" id="contraception" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="contraception" className="font-bold cursor-pointer">
                      Contraception/Prevention
                    </Label>
                    <p className="text-sm text-muted-foreground">Avoiding pregnancy</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setMainFocus('conception')}>
                  <RadioGroupItem value="conception" id="conception" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="conception" className="font-bold cursor-pointer">
                      Conception/Getting pregnant
                    </Label>
                    <p className="text-sm text-muted-foreground">Trying to conceive</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setMainFocus('ivf')}>
                  <RadioGroupItem value="ivf" id="ivf" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="ivf" className="font-bold cursor-pointer">
                      IVF/Fertility treatment
                    </Label>
                    <p className="text-sm text-muted-foreground">Undergoing treatment</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setMainFocus('general')}>
                  <RadioGroupItem value="general" id="general" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="general" className="font-bold cursor-pointer">
                      General health tracking
                    </Label>
                    <p className="text-sm text-muted-foreground">Just tracking my health</p>
                  </div>
                </div>
              </div>
            </RadioGroup>
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

export default RegularCycleForm;
