import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Baby, Calendar, Heart, Flower2, Sunset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useOnboarding } from '@/contexts/OnboardingContext';
import ProgressBar from '@/components/onboarding/ProgressBar';

const lifeStages = [
  {
    value: 'pre-menstrual',
    icon: Flower2,
    title: 'Pre-menstrual',
    description: 'Before first period',
  },
  {
    value: 'regular-cycle',
    icon: Calendar,
    title: 'Regular menstrual cycle',
    description: 'Tracking my cycle',
  },
  {
    value: 'trying-to-conceive',
    icon: Heart,
    title: 'Trying to conceive',
    description: 'Planning pregnancy',
  },
  {
    value: 'pregnant',
    icon: Baby,
    title: 'Currently pregnant',
    description: 'Expecting a baby',
  },
  {
    value: 'menopause',
    icon: Sunset,
    title: 'Menopause/Post-menopause',
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
      <div className="mb-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm">Back</span>
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-2xl">
          <ProgressBar currentStep={2} totalSteps={3} />

          <div className="text-center mb-8">
            <h1 className="text-3xl lg:text-4xl font-bold mb-3">
              Where are you in your health journey?
            </h1>
            <p className="text-muted-foreground">
              We'll customize your experience based on your stage
            </p>
          </div>

          <RadioGroup
            value={selectedStage}
            onValueChange={(value) => setSelectedStage(value as typeof selectedStage)}
            className="space-y-4"
          >
            {lifeStages.map((stage) => {
              const Icon = stage.icon;
              return (
                <Card
                  key={stage.value}
                  className={`p-6 cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/50 ${
                    selectedStage === stage.value ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => setSelectedStage(stage.value as typeof selectedStage)}
                >
                  <div className="flex items-center gap-4">
                    <RadioGroupItem value={stage.value} id={stage.value} />
                    <div className="flex-1 flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          selectedStage === stage.value ? 'bg-primary/20' : 'bg-muted'
                        }`}
                      >
                        <Icon
                          className={`h-6 w-6 ${
                            selectedStage === stage.value ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor={stage.value} className="text-lg font-bold cursor-pointer">
                          {stage.title}
                        </Label>
                        <p className="text-sm text-muted-foreground">{stage.description}</p>
                      </div>
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
