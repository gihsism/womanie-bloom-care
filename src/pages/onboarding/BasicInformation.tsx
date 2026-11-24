import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import OnboardingScreen from '@/components/onboarding/OnboardingScreen';
import { DateField, FIELD, FieldLabel } from '@/components/onboarding/Choice';
import { ONBOARDING_PATHS, withDobPart } from '@/lib/onboardingFlow';

// Screen 4 of 5: about you (date of birth, height, weight, blood type).
// Same fields and the same "can continue" rule as before; skippable.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const BasicInformation = () => {
  usePageTitle('About you');
  const navigate = useNavigate();
  const { data, updateBasicInfo, setCurrentStep } = useOnboarding();

  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(data.basicInfo.dateOfBirth ? new Date(data.basicInfo.dateOfBirth) : undefined);
  const [height, setHeight] = useState<string | number>(data.basicInfo.height || '');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>(data.basicInfo.heightUnit);
  const [heightFeet, setHeightFeet] = useState<string | number>(data.basicInfo.heightFeet || '');
  const [heightInches, setHeightInches] = useState<string | number>(data.basicInfo.heightInches || '');
  const [weight, setWeight] = useState<string | number>(data.basicInfo.weight || '');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>(data.basicInfo.weightUnit);
  const [bloodType, setBloodType] = useState(data.basicInfo.bloodType || '');

  const isFormValid = () => {
    if (!dateOfBirth) return false;
    if (heightUnit === 'cm' && (!height || Number(height) <= 0)) return false;
    if (heightUnit === 'ft' && (!heightFeet || Number(heightFeet) <= 0)) return false;
    if (!weight || Number(weight) <= 0) return false;
    return true;
  };

  const goOn = () => {
    setCurrentStep(5);
    navigate(ONBOARDING_PATHS.done);
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
    goOn();
  };

  const unitTrigger = 'h-12 w-24 rounded-full px-4 text-[16px] md:text-[16px]';

  return (
    <OnboardingScreen
      step={4}
      title="A little about you"
      sub="It helps us read your results against the right ranges."
      onBack={() => { setCurrentStep(3); navigate(ONBOARDING_PATHS.second); }}
      primary={{ label: 'Continue', onClick: handleContinue, disabled: !isFormValid() }}
      secondary={{ label: 'Skip for now', onClick: goOn }}
    >
      <div className="space-y-6">
        <div>
          <FieldLabel>Date of birth</FieldLabel>
          <div className="flex gap-2">
            <Select
              value={dateOfBirth ? dateOfBirth.getFullYear().toString() : ''}
              onValueChange={(year) => setDateOfBirth(withDobPart(dateOfBirth, { year: parseInt(year) }))}
            >
              <SelectTrigger className={`${FIELD} flex-1 px-4`} aria-label="Year">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 124 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={dateOfBirth ? dateOfBirth.getMonth().toString() : ''}
              onValueChange={(month) => setDateOfBirth(withDobPart(dateOfBirth, { month: parseInt(month) }))}
            >
              <SelectTrigger className={`${FIELD} flex-[1.3] px-4`} aria-label="Month">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month, i) => (
                  <SelectItem key={month} value={i.toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              inputMode="numeric"
              aria-label="Day"
              placeholder="Day"
              min="1"
              max="31"
              value={dateOfBirth ? dateOfBirth.getDate() : ''}
              onChange={(e) => {
                const day = parseInt(e.target.value);
                if (day >= 1 && day <= 31) setDateOfBirth(withDobPart(dateOfBirth, { day }));
              }}
              className={`${FIELD} w-20 px-4`}
            />
          </div>
          <div className="mt-2">
            <DateField
              label="Or pick from calendar"
              placeholder="Or pick from calendar"
              value={dateOfBirth}
              onChange={setDateOfBirth}
              disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
              captionDropdowns={{ fromYear: 1900, toYear: new Date().getFullYear() }}
            />
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="height">Height</FieldLabel>
          <div className="flex gap-2">
            {heightUnit === 'cm' ? (
              <Input id="height" type="number" inputMode="decimal" placeholder="170" value={height} onChange={(e) => setHeight(e.target.value)} className={`${FIELD} flex-1`} />
            ) : (
              <>
                <Input id="height" type="number" inputMode="numeric" aria-label="Feet" placeholder="5 ft" value={heightFeet} onChange={(e) => setHeightFeet(e.target.value)} className={`${FIELD} flex-1`} />
                <Input type="number" inputMode="numeric" aria-label="Inches" placeholder="7 in" value={heightInches} onChange={(e) => setHeightInches(e.target.value)} className={`${FIELD} flex-1`} />
              </>
            )}
            <Select value={heightUnit} onValueChange={(value: 'cm' | 'ft') => setHeightUnit(value)}>
              <SelectTrigger className={unitTrigger} aria-label="Height unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cm">cm</SelectItem>
                <SelectItem value="ft">ft/in</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="weight">Weight</FieldLabel>
          <div className="flex gap-2">
            <Input id="weight" type="number" inputMode="decimal" placeholder={weightUnit === 'kg' ? '65' : '143'} value={weight} onChange={(e) => setWeight(e.target.value)} className={`${FIELD} flex-1`} />
            <Select value={weightUnit} onValueChange={(value: 'kg' | 'lbs') => setWeightUnit(value)}>
              <SelectTrigger className={unitTrigger} aria-label="Weight unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kg">kg</SelectItem>
                <SelectItem value="lbs">lbs</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="bloodType" optional>Blood type</FieldLabel>
          <Select value={bloodType} onValueChange={setBloodType}>
            <SelectTrigger id="bloodType" className={FIELD}>
              <SelectValue placeholder="I don't know" />
            </SelectTrigger>
            <SelectContent>
              {BLOOD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </OnboardingScreen>
  );
};

export default BasicInformation;
