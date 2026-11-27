import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@/components/icons';
import { plateForStage } from '@/components/art';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useOnboarding } from '@/contexts/OnboardingContext';
import ProgressBar from '@/components/onboarding/ProgressBar';
import Logo from '@/components/brand/Logo';

const lifeStages = [
  {
    value: 'pre-menstrual',
    plate: 'pre-menstrual',
    title: 'Before first period',
    description: 'Getting ready for a first period',
  },
  {
    value: 'regular-cycle',
    plate: 'menstrual-cycle',
    title: 'Period tracking',
    description: 'Tracking my cycle',
  },
  {
    value: 'trying-to-conceive',
    plate: 'conception',
    title: 'Trying to conceive',
    description: 'Planning pregnancy',
  },
  {
    value: 'pregnant',
    plate: 'pregnancy',
    title: 'Pregnancy',
    description: 'Expecting a baby',
  },
  {
    value: 'postpartum',
    plate: 'postpartum',
    title: 'After birth',
    description: 'Your recovery and your baby',
  },
  {
    value: 'menopause',
    plate: 'menopause',
    title: 'Menopause or after menopause',
    description: 'Managing menopause',
  },
];

const LifeStageSelection = () => {
  const navigate = useNavigate();
  const { data, updateLifeStage, setCurrentStep } = useOnboarding();
  const [selectedStage, setSelectedStage] = useState(data.lifeStage.stage);

  const handleContinue = () => {
    if (selectedStage) {
      updateLifeStage(selectedStage);
      setCurrentStep(3);
      navigate('/onboarding/mode-setup');
    }
  };

  const handleBack = () => {
    setCurrentStep(1);
    navigate('/onboarding/basic-info');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm">Back</span>
        </button>
        <a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }} className="text-xl hover:opacity-80 transition-opacity">
          <Logo />
        </a>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-2xl">
          <ProgressBar currentStep={2} totalSteps={3} />

          <div className="text-center mb-8">
            <h1 className="text-3xl lg:text-4xl font-bold mb-3">
              Which stage are you in right now?
            </h1>
            <p className="text-muted-foreground">
              Home will show what matters for this stage. You can change it later.
            </p>
          </div>

          <RadioGroup
            value={selectedStage}
            onValueChange={(value) => setSelectedStage(value as typeof selectedStage)}
            className="space-y-4"
          >
            {lifeStages.map((stage) => {
              const Plate = plateForStage(stage.plate);
              const selected = selectedStage === stage.value;
              return (
                <Card
                  key={stage.value}
                  className={`p-4 cursor-pointer transition-colors hover:border-primary/50 ${
                    selected ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => setSelectedStage(stage.value as typeof selectedStage)}
                  data-testid={`stage-card-${stage.value}`}
                >
                  <div className="flex items-center gap-4">
                    <RadioGroupItem value={stage.value} id={stage.value} />
                    <div className="flex-1 min-w-0">
                      <Label htmlFor={stage.value} className="text-lg font-bold cursor-pointer">
                        {stage.title}
                      </Label>
                      <p className="text-sm text-muted-foreground">{stage.description}</p>
                    </div>
                    <div className="w-28 sm:w-36 flex-shrink-0" aria-hidden="true">
                      <Plate title={null} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </RadioGroup>

          <Button
            className="w-full mt-8"
            onClick={handleContinue}
            disabled={!selectedStage}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LifeStageSelection;
