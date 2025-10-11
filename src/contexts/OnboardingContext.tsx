import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface BasicInfo {
  dateOfBirth: Date | undefined;
  height: number;
  heightUnit: 'cm' | 'ft';
  heightFeet?: number;
  heightInches?: number;
  weight: number;
  weightUnit: 'kg' | 'lbs';
  bloodType: string;
}

interface LifeStage {
  stage: 'pre-menstrual' | 'regular-cycle' | 'trying-to-conceive' | 'pregnant' | 'menopause' | '';
}

interface RegularCycleData {
  lastPeriodStart: Date | undefined;
  averageCycleLength: number;
  mainFocus: string;
}

interface TryingToConceiveData {
  tryingDuration: string;
  lastPeriodStart: Date | undefined;
  averageCycleLength: number;
  fertilityTreatments: string[];
}

interface PregnancyData {
  dateType: 'lastPeriod' | 'dueDate' | 'currentWeek';
  lastPeriodDate: Date | undefined;
  dueDate: Date | undefined;
  currentWeek: number;
  firstPregnancy: boolean;
  complications: string;
}

interface PreMenstrualData {
  age: number;
  healthConditions: string;
  guardianEmail: string;
}

interface MenopauseData {
  lastPeriod: Date | undefined;
  dontRememberLastPeriod: boolean;
  onHRT: boolean;
  mainConcerns: string[];
}

interface OnboardingData {
  basicInfo: BasicInfo;
  lifeStage: LifeStage;
  regularCycle?: RegularCycleData;
  tryingToConceive?: TryingToConceiveData;
  pregnancy?: PregnancyData;
  preMenstrual?: PreMenstrualData;
  menopause?: MenopauseData;
  currentStep: number;
}

interface OnboardingContextType {
  data: OnboardingData;
  updateBasicInfo: (info: Partial<BasicInfo>) => void;
  updateLifeStage: (stage: LifeStage['stage']) => void;
  updateRegularCycle: (cycleData: Partial<RegularCycleData>) => void;
  updateTryingToConceive: (ttcData: Partial<TryingToConceiveData>) => void;
  updatePregnancy: (pregData: Partial<PregnancyData>) => void;
  updatePreMenstrual: (pmData: Partial<PreMenstrualData>) => void;
  updateMenopause: (menoData: Partial<MenopauseData>) => void;
  setCurrentStep: (step: number) => void;
  resetOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

const initialData: OnboardingData = {
  basicInfo: {
    dateOfBirth: undefined,
    height: 0,
    heightUnit: 'cm',
    weight: 0,
    weightUnit: 'kg',
    bloodType: '',
  },
  lifeStage: {
    stage: '',
  },
  currentStep: 1,
};

export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const [data, setData] = useState<OnboardingData>(() => {
    const saved = localStorage.getItem('womanie-onboarding');
    return saved ? JSON.parse(saved) : initialData;
  });

  useEffect(() => {
    localStorage.setItem('womanie-onboarding', JSON.stringify(data));
  }, [data]);

  const updateBasicInfo = (info: Partial<BasicInfo>) => {
    setData(prev => ({
      ...prev,
      basicInfo: { ...prev.basicInfo, ...info },
    }));
  };

  const updateLifeStage = (stage: LifeStage['stage']) => {
    setData(prev => ({
      ...prev,
      lifeStage: { stage },
    }));
  };

  const updateRegularCycle = (cycleData: Partial<RegularCycleData>) => {
    setData(prev => ({
      ...prev,
      regularCycle: { ...prev.regularCycle, ...cycleData } as RegularCycleData,
    }));
  };

  const updateTryingToConceive = (ttcData: Partial<TryingToConceiveData>) => {
    setData(prev => ({
      ...prev,
      tryingToConceive: { ...prev.tryingToConceive, ...ttcData } as TryingToConceiveData,
    }));
  };

  const updatePregnancy = (pregData: Partial<PregnancyData>) => {
    setData(prev => ({
      ...prev,
      pregnancy: { ...prev.pregnancy, ...pregData } as PregnancyData,
    }));
  };

  const updatePreMenstrual = (pmData: Partial<PreMenstrualData>) => {
    setData(prev => ({
      ...prev,
      preMenstrual: { ...prev.preMenstrual, ...pmData } as PreMenstrualData,
    }));
  };

  const updateMenopause = (menoData: Partial<MenopauseData>) => {
    setData(prev => ({
      ...prev,
      menopause: { ...prev.menopause, ...menoData } as MenopauseData,
    }));
  };

  const setCurrentStep = (step: number) => {
    setData(prev => ({ ...prev, currentStep: step }));
  };

  const resetOnboarding = () => {
    setData(initialData);
    localStorage.removeItem('womanie-onboarding');
  };

  return (
    <OnboardingContext.Provider
      value={{
        data,
        updateBasicInfo,
        updateLifeStage,
        updateRegularCycle,
        updateTryingToConceive,
        updatePregnancy,
        updatePreMenstrual,
        updateMenopause,
        setCurrentStep,
        resetOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
};
