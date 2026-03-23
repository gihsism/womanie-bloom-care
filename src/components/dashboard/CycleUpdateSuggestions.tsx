import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarSync, Check, X, RefreshCw, Baby, Egg, AlertCircle } from 'lucide-react';

interface LabResult {
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  date_recorded: string | null;
}

interface CycleUpdateSuggestionsProps {
  labResults: LabResult[];
  lifeStage?: string | null;
  onUpdateCycle?: (suggestion: CycleSuggestion) => void;
}

export interface CycleSuggestion {
  id: string;
  type: 'ovulation_confirmed' | 'phase_update' | 'cycle_length_adjust' | 'pregnancy_detected' | 'menopause_indicator' | 'irregularity_flag';
  title: string;
  emoji: string;
  description: string;
  actionLabel: string;
  detail: string;
  confidence: 'low' | 'medium' | 'high';
  priority: number; // lower = higher priority
}

function getHormone(labs: LabResult[], names: string[]): { value: number; date: string | null } | null {
  for (const name of names) {
    const match = labs.find(
      l => l.title.toLowerCase().includes(name.toLowerCase()) && l.value && !isNaN(parseFloat(l.value))
    );
    if (match) return { value: parseFloat(match.value!), date: match.date_recorded };
  }
  return null;
}

function generateSuggestions(labs: LabResult[], lifeStage?: string | null): CycleSuggestion[] {
  const suggestions: CycleSuggestion[] = [];

  const progesterone = getHormone(labs, ['Progesterone']);
  const estradiol = getHormone(labs, ['Estradiol', 'E2', 'Oestradiol']);
  const lh = getHormone(labs, ['LH', 'Luteinizing Hormone']);
  const fsh = getHormone(labs, ['FSH', 'Follicle Stimulating Hormone']);
  const hcg = getHormone(labs, ['HCG', 'hCG', 'Beta-HCG', 'Beta HCG']);
  const tsh = getHormone(labs, ['TSH']);
  const amh = getHormone(labs, ['AMH', 'Anti-Mullerian Hormone']);

  // Ovulation confirmation via progesterone
  if (progesterone && progesterone.value > 5) {
    const testDate = progesterone.date;
    suggestions.push({
      id: 'ovulation_progesterone',
      type: 'ovulation_confirmed',
      title: 'Ovulation confirmed by progesterone',
      emoji: '🥚',
      description: `Your progesterone level (${progesterone.value} ${labs.find(l => l.title.toLowerCase().includes('progesterone'))?.unit || 'ng/mL'}) confirms that ovulation occurred${testDate ? ` around the time of your test` : ''}.`,
      actionLabel: 'Mark ovulation in calendar',
      detail: testDate
        ? `Ovulation likely happened 5-7 days before your blood test${testDate ? ` on ${new Date(testDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}` : ''}. Would you like to update your calendar?`
        : 'Your elevated progesterone confirms a recent ovulation. Mark it in your cycle tracker for better future predictions.',
      confidence: progesterone.value > 10 ? 'high' : 'medium',
      priority: 1,
    });
  }

  // LH surge detection
  if (lh && lh.value > 20 && (!progesterone || progesterone.value < 2)) {
    suggestions.push({
      id: 'lh_surge',
      type: 'ovulation_confirmed',
      title: 'LH surge detected — ovulation approaching',
      emoji: '⚡',
      description: `Your LH level (${lh.value}) is elevated, indicating an LH surge. Ovulation typically occurs within 24-48 hours of an LH surge.`,
      actionLabel: 'Mark fertile window',
      detail: 'This is your most fertile time. If you\'re trying to conceive, the next 24-48 hours are optimal. Would you like to mark this as your fertile window?',
      confidence: lh.value > 40 ? 'high' : 'medium',
      priority: 0,
    });
  }

  // Pregnancy detection via HCG
  if (hcg && hcg.value > 1000) {
    suggestions.push({
      id: 'pregnancy_hcg',
      type: 'pregnancy_detected',
      title: 'Pregnancy confirmed',
      emoji: '🤰',
      description: `Your HCG level (${hcg.value} ${labs.find(l => l.title.toLowerCase().includes('hcg'))?.unit || 'mIU/mL'}) confirms pregnancy.`,
      actionLabel: 'Switch to pregnancy mode',
      detail: 'Would you like to switch your app to pregnancy tracking mode? This will update your dashboard with pregnancy milestones, baby development info, and prenatal care reminders.',
      confidence: 'high',
      priority: 0,
    });
  } else if (hcg && hcg.value > 5) {
    suggestions.push({
      id: 'pregnancy_hcg_early',
      type: 'irregularity_flag',
      title: 'Possible early pregnancy',
      emoji: '🤰',
      description: `Your HCG level (${hcg.value} ${labs.find(l => l.title.toLowerCase().includes('hcg'))?.unit || 'mIU/mL'}) suggests early pregnancy.`,
      actionLabel: 'Monitor & retest',
      detail: 'A mildly elevated HCG may indicate very early pregnancy. A repeat test in 48-72 hours can confirm if levels are doubling (a healthy sign).',
      confidence: 'low',
      priority: 1,
    });
  }

  // Menopause indicators
  if (fsh && fsh.value > 25 && lifeStage !== 'menopause' && lifeStage !== 'post-menopause' && lifeStage !== 'pregnancy') {
    const hasLowEstradiol = estradiol && estradiol.value < 30;
    suggestions.push({
      id: 'menopause_fsh',
      type: 'menopause_indicator',
      title: 'Hormone levels suggest perimenopause',
      emoji: '🌙',
      description: `Your FSH (${fsh.value}) is elevated${hasLowEstradiol ? ' and estradiol is low' : ''}, which can indicate perimenopause or menopause transition.`,
      actionLabel: 'Consider switching to menopause mode',
      detail: 'If you\'ve been experiencing irregular periods, hot flashes, or sleep changes, your hormone levels support a perimenopausal transition. Switching to menopause mode will give you symptom tracking and relevant health tips.',
      confidence: hasLowEstradiol ? 'high' : 'medium',
      priority: 2,
    });
  }

  // Thyroid affecting cycle length
  if (tsh && (tsh.value > 4.5 || tsh.value < 0.4)) {
    suggestions.push({
      id: 'thyroid_cycle',
      type: 'cycle_length_adjust',
      title: 'Thyroid may be affecting your cycle length',
      emoji: '🦋',
      description: tsh.value > 4.5
        ? 'Hypothyroidism can make cycles longer and heavier. Your predictions may be less accurate until thyroid is treated.'
        : 'Hyperthyroidism can make cycles shorter and lighter. Your predictions may be less accurate until thyroid is treated.',
      actionLabel: 'Adjust prediction confidence',
      detail: tsh.value > 4.5
        ? 'Consider adding a few extra days to your expected cycle length until thyroid treatment normalizes your levels. We\'ll lower prediction confidence automatically.'
        : 'Your cycles may be shorter than usual. We\'ll adjust prediction confidence until your thyroid levels normalize.',
      confidence: 'medium',
      priority: 3,
    });
  }

  // Low AMH flag for fertility planning
  if (amh && amh.value < 1 && (lifeStage === 'conception' || lifeStage === 'ivf' || lifeStage === 'menstrual-cycle')) {
    suggestions.push({
      id: 'amh_fertility',
      type: 'irregularity_flag',
      title: 'Low ovarian reserve — consider fertility timeline',
      emoji: '⏳',
      description: `Your AMH (${amh.value} ${labs.find(l => l.title.toLowerCase().includes('amh'))?.unit || 'ng/mL'}) indicates a lower egg reserve than average.`,
      actionLabel: 'Add fertility tracking',
      detail: 'If you\'re planning to conceive, time may be an important factor. Consider discussing egg freezing or accelerated timelines with a fertility specialist. Enhanced fertility tracking can help optimize your chances.',
      confidence: amh.value < 0.5 ? 'high' : 'medium',
      priority: 1,
    });
  }

  return suggestions.sort((a, b) => a.priority - b.priority);
}

const typeIcons: Record<CycleSuggestion['type'], typeof Egg> = {
  ovulation_confirmed: Egg,
  phase_update: RefreshCw,
  cycle_length_adjust: RefreshCw,
  pregnancy_detected: Baby,
  menopause_indicator: AlertCircle,
  irregularity_flag: AlertCircle,
};

export default function CycleUpdateSuggestions({ labResults, lifeStage, onUpdateCycle }: CycleUpdateSuggestionsProps) {
  const suggestions = useMemo(() => generateSuggestions(labResults, lifeStage), [labResults, lifeStage]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  const activeSuggestions = suggestions.filter(s => !dismissed.has(s.id));

  if (activeSuggestions.length === 0) return null;

  const handleAccept = (suggestion: CycleSuggestion) => {
    setAccepted(prev => new Set(prev).add(suggestion.id));
    onUpdateCycle?.(suggestion);
  };

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set(prev).add(id));
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold flex items-center gap-2">
        <CalendarSync className="h-4 w-4 text-primary" />
        Cycle Updates From Your Lab Results
      </h3>
      <p className="text-xs text-muted-foreground -mt-2">
        Your blood work can help us improve your cycle predictions.
      </p>

      <div className="space-y-3">
        {activeSuggestions.map(suggestion => {
          const Icon = typeIcons[suggestion.type];
          const isAccepted = accepted.has(suggestion.id);

          return (
            <Card key={suggestion.id} className={`overflow-hidden border ${
              isAccepted
                ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
                : suggestion.priority === 0
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border'
            }`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{suggestion.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="text-sm font-bold">{suggestion.title}</h4>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                        suggestion.confidence === 'high' ? 'text-green-600 border-green-300' :
                        suggestion.confidence === 'medium' ? 'text-blue-600 border-blue-300' :
                        'text-muted-foreground border-border'
                      }`}>
                        {suggestion.confidence} confidence
                      </Badge>
                    </div>

                    <p className="text-sm text-foreground/80 mb-2">{suggestion.description}</p>

                    <div className="bg-muted/30 rounded-lg px-3 py-2.5 border border-border/30 mb-3">
                      <p className="text-xs text-foreground/70 leading-relaxed">{suggestion.detail}</p>
                    </div>

                    {isAccepted ? (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <Check className="h-4 w-4" />
                        <span className="text-xs font-medium">Updated! Your cycle data has been adjusted.</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleAccept(suggestion)}
                          className="text-xs h-8"
                        >
                          <Icon className="h-3.5 w-3.5 mr-1.5" />
                          {suggestion.actionLabel}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDismiss(suggestion.id)}
                          className="text-xs h-8 text-muted-foreground"
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Dismiss
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
