import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useOnboarding } from '@/contexts/OnboardingContext';

const PreMenstrualForm = () => {
  const navigate = useNavigate();
  const { data, updatePreMenstrual } = useOnboarding();
  
  const [age, setAge] = useState(data.preMenstrual?.age || '');
  const [healthConditions, setHealthConditions] = useState(data.preMenstrual?.healthConditions || '');
  const [guardianEmail, setGuardianEmail] = useState(data.preMenstrual?.guardianEmail || '');

  const isFormValid = () => {
    if (!age || Number(age) < 8 || Number(age) > 18) return false;
    if (Number(age) < 18 && !guardianEmail) return false;
    return true;
  };

  const handleFinish = () => {
    updatePreMenstrual({
      age: Number(age),
      healthConditions,
      guardianEmail,
    });
    navigate('/onboarding/success');
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold mb-3">
          Let's prepare for your health journey
        </h1>
      </div>

      <Card className="p-6 lg:p-8">
        <div className="space-y-6">
          {/* Age */}
          <div className="space-y-2">
            <Label htmlFor="age">Your age *</Label>
            <Input
              id="age"
              type="number"
              min="8"
              max="18"
              placeholder="Enter your age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </div>

          {/* Health Conditions */}
          <div className="space-y-2">
            <Label htmlFor="conditions">
              Any health conditions we should know about?{' '}
              <span className="text-muted-foreground text-sm">(Optional)</span>
            </Label>
            <Textarea
              id="conditions"
              placeholder="Please describe any health conditions or concerns..."
              value={healthConditions}
              onChange={(e) => setHealthConditions(e.target.value)}
              rows={4}
            />
          </div>

          {/* Guardian Email */}
          {age && Number(age) < 18 && (
            <div className="space-y-2">
              <Label htmlFor="guardian-email">Parent/Guardian Email *</Label>
              <Input
                id="guardian-email"
                type="email"
                placeholder="guardian@example.com"
                value={guardianEmail}
                onChange={(e) => setGuardianEmail(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                We'll send your parent/guardian information about your account
              </p>
            </div>
          )}
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

export default PreMenstrualForm;
