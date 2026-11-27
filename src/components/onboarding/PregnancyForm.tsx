import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useOnboarding } from '@/contexts/OnboardingContext';

// Only the dates: they set profiles.pregnancy_due_date (weeks, scans,
// vaccinations). "First pregnancy?" (required) and "complications" were
// asked here but never saved or used anywhere, so they are gone.

const PregnancyForm = () => {
  const navigate = useNavigate();
  const { data, updatePregnancy } = useOnboarding();
  // One date picker open at a time; picking a day closes it (it used to
  // stay open over the Finish button on a phone).
  const [openPicker, setOpenPicker] = useState<number | null>(null);
  
  const [dateType, setDateType] = useState<'lastPeriod' | 'dueDate' | 'currentWeek'>(
    data.pregnancy?.dateType || 'lastPeriod'
  );
  const [lastPeriodDate, setLastPeriodDate] = useState<Date | undefined>(
    data.pregnancy?.lastPeriodDate
  );
  const [dueDate, setDueDate] = useState<Date | undefined>(data.pregnancy?.dueDate);
  const [currentWeek, setCurrentWeek] = useState(data.pregnancy?.currentWeek || '');

  const isFormValid = () => {
    if (dateType === 'lastPeriod' && !lastPeriodDate) return false;
    if (dateType === 'dueDate' && !dueDate) return false;
    if (dateType === 'currentWeek' && (!currentWeek || Number(currentWeek) < 1 || Number(currentWeek) > 42)) return false;
    return true;
  };

  const handleFinish = () => {
    updatePregnancy({
      dateType,
      lastPeriodDate: dateType === 'lastPeriod' ? lastPeriodDate : undefined,
      dueDate: dateType === 'dueDate' ? dueDate : undefined,
      currentWeek: dateType === 'currentWeek' ? Number(currentWeek) : 0,
    });
    navigate('/onboarding/success');
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold mb-3">
          Congratulations. Tell us about your pregnancy
        </h1>
      </div>

      <Card className="p-6 lg:p-8">
        <div className="space-y-6">
          {/* Pregnancy Date Selection */}
          <div className="space-y-4">
            <Label>Choose how to track your pregnancy *</Label>
            <Tabs value={dateType} onValueChange={(v) => setDateType(v as typeof dateType)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="lastPeriod">Last Period</TabsTrigger>
                <TabsTrigger value="dueDate">Due Date</TabsTrigger>
                <TabsTrigger value="currentWeek">Current Week</TabsTrigger>
              </TabsList>

              <TabsContent value="lastPeriod" className="mt-4">
                <Popover open={openPicker === 0} onOpenChange={(o) => setOpenPicker(o ? 0 : null)}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !lastPeriodDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {lastPeriodDate ? format(lastPeriodDate, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={lastPeriodDate}
                      onSelect={(d) => { setLastPeriodDate(d); setOpenPicker(null); }}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </TabsContent>

              <TabsContent value="dueDate" className="mt-4">
                <Popover open={openPicker === 1} onOpenChange={(o) => setOpenPicker(o ? 1 : null)}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !dueDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={(d) => { setDueDate(d); setOpenPicker(null); }}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </TabsContent>

              <TabsContent value="currentWeek" className="mt-4">
                <Input
                  type="number"
                  min="1"
                  max="42"
                  placeholder="Enter week (1-42)"
                  value={currentWeek}
                  onChange={(e) => setCurrentWeek(e.target.value)}
                />
              </TabsContent>
            </Tabs>
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

export default PregnancyForm;
