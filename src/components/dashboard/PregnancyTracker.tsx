import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import BabyImage3DOverlay from './BabyImage3DOverlay';

// Baby development illustrations
import babyWeek04 from '@/assets/baby-week-04.png';
import babyWeek07 from '@/assets/baby-week-07.png';
import babyWeek12 from '@/assets/baby-week-12.png';
import babyWeek13 from '@/assets/baby-week-13.png';
import babyWeek16 from '@/assets/baby-week-16.png';
import babyWeek20 from '@/assets/baby-week-20.png';
import babyWeek24 from '@/assets/baby-week-24.png';
import babyWeek28 from '@/assets/baby-week-28.png';
import babyWeek32 from '@/assets/baby-week-32.png';
import babyWeek36 from '@/assets/baby-week-36.png';
import babyWeek40 from '@/assets/baby-week-40.png';

// Fruit size comparison illustrations
import fruitWeek04 from '@/assets/fruit-week-04.png';
import fruitWeek07 from '@/assets/fruit-week-07.png';
import fruitWeek09 from '@/assets/fruit-week-09.png';
import fruitWeek12 from '@/assets/fruit-week-12.png';
import fruitWeek16 from '@/assets/fruit-week-16.png';
import fruitWeek20 from '@/assets/fruit-week-20.png';
import fruitWeek24 from '@/assets/fruit-week-24.png';
import fruitWeek28 from '@/assets/fruit-week-28.png';
import fruitWeek32 from '@/assets/fruit-week-32.png';
import fruitWeek36 from '@/assets/fruit-week-36.png';
import fruitWeek40 from '@/assets/fruit-week-40.png';
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
  Pencil,
  RotateCcw,
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

const WEEK_IMAGES: Record<number, string> = {
  4: babyWeek04, 5: babyWeek04, 6: babyWeek04,
  7: babyWeek07, 8: babyWeek07, 9: babyWeek07, 10: babyWeek07, 11: babyWeek07,
  12: babyWeek12, 13: babyWeek13, 14: babyWeek16, 15: babyWeek16,
  16: babyWeek16, 17: babyWeek16, 18: babyWeek16, 19: babyWeek20,
  20: babyWeek20, 21: babyWeek20, 22: babyWeek24, 23: babyWeek24,
  24: babyWeek24, 25: babyWeek24, 26: babyWeek28, 27: babyWeek28,
  28: babyWeek28, 29: babyWeek28, 30: babyWeek28, 31: babyWeek32,
  32: babyWeek32, 33: babyWeek32, 34: babyWeek32, 35: babyWeek36,
  36: babyWeek36, 37: babyWeek36, 38: babyWeek36, 39: babyWeek36,
  40: babyWeek40,
};

const getWeekImage = (week: number): string => {
  if (week <= 3) return babyWeek04;
  if (week >= 40) return babyWeek40;
  return WEEK_IMAGES[week] || babyWeek36;
};

// Fruit size comparison images for the top status card
const FRUIT_IMAGES: Record<number, string> = {
  4: fruitWeek04, 5: fruitWeek04, 6: fruitWeek04,
  7: fruitWeek07, 8: fruitWeek07,
  9: fruitWeek09, 10: fruitWeek09, 11: fruitWeek09,
  12: fruitWeek12, 13: fruitWeek12, 14: fruitWeek12, 15: fruitWeek12,
  16: fruitWeek16, 17: fruitWeek16, 18: fruitWeek16, 19: fruitWeek16,
  20: fruitWeek20, 21: fruitWeek20, 22: fruitWeek20, 23: fruitWeek20,
  24: fruitWeek24, 25: fruitWeek24, 26: fruitWeek24, 27: fruitWeek24,
  28: fruitWeek28, 29: fruitWeek28, 30: fruitWeek28, 31: fruitWeek28,
  32: fruitWeek32, 33: fruitWeek32, 34: fruitWeek32, 35: fruitWeek32,
  36: fruitWeek36, 37: fruitWeek36, 38: fruitWeek36, 39: fruitWeek36,
  40: fruitWeek40,
};

const getFruitImage = (week: number): string => {
  if (week <= 3) return fruitWeek04;
  if (week >= 40) return fruitWeek40;
  return FRUIT_IMAGES[week] || fruitWeek36;
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
  onResetPregnancy?: () => void;
}

