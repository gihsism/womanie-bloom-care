import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { format, differenceInDays } from 'date-fns';
import { useOnboarding } from '@/contexts/OnboardingContext';

// Minimal postpartum form: birth date + (optional) feeding context.
// Birth date is the only required field — without it the postpartum
// dashboard can't time-anchor recovery milestones.

const PostpartumForm = () => {
  const navigate = useNavigate();
  const { data, updatePostpartum } = useOnboarding();

  const [birthDate, setBirthDate] = useState<Date | undefined>(data.postpartum?.birthDate);
  const [concerns, setConcerns] = useState<string[]>(data.postpartum?.mainConcerns || []);

  const concernOptions = [
    { id: 'lochia', label: 'Postpartum bleeding (lochia)' },
    { id: 'feeding', label: 'Breastfeeding / feeding' },
    { id: 'sleep', label: 'Sleep' },
    { id: 'mood', label: 'Mood / mental health' },
    { id: 'pelvic-floor', label: 'Pelvic floor / incision recovery' },
    { id: 'returning-work', label: 'Returning to work' },
  ];

  const toggleConcern = (id: string) => {
    setConcerns(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const isFormValid = () => {
    if (!birthDate) return false;
    const days = differenceInDays(new Date(), birthDate);
    return days >= 0 && days <= 730;
  };

  const handleFinish = () => {
    if (!birthDate) return;
    updatePostpartum({ birthDate, mainConcerns: concerns });
    navigate('/onboarding/success');
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold mb-3">
          Welcome — let's tune Womanie for your fourth trimester
        </h1>
        <p className="text-muted-foreground">
          The dashboard times recovery milestones to your delivery date.
        </p>
      </div>

      <Card className="p-6 lg:p-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <Label>When was your baby born? *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal', !birthDate && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {birthDate ? format(birthDate, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={birthDate}
                  onSelect={setBirthDate}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {birthDate && (
              <p className="text-xs text-muted-foreground">
                {differenceInDays(new Date(), birthDate)} days postpartum
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>What would you like to focus on? (optional)</Label>
            <div className="space-y-3">
              {concernOptions.map(option => (
                <div key={option.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={option.id}
                    checked={concerns.includes(option.id)}
                    onCheckedChange={() => toggleConcern(option.id)}
                  />
                  <label
                    htmlFor={option.id}
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Button className="w-full mt-8" onClick={handleFinish} disabled={!isFormValid()}>
          Finish Setup
        </Button>
      </Card>
    </div>
  );
};

export default PostpartumForm;
