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

// Period tracking and contraception: the last period start and cycle
// length seed the calendar (period_tracking). The stage itself now comes
// from step 2 (Contraception and IVF are stages there), so the old "main
// focus" question is gone; mainFocus is still written for older code paths.
// With contraception (an IUD, implant or the pill) she may have no periods,
// so the date is optional there.

const RegularCycleForm = ({ contraception = false }: { contraception?: boolean }) => {
  const navigate = useNavigate();
  const { data, updateRegularCycle } = useOnboarding();
  // One date picker open at a time; picking a day closes it (it used to
  // stay open over the Finish button on a phone).
  const [openPicker, setOpenPicker] = useState<number | null>(null);
  
  const [lastPeriodStart, setLastPeriodStart] = useState<Date | undefined>(
    data.regularCycle?.lastPeriodStart
  );
  const [cycleLength, setCycleLength] = useState(data.regularCycle?.averageCycleLength || 28);

  const isFormValid = () => {
    return (contraception || lastPeriodStart) && cycleLength;
  };

  const handleFinish = () => {
    updateRegularCycle({
      lastPeriodStart,
      averageCycleLength: cycleLength,
      mainFocus: contraception ? 'contraception' : 'general',
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
            <Label>
              When did your last period start?{' '}
              {contraception ? <span className="text-muted-foreground text-sm">(Optional, skip if you don't have periods)</span> : '*'}
            </Label>
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
                  {lastPeriodStart ? format(lastPeriodStart, 'PPP') : <span>Pick a date</span>}
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
