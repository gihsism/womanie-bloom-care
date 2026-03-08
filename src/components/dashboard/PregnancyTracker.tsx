import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays, differenceInWeeks, addDays, format, parseISO } from 'date-fns';
import {
  Baby,
  Calendar,
  Heart,
  Activity,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Ruler,
  Scale,
  Apple,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Pregnancy week-by-week data ───
const WEEK_DATA: Record<number, { size: string; sizeComparison: string; length: string; weight: string; developments: string[]; tips: string[] }> = {
  4: { size: 'Poppy seed', sizeComparison: '🌱', length: '~1mm', weight: '<1g', developments: ['Embryo implants in uterus', 'Placenta begins forming'], tips: ['Start prenatal vitamins', 'Avoid alcohol and smoking'] },
  5: { size: 'Sesame seed', sizeComparison: '🫘', length: '~2mm', weight: '<1g', developments: ['Heart begins to beat', 'Neural tube forming'], tips: ['Schedule your first prenatal visit', 'Stay hydrated'] },
  6: { size: 'Lentil', sizeComparison: '🫘', length: '~6mm', weight: '<1g', developments: ['Nose, mouth, ears forming', 'Heart beats 110 times/min'], tips: ['Manage morning sickness with small meals', 'Get plenty of rest'] },
  7: { size: 'Blueberry', sizeComparison: '🫐', length: '~13mm', weight: '<1g', developments: ['Arms and legs developing', 'Brain growing rapidly'], tips: ['Eat folate-rich foods', 'Start gentle exercise routine'] },
  8: { size: 'Raspberry', sizeComparison: '🍇', length: '~16mm', weight: '~1g', developments: ['Fingers and toes forming', 'Baby starts moving (you can\'t feel it yet)'], tips: ['Wear comfortable clothing', 'Stay active with walks'] },
  9: { size: 'Cherry', sizeComparison: '🍒', length: '~23mm', weight: '~2g', developments: ['All essential organs have begun forming', 'Tiny muscles begin to work'], tips: ['Consider prenatal yoga', 'Eat balanced meals'] },
  10: { size: 'Strawberry', sizeComparison: '🍓', length: '~31mm', weight: '~4g', developments: ['Vital organs fully formed', 'Fingernails start to develop'], tips: ['Schedule nuchal translucency scan', 'Monitor weight gain'] },
  11: { size: 'Fig', sizeComparison: '🫒', length: '~41mm', weight: '~7g', developments: ['Bones beginning to harden', 'Baby can open and close fists'], tips: ['Second trimester approaching', 'Energy levels may improve soon'] },
  12: { size: 'Lime', sizeComparison: '🍋', length: '~54mm', weight: '~14g', developments: ['Reflexes developing', 'Intestines moving into abdomen'], tips: ['End of first trimester!', 'Risk of miscarriage drops significantly'] },
  13: { size: 'Peach', sizeComparison: '🍑', length: '~74mm', weight: '~23g', developments: ['Fingerprints forming', 'Vocal cords developing'], tips: ['Welcome to second trimester', 'You may start showing'] },
  16: { size: 'Avocado', sizeComparison: '🥑', length: '~12cm', weight: '~100g', developments: ['Can make facial expressions', 'Skeleton hardening'], tips: ['You might feel first kicks (quickening)', 'Schedule anomaly scan around week 20'] },
  20: { size: 'Banana', sizeComparison: '🍌', length: '~26cm', weight: '~300g', developments: ['Can hear sounds', 'Developing sleep patterns'], tips: ['Halfway there!', 'Start planning nursery'] },
  24: { size: 'Corn on the cob', sizeComparison: '🌽', length: '~30cm', weight: '~600g', developments: ['Lungs developing surfactant', 'Responds to light and sound'], tips: ['Glucose tolerance test around now', 'Start kick counting'] },
  28: { size: 'Eggplant', sizeComparison: '🍆', length: '~38cm', weight: '~1kg', developments: ['Eyes can open and close', 'Baby may dream (REM sleep)'], tips: ['Third trimester begins', 'Monitor for swelling'] },
  32: { size: 'Squash', sizeComparison: '🎃', length: '~42cm', weight: '~1.7kg', developments: ['Practicing breathing movements', 'Bones fully developed but still soft'], tips: ['Start birth plan', 'Pack hospital bag'] },
  36: { size: 'Honeydew melon', sizeComparison: '🍈', length: '~47cm', weight: '~2.6kg', developments: ['Fat layers filling out', 'Head may engage in pelvis'], tips: ['Weekly check-ups now', 'Rest as much as possible'] },
  38: { size: 'Pumpkin', sizeComparison: '🎃', length: '~50cm', weight: '~3kg', developments: ['Fully developed lungs', 'Brain and lungs continue maturing'], tips: ['Full term!', 'Watch for signs of labour'] },
  40: { size: 'Watermelon', sizeComparison: '🍉', length: '~51cm', weight: '~3.4kg', developments: ['Ready to be born!', 'All organs mature and functioning'], tips: ['Due date week!', 'Stay calm and prepared'] },
};

const getWeekData = (week: number) => {
  const keys = Object.keys(WEEK_DATA).map(Number).sort((a, b) => a - b);
  let bestKey = keys[0];
  for (const k of keys) {
    if (k <= week) bestKey = k;
    else break;
  }
  return WEEK_DATA[bestKey] || WEEK_DATA[4];
};

// ─── Pregnancy symptoms by trimester ───
const PREGNANCY_SYMPTOMS: Record<string, { label: string; icon: string }[]> = {
  first: [
    { label: 'Morning sickness', icon: '🤢' },
    { label: 'Fatigue', icon: '😴' },
    { label: 'Tender breasts', icon: '💢' },
    { label: 'Frequent urination', icon: '🚻' },
    { label: 'Food aversions', icon: '🙅' },
    { label: 'Mood swings', icon: '🎭' },
  ],
  second: [
    { label: 'Back pain', icon: '🔙' },
    { label: 'Round ligament pain', icon: '⚡' },
    { label: 'Nasal congestion', icon: '🤧' },
    { label: 'Leg cramps', icon: '🦵' },
    { label: 'Heartburn', icon: '🔥' },
    { label: 'Increased appetite', icon: '🍽️' },
  ],
  third: [
    { label: 'Braxton Hicks', icon: '💫' },
    { label: 'Shortness of breath', icon: '😮‍💨' },
    { label: 'Swelling', icon: '🫧' },
    { label: 'Insomnia', icon: '😵' },
    { label: 'Pelvic pressure', icon: '⬇️' },
    { label: 'Nesting instinct', icon: '🏠' },
  ],
};

interface PregnancyTrackerProps {
  dueDate: Date | null;
  onSetDueDate: (date: Date) => void;
}

const PregnancyTracker = ({ dueDate, onSetDueDate }: PregnancyTrackerProps) => {
  const [dueDateInput, setDueDateInput] = useState('');
  const [lmpInput, setLmpInput] = useState('');
  const [setupMethod, setSetupMethod] = useState<'due_date' | 'lmp' | 'ivf'>('due_date');
  const [ivfTransferInput, setIvfTransferInput] = useState('');
  const [ivfEmbryoAge, setIvfEmbryoAge] = useState<3 | 5>(5);

  const pregnancyInfo = useMemo(() => {
    if (!dueDate) return null;

    const today = new Date();
    const gestationStart = addDays(dueDate, -280); // 40 weeks before due date
    const totalDays = differenceInDays(today, gestationStart);
    const weeksPregnant = Math.floor(totalDays / 7);
    const daysExtra = totalDays % 7;
    const daysUntilDue = differenceInDays(dueDate, today);
    const trimester = weeksPregnant < 13 ? 1 : weeksPregnant < 27 ? 2 : 3;
    const trimesterLabel = trimester === 1 ? 'First' : trimester === 2 ? 'Second' : 'Third';
    const trimesterKey = trimester === 1 ? 'first' : trimester === 2 ? 'second' : 'third';
    const progressPercent = Math.min(100, Math.round((totalDays / 280) * 100));
    const weekData = getWeekData(weeksPregnant);

    return {
      weeksPregnant,
      daysExtra,
      daysUntilDue,
      trimester,
      trimesterLabel,
      trimesterKey,
      progressPercent,
      weekData,
      totalDays,
    };
  }, [dueDate]);

  const handleSetDueDate = () => {
    if (setupMethod === 'due_date' && dueDateInput) {
      onSetDueDate(parseISO(dueDateInput));
    } else if (setupMethod === 'lmp' && lmpInput) {
      const lmpDate = parseISO(lmpInput);
      const calculatedDueDate = addDays(lmpDate, 280);
      onSetDueDate(calculatedDueDate);
    } else if (setupMethod === 'ivf' && ivfTransferInput) {
      // IVF due date: transfer date + (280 - embryo age at transfer - 14 days for ovulation)
      // Simplified: transfer date + (266 - embryo age)
      const transferDate = parseISO(ivfTransferInput);
      const daysToAdd = 266 - ivfEmbryoAge;
      const calculatedDueDate = addDays(transferDate, daysToAdd);
      onSetDueDate(calculatedDueDate);
    }
  };

  // ─── Setup screen ───
  if (!dueDate) {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-center space-y-4 border-dashed border-2 border-primary/30 bg-primary/5">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Baby className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Set up Pregnancy Tracking</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Enter your due date or last menstrual period to start tracking your pregnancy week by week.
          </p>

          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              variant={setupMethod === 'due_date' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSetupMethod('due_date')}
            >
              I know my due date
            </Button>
            <Button
              variant={setupMethod === 'lmp' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSetupMethod('lmp')}
            >
              From last period
            </Button>
            <Button
              variant={setupMethod === 'ivf' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSetupMethod('ivf')}
            >
              IVF transfer
            </Button>
          </div>

          {setupMethod === 'due_date' ? (
            <div className="space-y-2 max-w-xs mx-auto">
              <label className="text-sm font-medium">Due Date</label>
              <Input
                type="date"
                value={dueDateInput}
                onChange={(e) => setDueDateInput(e.target.value)}
              />
            </div>
          ) : setupMethod === 'lmp' ? (
            <div className="space-y-2 max-w-xs mx-auto">
              <label className="text-sm font-medium">First day of last period</label>
              <Input
                type="date"
                value={lmpInput}
                onChange={(e) => setLmpInput(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-3 max-w-xs mx-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium">Embryo transfer date</label>
                <Input
                  type="date"
                  value={ivfTransferInput}
                  onChange={(e) => setIvfTransferInput(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Embryo age at transfer</label>
                <div className="flex gap-2 justify-center">
                  <Button
                    variant={ivfEmbryoAge === 3 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIvfEmbryoAge(3)}
                  >
                    Day 3
                  </Button>
                  <Button
                    variant={ivfEmbryoAge === 5 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIvfEmbryoAge(5)}
                  >
                    Day 5 (Blastocyst)
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={handleSetDueDate}
            disabled={
              setupMethod === 'due_date' ? !dueDateInput :
              setupMethod === 'lmp' ? !lmpInput :
              !ivfTransferInput
            }
            className="w-full max-w-xs"
          >
            Start Tracking
          </Button>
        </Card>
      </div>
    );
  }

  if (!pregnancyInfo) return null;

  const { weeksPregnant, daysExtra, daysUntilDue, trimester, trimesterLabel, trimesterKey, progressPercent, weekData } = pregnancyInfo;
  const symptoms = PREGNANCY_SYMPTOMS[trimesterKey] || [];

  return (
    <div className="space-y-4">
      {/* Main pregnancy status */}
      <div className="bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 rounded-2xl p-5">
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">{weekData.sizeComparison}</div>
          <div className="text-4xl font-light text-foreground mb-1">
            Week {weeksPregnant}
            <span className="text-lg text-muted-foreground ml-1">+{daysExtra}d</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {trimesterLabel} Trimester
          </div>
          <Badge variant="secondary" className="mt-2">
            {daysUntilDue > 0 ? `${daysUntilDue} days until due date` : daysUntilDue === 0 ? 'Due today! 🎉' : `${Math.abs(daysUntilDue)} days past due date`}
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Week 1</span>
            <span>Week 40</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="text-center text-xs text-muted-foreground">
            {progressPercent}% complete
          </div>
        </div>
      </div>

      {/* Due date info */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Due Date</div>
              <div className="text-lg font-bold">{format(dueDate, 'MMMM d, yyyy')}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Baby development */}
      <Card className="p-4 space-y-3">
        <h4 className="font-semibold flex items-center gap-2">
          <Baby className="h-4 w-4 text-primary" />
          Baby at Week {weeksPregnant}
        </h4>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-muted/50 rounded-xl p-3">
            <Apple className="h-4 w-4 text-primary mx-auto mb-1" />
            <div className="text-xs text-muted-foreground">Size</div>
            <div className="text-sm font-semibold">{weekData.size}</div>
          </div>
          <div className="bg-muted/50 rounded-xl p-3">
            <Ruler className="h-4 w-4 text-secondary mx-auto mb-1" />
            <div className="text-xs text-muted-foreground">Length</div>
            <div className="text-sm font-semibold">{weekData.length}</div>
          </div>
          <div className="bg-muted/50 rounded-xl p-3">
            <Scale className="h-4 w-4 text-accent mx-auto mb-1" />
            <div className="text-xs text-muted-foreground">Weight</div>
            <div className="text-sm font-semibold">{weekData.weight}</div>
          </div>
        </div>

        <div className="space-y-2">
          <h5 className="text-sm font-medium text-muted-foreground">Key Developments</h5>
          {weekData.developments.map((dev, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
              <span>{dev}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <h5 className="text-sm font-medium text-muted-foreground">Tips This Week</h5>
          {weekData.tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Heart className="h-3.5 w-3.5 text-secondary mt-0.5 flex-shrink-0" />
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Trimester symptoms */}
      <Card className="p-4 space-y-3">
        <h4 className="font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Common {trimesterLabel} Trimester Symptoms
        </h4>
        <div className="grid grid-cols-3 gap-2">
          {symptoms.map((symptom) => (
            <div
              key={symptom.label}
              className="flex flex-col items-center gap-1 p-3 rounded-xl bg-muted/50 text-center"
            >
              <span className="text-2xl">{symptom.icon}</span>
              <span className="text-xs font-medium">{symptom.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Milestones timeline */}
      <Card className="p-4 space-y-3">
        <h4 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Upcoming Milestones
        </h4>
        <div className="space-y-3">
          {getMilestones(weeksPregnant).map((milestone, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 p-3 rounded-xl border",
                milestone.passed ? "bg-muted/30 opacity-60" : "bg-card"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold",
                milestone.passed ? "bg-primary/20 text-primary" : "bg-primary text-primary-foreground"
              )}>
                {milestone.week}
              </div>
              <div>
                <div className="text-sm font-medium">{milestone.title}</div>
                <div className="text-xs text-muted-foreground">{milestone.description}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

function getMilestones(currentWeek: number) {
  const allMilestones = [
    { week: 8, title: 'First Prenatal Visit', description: 'Blood tests, medical history, and first ultrasound' },
    { week: 12, title: 'End of First Trimester', description: 'Risk of miscarriage drops significantly' },
    { week: 13, title: 'Nuchal Translucency Scan', description: 'Screening for chromosomal conditions' },
    { week: 16, title: 'First Kicks', description: 'You may start feeling baby move (quickening)' },
    { week: 20, title: 'Anatomy Scan', description: 'Detailed ultrasound to check baby\'s development' },
    { week: 24, title: 'Viability Milestone', description: 'Baby could survive outside the womb with medical help' },
    { week: 26, title: 'Glucose Test', description: 'Screening for gestational diabetes' },
    { week: 28, title: 'Third Trimester Begins', description: 'Final stretch! More frequent appointments' },
    { week: 32, title: 'Hospital Bag', description: 'Good time to pack your hospital bag' },
    { week: 36, title: 'Weekly Check-ups', description: 'Baby may drop into position' },
    { week: 37, title: 'Full Term', description: 'Baby is considered early term' },
    { week: 40, title: 'Due Date', description: 'Baby is ready to meet you! 🎉' },
  ];

  // Show past 1 + next 4 milestones
  const upcomingIdx = allMilestones.findIndex(m => m.week > currentWeek);
  const startIdx = Math.max(0, (upcomingIdx === -1 ? allMilestones.length : upcomingIdx) - 1);
  const slice = allMilestones.slice(startIdx, startIdx + 5);

  return slice.map(m => ({ ...m, passed: m.week <= currentWeek }));
}

export default PregnancyTracker;
