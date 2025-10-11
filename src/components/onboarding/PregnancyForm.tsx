import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useOnboarding } from '@/contexts/OnboardingContext';

const PregnancyForm = () => {
  const navigate = useNavigate();
  const { data, updatePregnancy } = useOnboarding();
  
  const [dateType, setDateType] = useState<'lastPeriod' | 'dueDate' | 'currentWeek'>(
    data.pregnancy?.dateType || 'lastPeriod'
  );
  const [lastPeriodDate, setLastPeriodDate] = useState<Date | undefined>(
    data.pregnancy?.lastPeriodDate
  );
  const [dueDate, setDueDate] = useState<Date | undefined>(data.pregnancy?.dueDate);
  const [currentWeek, setCurrentWeek] = useState(data.pregnancy?.currentWeek || '');
  const [firstPregnancy, setFirstPregnancy] = useState(
    data.pregnancy?.firstPregnancy !== undefined ? data.pregnancy.firstPregnancy.toString() : ''
  );
  const [complications, setComplications] = useState(data.pregnancy?.complications || '');

  const isFormValid = () => {
    if (dateType === 'lastPeriod' && !lastPeriodDate) return false;
    if (dateType === 'dueDate' && !dueDate) return false;
    if (dateType === 'currentWeek' && (!currentWeek || Number(currentWeek) < 1 || Number(currentWeek) > 42)) return false;
    return firstPregnancy !== '';
  };

  const handleFinish = () => {
    updatePregnancy({
      dateType,
      lastPeriodDate: dateType === 'lastPeriod' ? lastPeriodDate : undefined,
      dueDate: dateType === 'dueDate' ? dueDate : undefined,
      currentWeek: dateType === 'currentWeek' ? Number(currentWeek) : 0,
      firstPregnancy: firstPregnancy === 'true',
      complications,
    });
    navigate('/onboarding/success');
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold mb-3">
          Congratulations! Tell us about your pregnancy
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
                <Popover>
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
                      onSelect={setLastPeriodDate}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </TabsContent>

              <TabsContent value="dueDate" className="mt-4">
                <Popover>
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
                      onSelect={setDueDate}
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

          {/* First Pregnancy */}
          <div className="space-y-4">
            <Label>Is this your first pregnancy? *</Label>
            <RadioGroup value={firstPregnancy} onValueChange={setFirstPregnancy}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="true" id="first-yes" />
                <Label htmlFor="first-yes" className="cursor-pointer">Yes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="false" id="first-no" />
                <Label htmlFor="first-no" className="cursor-pointer">No</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Complications */}
          <div className="space-y-2">
            <Label htmlFor="complications">
              Any complications or conditions? <span className="text-muted-foreground text-sm">(Optional)</span>
            </Label>
            <Textarea
              id="complications"
              placeholder="Please describe any complications or medical conditions..."
              value={complications}
              onChange={(e) => setComplications(e.target.value)}
              rows={4}
            />
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