const PregnancyTracker = ({ dueDate, onSetDueDate, onResetPregnancy }: PregnancyTrackerProps) => {
  const [showFullImage, setShowFullImage] = useState(false);
  const [dueDateInput, setDueDateInput] = useState('');
  const [lmpInput, setLmpInput] = useState('');
  const [setupMethod, setSetupMethod] = useState<'due_date' | 'lmp' | 'ivf'>('due_date');
  const [ivfTransferInput, setIvfTransferInput] = useState('');
  const [ivfEmbryoAge, setIvfEmbryoAge] = useState<3 | 5>(5);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDueDateInput, setEditDueDateInput] = useState('');
  const [editWeekInput, setEditWeekInput] = useState('');
  const [editMethod, setEditMethod] = useState<'due_date' | 'week'>('due_date');

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
          <img src={getFruitImage(weeksPregnant)} alt={`Size of a ${weekData.size}`} className="w-24 h-24 mx-auto mb-2 object-contain" />
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

      {/* Due date info + edit */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Due Date</div>
              <div className="text-lg font-bold">{format(dueDate, 'MMMM d, yyyy')}</div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              setEditDueDateInput(format(dueDate, 'yyyy-MM-dd'));
              setEditWeekInput(String(weeksPregnant));
              setEditMethod('due_date');
              setEditDialogOpen(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </Card>

      {/* Edit Pregnancy Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Pregnancy Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button
                variant={editMethod === 'due_date' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setEditMethod('due_date')}
              >
                Change Due Date
              </Button>
              <Button
                variant={editMethod === 'week' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setEditMethod('week')}
              >
                Set by Week
              </Button>
            </div>

            {editMethod === 'due_date' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">New Due Date</label>
                <Input
                  type="date"
                  value={editDueDateInput}
                  onChange={(e) => setEditDueDateInput(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Current Week of Pregnancy (1-42)</label>
                <Input
                  type="number"
                  min="1"
                  max="42"
                  value={editWeekInput}
                  onChange={(e) => setEditWeekInput(e.target.value)}
                  placeholder="e.g. 20"
                />
                <p className="text-xs text-muted-foreground">
                  Due date will be calculated automatically.
                </p>
              </div>
            )}

            {onResetPregnancy && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => {
                  onResetPregnancy();
                  setEditDialogOpen(false);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                End / Reset Pregnancy Tracking
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editMethod === 'due_date' && editDueDateInput) {
                  onSetDueDate(parseISO(editDueDateInput));
                } else if (editMethod === 'week' && editWeekInput) {
                  const week = Math.max(1, Math.min(42, Number(editWeekInput)));
                  const newDueDate = addDays(new Date(), (40 - week) * 7);
                  onSetDueDate(newDueDate);
                }
                setEditDialogOpen(false);
              }}
              disabled={editMethod === 'due_date' ? !editDueDateInput : !editWeekInput}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Baby development */}
      <Card className="p-4 space-y-3">
        <h4 className="font-semibold flex items-center gap-2">
          <Baby className="h-4 w-4 text-primary" />
          Baby at Week {weeksPregnant}
        </h4>
        
        <div className="flex items-center gap-4 bg-muted/30 rounded-xl p-4">
          <img
            src={getWeekImage(weeksPregnant)}
            alt="Baby development"
            className="w-20 h-20 object-contain flex-shrink-0 cursor-pointer hover:scale-105 transition-transform rounded-lg"
            onClick={() => setShowFullImage(true)}
          />
          <div>
            <div className="text-lg font-semibold">Your baby at week {weeksPregnant}</div>
            <div className="flex items-center gap-2 mt-1">
              <img src={getFruitImage(weeksPregnant)} alt={weekData.size} className="w-6 h-6 object-contain" />
              <span className="text-sm text-muted-foreground">Size of a {weekData.size}</span>
            </div>
            <div className="text-sm text-muted-foreground">{weekData.length} · {weekData.weight}</div>
          </div>
        </div>

        {/* Full-size 3D image overlay */}
        {showFullImage && (
          <BabyImage3DOverlay
            src={getWeekImage(weeksPregnant)}
            week={weeksPregnant}
            onClose={() => setShowFullImage(false)}
          />
        )}

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
