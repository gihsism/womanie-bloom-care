import { DATE_FMT } from '@/lib/dateFormat';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format, differenceInDays } from 'date-fns';
import { useOnboarding } from '@/contexts/OnboardingContext';

// Minimal postpartum form: the birth date only. It anchors the recovery
// milestones and the 6-week check. (A "what to focus on" checklist used to
// be here but was never saved or used.)

const PostpartumForm = () => {
  const navigate = useNavigate();
  const { data, updatePostpartum } = useOnboarding();
  // One date picker open at a time; picking a day closes it (it used to
  // stay open over the Finish button on a phone).
  const [openPicker, setOpenPicker] = useState<number | null>(null);

  const [birthDate, setBirthDate] = useState<Date | undefined>(data.postpartum?.birthDate);
  const isFormValid = () => {
    if (!birthDate) return false;
    const days = differenceInDays(new Date(), birthDate);
    return days >= 0 && days <= 730;
  };

  const handleFinish = () => {
    if (!birthDate) return;
    updatePostpartum({ birthDate, mainConcerns: [] });
    navigate('/onboarding/success');
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold mb-3">
          Tell us about your birth and recovery
        </h1>
        <p className="text-muted-foreground">
          The dashboard times recovery milestones to your delivery date.
        </p>
      </div>

      <Card className="p-6 lg:p-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <Label>When was your baby born? *</Label>
            <Popover open={openPicker === 0} onOpenChange={(o) => setOpenPicker(o ? 0 : null)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal', !birthDate && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {birthDate ? format(birthDate, DATE_FMT) : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={birthDate}
                  onSelect={(d) => { setBirthDate(d); setOpenPicker(null); }}
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
        </div>

        <Button className="w-full mt-8" onClick={handleFinish} disabled={!isFormValid()}>
          Finish Setup
        </Button>
      </Card>
    </div>
  );
};

export default PostpartumForm;
