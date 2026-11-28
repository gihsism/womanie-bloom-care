import { DATE_FMT } from '@/lib/dateFormat';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useOnboarding } from '@/contexts/OnboardingContext';

const TryingToConceiveForm = () => {
  const navigate = useNavigate();
  const { data, updateTryingToConceive } = useOnboarding();
  // One date picker open at a time; picking a day closes it (it used to
  // stay open over the Finish button on a phone).
  const [openPicker, setOpenPicker] = useState<number | null>(null);
  
  const [tryingDuration, setTryingDuration] = useState(data.tryingToConceive?.tryingDuration || '');
  const [lastPeriodStart, setLastPeriodStart] = useState<Date | undefined>(
    data.tryingToConceive?.lastPeriodStart
  );
  const [cycleLength, setCycleLength] = useState(data.tryingToConceive?.averageCycleLength || 28);
  const isFormValid = () => {
    return tryingDuration && lastPeriodStart && cycleLength;
  };

  const handleFinish = () => {
    updateTryingToConceive({
      tryingDuration,
      lastPeriodStart,
      averageCycleLength: cycleLength,
    });
    navigate('/onboarding/success');
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold mb-3">
          Tell us about trying to conceive
        </h1>
      </div>

      <Card className="p-6 lg:p-8">
        <div className="space-y-6">
          {/* Trying Duration */}
          <div className="space-y-2">
            <Label>How long have you been trying? *</Label>
            <Select value={tryingDuration} onValueChange={setTryingDuration}>
              <SelectTrigger aria-label="How long have you been trying?">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="just-started">Just started</SelectItem>
                <SelectItem value="1-3-months">1-3 months</SelectItem>
                <SelectItem value="3-6-months">3-6 months</SelectItem>
                <SelectItem value="6-12-months">6-12 months</SelectItem>
                <SelectItem value="over-year">Over a year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Last Period Start */}
          <div className="space-y-2">
            <Label>When did your last period start? *</Label>
            <Popover open={openPicker === 0} onOpenChange={(o) => setOpenPicker(o ? 0 : null)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !lastPeriodStart && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {lastPeriodStart ? format(lastPeriodStart, DATE_FMT) : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={lastPeriodStart}
                  onSelect={(d) => { setLastPeriodStart(d); setOpenPicker(null); }}
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
              <SelectTrigger aria-label="Average cycle length (days)">
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

          {/* The old treatments checklist was never saved; IVF is its own stage now. */}
          <p className="text-sm text-muted-foreground">
            Going through IVF or another fertility treatment? Go back and choose "IVF or fertility treatment" to get the treatment tracker.
          </p>
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

export default TryingToConceiveForm;
