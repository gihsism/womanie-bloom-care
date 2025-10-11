import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useOnboarding } from '@/contexts/OnboardingContext';
import ProgressBar from '@/components/onboarding/ProgressBar';

const BasicInformation = () => {
  const navigate = useNavigate();
  const { data, updateBasicInfo, setCurrentStep } = useOnboarding();
  
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(data.basicInfo.dateOfBirth);
  const [height, setHeight] = useState(data.basicInfo.height || '');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>(data.basicInfo.heightUnit);
  const [heightFeet, setHeightFeet] = useState(data.basicInfo.heightFeet || '');
  const [heightInches, setHeightInches] = useState(data.basicInfo.heightInches || '');
  const [weight, setWeight] = useState(data.basicInfo.weight || '');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>(data.basicInfo.weightUnit);
  const [bloodType, setBloodType] = useState(data.basicInfo.bloodType || '');

  const isFormValid = () => {
    if (!dateOfBirth) return false;
    if (heightUnit === 'cm' && (!height || Number(height) <= 0)) return false;
    if (heightUnit === 'ft' && (!heightFeet || Number(heightFeet) <= 0)) return false;
    if (!weight || Number(weight) <= 0) return false;
    return true;
  };

  const handleContinue = () => {
    updateBasicInfo({
      dateOfBirth,
      height: heightUnit === 'cm' ? Number(height) : Number(heightFeet) * 30.48 + Number(heightInches || 0) * 2.54,
      heightUnit,
      heightFeet: heightUnit === 'ft' ? Number(heightFeet) : undefined,
      heightInches: heightUnit === 'ft' ? Number(heightInches || 0) : undefined,
      weight: Number(weight),
      weightUnit,
      bloodType,
    });
    setCurrentStep(2);
    navigate('/onboarding/life-stage');
  };

  const handleSkip = () => {
    setCurrentStep(2);
    navigate('/onboarding/life-stage');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <ProgressBar currentStep={1} totalSteps={3} />

        <div className="text-center mb-8">
          <h1 className="text-3xl lg:text-4xl font-bold mb-3">
            Let's personalize Womanie for you
          </h1>
          <p className="text-muted-foreground">This helps us give you better health insights</p>
        </div>

        <Card className="p-6 lg:p-8">
          <div className="space-y-6">
            {/* Date of Birth */}
            <div className="space-y-2">
              <Label htmlFor="dob">Date of Birth *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dateOfBirth && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateOfBirth ? format(dateOfBirth, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateOfBirth}
                    onSelect={setDateOfBirth}
                    disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Height */}
            <div className="space-y-2">
              <Label htmlFor="height">Height *</Label>
              <div className="flex gap-2">
                {heightUnit === 'cm' ? (
                  <Input
                    id="height"
                    type="number"
                    placeholder="170"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    className="flex-1"
                  />
                ) : (
                  <>
                    <Input
                      type="number"
                      placeholder="5"
                      value={heightFeet}
                      onChange={(e) => setHeightFeet(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="7"
                      value={heightInches}
                      onChange={(e) => setHeightInches(e.target.value)}
                      className="flex-1"
                    />
                  </>
                )}
                <Select value={heightUnit} onValueChange={(value: 'cm' | 'ft') => setHeightUnit(value)}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cm">cm</SelectItem>
                    <SelectItem value="ft">ft/in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Weight */}
            <div className="space-y-2">
              <Label htmlFor="weight">Weight *</Label>
              <div className="flex gap-2">
                <Input
                  id="weight"
                  type="number"
                  placeholder={weightUnit === 'kg' ? '65' : '143'}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="flex-1"
                />
                <Select value={weightUnit} onValueChange={(value: 'kg' | 'lbs') => setWeightUnit(value)}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="lbs">lbs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Blood Type */}
            <div className="space-y-2">
              <Label htmlFor="bloodType">
                Blood Type <span className="text-muted-foreground text-sm">(Optional)</span>
              </Label>
              <Select value={bloodType} onValueChange={setBloodType}>
                <SelectTrigger id="bloodType">
                  <SelectValue placeholder="Select blood type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A+">A+</SelectItem>
                  <SelectItem value="A-">A-</SelectItem>
                  <SelectItem value="B+">B+</SelectItem>
                  <SelectItem value="B-">B-</SelectItem>
                  <SelectItem value="AB+">AB+</SelectItem>
                  <SelectItem value="AB-">AB-</SelectItem>
                  <SelectItem value="O+">O+</SelectItem>
                  <SelectItem value="O-">O-</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <Button
              className="w-full"
              onClick={handleContinue}
              disabled={!isFormValid()}
            >
              Continue
            </Button>
            <button
              onClick={handleSkip}
              className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Skip for now
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default BasicInformation;
