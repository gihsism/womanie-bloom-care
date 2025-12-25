import { format } from 'date-fns';
import { Heart, AlertCircle, Smile, Droplet, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface DaySignal {
  date: string;
  symptoms: string[];
  intercourse: { protected: boolean; timestamp?: string }[];
  mood: string[];
  discharge: string;
  notes: string;
}

interface DailyLogSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  signal: DaySignal;
  onUpdateSignal: (updates: Partial<DaySignal>) => void;
  activeTab?: 'symptoms' | 'mood' | 'intimacy' | 'discharge';
}

const SYMPTOM_OPTIONS = [
  { value: 'cramps', label: 'Cramps', icon: '🤕' },
  { value: 'headache', label: 'Headache', icon: '🤯' },
  { value: 'bloating', label: 'Bloating', icon: '😖' },
  { value: 'tender_breasts', label: 'Tender Breasts', icon: '💢' },
  { value: 'back_pain', label: 'Back Pain', icon: '🔙' },
  { value: 'nausea', label: 'Nausea', icon: '🤢' },
  { value: 'fatigue', label: 'Fatigue', icon: '😴' },
  { value: 'acne', label: 'Acne', icon: '😣' },
];

const MOOD_OPTIONS = [
  { value: 'happy', label: 'Happy', icon: '😊' },
  { value: 'sad', label: 'Sad', icon: '😢' },
  { value: 'anxious', label: 'Anxious', icon: '😰' },
  { value: 'irritable', label: 'Irritable', icon: '😤' },
  { value: 'energetic', label: 'Energetic', icon: '⚡' },
  { value: 'calm', label: 'Calm', icon: '😌' },
];

const DISCHARGE_OPTIONS = [
  { value: 'none', label: 'None', description: 'No discharge' },
  { value: 'dry', label: 'Dry', description: 'Little to none' },
  { value: 'sticky', label: 'Sticky', description: 'Thick, tacky' },
  { value: 'creamy', label: 'Creamy', description: 'White, lotion-like' },
  { value: 'watery', label: 'Watery', description: 'Clear, wet' },
  { value: 'ewcm', label: 'Egg White', description: 'Stretchy, clear (fertile!)' },
];

const DailyLogSheet = ({
  open,
  onOpenChange,
  date,
  signal,
  onUpdateSignal,
  activeTab = 'symptoms'
}: DailyLogSheetProps) => {
  if (!date) return null;

  const toggleSymptom = (symptom: string) => {
    const newSymptoms = signal.symptoms.includes(symptom)
      ? signal.symptoms.filter(s => s !== symptom)
      : [...signal.symptoms, symptom];
    onUpdateSignal({ symptoms: newSymptoms });
  };

  const toggleMood = (mood: string) => {
    const newMoods = signal.mood.includes(mood)
      ? signal.mood.filter(m => m !== mood)
      : [...signal.mood, mood];
    onUpdateSignal({ mood: newMoods });
  };

  const addIntercourse = (isProtected: boolean) => {
    onUpdateSignal({
      intercourse: [...signal.intercourse, { protected: isProtected }]
    });
  };

  const removeIntercourse = (index: number) => {
    onUpdateSignal({
      intercourse: signal.intercourse.filter((_, i) => i !== index)
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <span className="text-xl">{format(date, 'EEEE, MMM d')}</span>
          </SheetTitle>
          <SheetDescription>
            Track how you're feeling today
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(80vh-120px)] pr-4">
          <div className="space-y-6 pb-8">
            {/* Symptoms Section */}
            <section className="space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Symptoms
              </h4>
              <div className="grid grid-cols-4 gap-2">
                {SYMPTOM_OPTIONS.map((symptom) => {
                  const isSelected = signal.symptoms.includes(symptom.value);
                  return (
                    <button
                      key={symptom.value}
                      onClick={() => toggleSymptom(symptom.value)}
                      className={cn(
                        "flex flex-col items-center gap-1 p-3 rounded-xl transition-all",
                        "border-2",
                        isSelected
                          ? "bg-destructive/10 border-destructive"
                          : "bg-muted/50 border-transparent hover:bg-muted"
                      )}
                    >
                      <span className="text-2xl">{symptom.icon}</span>
                      <span className="text-xs font-medium">{symptom.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Mood Section */}
            <section className="space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Smile className="h-4 w-4 text-yellow-500" />
                Mood
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {MOOD_OPTIONS.map((mood) => {
                  const isSelected = signal.mood.includes(mood.value);
                  return (
                    <button
                      key={mood.value}
                      onClick={() => toggleMood(mood.value)}
                      className={cn(
                        "flex flex-col items-center gap-1 p-3 rounded-xl transition-all",
                        "border-2",
                        isSelected
                          ? "bg-yellow-500/10 border-yellow-500"
                          : "bg-muted/50 border-transparent hover:bg-muted"
                      )}
                    >
                      <span className="text-2xl">{mood.icon}</span>
                      <span className="text-xs font-medium">{mood.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Intimacy Section */}
            <section className="space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Heart className="h-4 w-4 text-pink-500" />
                Intimacy
              </h4>
              
              {signal.intercourse.length > 0 && (
                <div className="space-y-2 mb-3">
                  {signal.intercourse.map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-pink-500/10 rounded-xl"
                    >
                      <div className="flex items-center gap-2">
                        <Heart className="h-4 w-4 text-pink-500" />
                        <span className="text-sm font-medium">
                          {entry.protected ? 'Protected' : 'Unprotected'}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeIntercourse(idx)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => addIntercourse(true)}
                  className="h-12 rounded-xl"
                >
                  <span className="text-lg mr-2">🛡️</span>
                  Protected
                </Button>
                <Button
                  variant="outline"
                  onClick={() => addIntercourse(false)}
                  className="h-12 rounded-xl"
                >
                  <span className="text-lg mr-2">⚠️</span>
                  Unprotected
                </Button>
              </div>
            </section>

            {/* Discharge Section */}
            <section className="space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Droplet className="h-4 w-4 text-blue-500" />
                Cervical Mucus
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {DISCHARGE_OPTIONS.map((option) => {
                  const isSelected = signal.discharge === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => onUpdateSignal({ discharge: option.value })}
                      className={cn(
                        "flex flex-col items-start p-3 rounded-xl transition-all text-left",
                        "border-2",
                        isSelected
                          ? "bg-blue-500/10 border-blue-500"
                          : "bg-muted/50 border-transparent hover:bg-muted"
                      )}
                    >
                      <span className="text-sm font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                      {option.value === 'ewcm' && (
                        <span className="text-xs text-secondary font-medium mt-1">Most fertile!</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </ScrollArea>

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full h-12 rounded-xl"
          >
            <Check className="h-4 w-4 mr-2" />
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DailyLogSheet;
