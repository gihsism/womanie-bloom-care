import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Moon,
  Sun,
  Flower2,
  Egg,
  Baby,
  Thermometer,
  HeartPulse,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

interface LabResult {
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  date_recorded: string | null;
}

interface CycleImpactProps {
  labResults: LabResult[];
  lifeStage?: string | null;
}

// Hormone reference ranges by cycle phase (typical ranges for reproductive-age women)
const HORMONE_PHASES = {
  follicular: {
    label: 'Follicular Phase',
    icon: Flower2,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800',
    description: 'Your body is preparing an egg for release. Energy typically rises during this phase.',
    estradiol: { low: 30, high: 120 },
    progesterone: { low: 0.1, high: 0.9 },
    fsh: { low: 3.5, high: 12.5 },
    lh: { low: 2.4, high: 12.6 },
  },
  ovulatory: {
    label: 'Ovulation Window',
    icon: Egg,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800',
    description: 'An egg is being released — this is your most fertile time.',
    estradiol: { low: 100, high: 400 },
    progesterone: { low: 0.1, high: 1.5 },
    fsh: { low: 4.7, high: 21.5 },
    lh: { low: 14, high: 95.6 },
  },
  luteal: {
    label: 'Luteal Phase',
    icon: Moon,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800',
    description: 'Your body is preparing for a possible pregnancy. PMS symptoms may appear.',
    estradiol: { low: 50, high: 250 },
    progesterone: { low: 1.8, high: 24 },
    fsh: { low: 1.5, high: 9 },
    lh: { low: 1, high: 11.4 },
  },
  menstrual: {
    label: 'Menstrual Phase',
    icon: Sun,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',
    description: 'Hormone levels are at their lowest. A new cycle is beginning.',
    estradiol: { low: 12, high: 50 },
    progesterone: { low: 0.1, high: 0.8 },
    fsh: { low: 3.5, high: 12.5 },
    lh: { low: 2, high: 15 },
  },
};

type PhaseKey = keyof typeof HORMONE_PHASES;

interface HormoneInsight {
  hormone: string;
  value: number;
  unit: string;
  meaning: string;
  impact: string;
  severity: 'info' | 'good' | 'caution' | 'warning';
}

function getLatestHormone(labResults: LabResult[], names: string[]): { value: number; unit: string; raw: LabResult } | null {
  for (const name of names) {
    const match = labResults.find(
      l => l.title.toLowerCase().includes(name.toLowerCase()) && l.value && !isNaN(parseFloat(l.value))
    );
    if (match) {
      return { value: parseFloat(match.value!), unit: match.unit || '', raw: match };
    }
  }
  return null;
}

function detectPhase(hormones: {
  estradiol?: number;
  progesterone?: number;
  fsh?: number;
  lh?: number;
}): { phase: PhaseKey; confidence: 'low' | 'medium' | 'high'; reasoning: string } {
  const { estradiol, progesterone, fsh, lh } = hormones;
  const scores: Record<PhaseKey, number> = { follicular: 0, ovulatory: 0, luteal: 0, menstrual: 0 };
  let totalChecks = 0;

  const check = (val: number | undefined, phaseRanges: Record<PhaseKey, { low: number; high: number }>, key: string) => {
    if (val === undefined) return;
    totalChecks++;
    for (const [phase, range] of Object.entries(phaseRanges) as [PhaseKey, { low: number; high: number }][]) {
      if (val >= range.low && val <= range.high) {
        scores[phase] += 1;
      } else {
        // Partial credit for being close
        const mid = (range.low + range.high) / 2;
        const span = range.high - range.low;
        const dist = Math.abs(val - mid) / span;
        if (dist < 1) scores[phase] += 0.3;
      }
    }
  };

  check(estradiol, {
    follicular: HORMONE_PHASES.follicular.estradiol,
    ovulatory: HORMONE_PHASES.ovulatory.estradiol,
    luteal: HORMONE_PHASES.luteal.estradiol,
    menstrual: HORMONE_PHASES.menstrual.estradiol,
  }, 'estradiol');

  check(progesterone, {
    follicular: HORMONE_PHASES.follicular.progesterone,
    ovulatory: HORMONE_PHASES.ovulatory.progesterone,
    luteal: HORMONE_PHASES.luteal.progesterone,
    menstrual: HORMONE_PHASES.menstrual.progesterone,
  }, 'progesterone');

  check(fsh, {
    follicular: HORMONE_PHASES.follicular.fsh,
    ovulatory: HORMONE_PHASES.ovulatory.fsh,
    luteal: HORMONE_PHASES.luteal.fsh,
    menstrual: HORMONE_PHASES.menstrual.fsh,
  }, 'fsh');

  check(lh, {
    follicular: HORMONE_PHASES.follicular.lh,
    ovulatory: HORMONE_PHASES.ovulatory.lh,
    luteal: HORMONE_PHASES.luteal.lh,
    menstrual: HORMONE_PHASES.menstrual.lh,
  }, 'lh');

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]) as [PhaseKey, number][];
  const bestPhase = sorted[0][0];
  const bestScore = sorted[0][1];
  const secondScore = sorted[1]?.[1] ?? 0;

  const confidence: 'low' | 'medium' | 'high' =
    totalChecks === 0 ? 'low' :
    totalChecks === 1 ? 'low' :
    bestScore - secondScore > 0.8 ? 'high' : 'medium';

  const hormoneList = [
    estradiol !== undefined && 'estradiol',
    progesterone !== undefined && 'progesterone',
    fsh !== undefined && 'FSH',
    lh !== undefined && 'LH',
  ].filter(Boolean).join(', ');

  const reasoning = `Based on your ${hormoneList} levels`;

  return { phase: bestPhase, confidence, reasoning };
}

function generateHormoneInsights(labResults: LabResult[], lifeStage?: string | null): HormoneInsight[] {
  const insights: HormoneInsight[] = [];

  const progesterone = getLatestHormone(labResults, ['Progesterone']);
  const estradiol = getLatestHormone(labResults, ['Estradiol', 'E2', 'Oestradiol']);
  const fsh = getLatestHormone(labResults, ['FSH', 'Follicle Stimulating Hormone']);
  const lh = getLatestHormone(labResults, ['LH', 'Luteinizing Hormone']);
  const hcg = getLatestHormone(labResults, ['HCG', 'hCG', 'Beta-HCG', 'Beta HCG']);
  const tsh = getLatestHormone(labResults, ['TSH', 'Thyroid Stimulating Hormone']);
  const amh = getLatestHormone(labResults, ['AMH', 'Anti-Mullerian Hormone', 'Anti-Müllerian']);
  const prolactin = getLatestHormone(labResults, ['Prolactin', 'PRL']);
  const testosterone = getLatestHormone(labResults, ['Testosterone', 'Free Testosterone']);

  // Progesterone insights
  if (progesterone) {
    if (progesterone.value > 10) {
      insights.push({
        hormone: 'Progesterone',
        value: progesterone.value,
        unit: progesterone.unit,
        meaning: 'Your progesterone is elevated, which strongly suggests ovulation has occurred.',
        impact: 'You are likely in your luteal phase. If you\'re trying to conceive, this is a good sign that your body released an egg.',
        severity: 'good',
      });
    } else if (progesterone.value > 1.5) {
      insights.push({
        hormone: 'Progesterone',
        value: progesterone.value,
        unit: progesterone.unit,
        meaning: 'Your progesterone is mildly elevated.',
        impact: 'This may indicate early luteal phase or that ovulation is approaching. Track your symptoms for a clearer picture.',
        severity: 'info',
      });
    } else if (progesterone.value < 0.5) {
      insights.push({
        hormone: 'Progesterone',
        value: progesterone.value,
        unit: progesterone.unit,
        meaning: 'Your progesterone is very low.',
        impact: 'This is normal during the follicular phase or menstruation. If you expected to have ovulated, discuss this with your doctor.',
        severity: 'info',
      });
    }
  }

  // Estradiol insights
  if (estradiol) {
    if (estradiol.value > 200) {
      insights.push({
        hormone: 'Estradiol',
        value: estradiol.value,
        unit: estradiol.unit,
        meaning: 'Your estrogen is high, which often happens around ovulation or mid-luteal phase.',
        impact: 'High estradiol can cause breast tenderness and mood changes. If you\'re tracking fertility, a follicle may be mature.',
        severity: 'info',
      });
    } else if (estradiol.value < 30) {
      insights.push({
        hormone: 'Estradiol',
        value: estradiol.value,
        unit: estradiol.unit,
        meaning: 'Your estrogen is low.',
        impact: lifeStage === 'menopause' || lifeStage === 'post-menopause'
          ? 'This is expected during menopause. Low estrogen can cause hot flashes, vaginal dryness, and bone density changes.'
          : 'Low estrogen during reproductive years may affect your cycle regularity and bone health. Worth discussing with your doctor.',
        severity: lifeStage === 'menopause' || lifeStage === 'post-menopause' ? 'info' : 'caution',
      });
    }
  }

  // FSH insights
  if (fsh) {
    if (fsh.value > 25) {
      insights.push({
        hormone: 'FSH',
        value: fsh.value,
        unit: fsh.unit,
        meaning: 'Your FSH is elevated.',
        impact: lifeStage === 'menopause' || lifeStage === 'post-menopause'
          ? 'Elevated FSH is expected during menopause as your ovaries produce less estrogen.'
          : 'High FSH in reproductive years may indicate diminished ovarian reserve. This is important to discuss with a fertility specialist.',
        severity: lifeStage === 'menopause' || lifeStage === 'post-menopause' ? 'info' : 'warning',
      });
    }
  }

  // LH/FSH ratio (PCOS indicator)
  if (lh && fsh && fsh.value > 0) {
    const ratio = lh.value / fsh.value;
    if (ratio > 2) {
      insights.push({
        hormone: 'LH/FSH Ratio',
        value: Math.round(ratio * 10) / 10,
        unit: ':1',
        meaning: 'Your LH is significantly higher than your FSH.',
        impact: 'A high LH-to-FSH ratio can be associated with PCOS. If you have irregular periods, acne, or excess hair growth, mention this ratio to your doctor.',
        severity: 'caution',
      });
    }
  }

  // HCG
  if (hcg) {
    if (hcg.value > 5) {
      insights.push({
        hormone: 'HCG',
        value: hcg.value,
        unit: hcg.unit,
        meaning: 'Your HCG is elevated — this is the pregnancy hormone.',
        impact: hcg.value > 1000
          ? 'This level strongly suggests pregnancy. Please see your doctor to confirm and begin prenatal care.'
          : 'A mildly elevated HCG may indicate early pregnancy. A repeat test in 48-72 hours can confirm if levels are rising.',
        severity: 'warning',
      });
    }
  }

  // TSH and cycle impact
  if (tsh) {
    if (tsh.value > 4.5) {
      insights.push({
        hormone: 'TSH',
        value: tsh.value,
        unit: tsh.unit,
        meaning: 'Your thyroid appears underactive (hypothyroidism).',
        impact: 'An underactive thyroid can cause heavier periods, longer cycles, fatigue, and difficulty conceiving. Treatment can restore normal cycles.',
        severity: 'caution',
      });
    } else if (tsh.value < 0.4) {
      insights.push({
        hormone: 'TSH',
        value: tsh.value,
        unit: tsh.unit,
        meaning: 'Your thyroid appears overactive (hyperthyroidism).',
        impact: 'An overactive thyroid can cause lighter or missed periods, shorter cycles, and weight loss. This needs medical attention.',
        severity: 'caution',
      });
    } else {
      insights.push({
        hormone: 'TSH',
        value: tsh.value,
        unit: tsh.unit,
        meaning: 'Your thyroid function looks healthy.',
        impact: 'A healthy thyroid supports regular menstrual cycles and overall hormonal balance.',
        severity: 'good',
      });
    }
  }

  // AMH (ovarian reserve)
  if (amh) {
    if (amh.value < 1) {
      insights.push({
        hormone: 'AMH',
        value: amh.value,
        unit: amh.unit,
        meaning: 'Your AMH is low, which relates to your ovarian reserve (egg supply).',
        impact: 'A lower AMH may mean fewer eggs remaining. If you\'re planning a family, consider discussing timeline and options with a fertility specialist.',
        severity: 'caution',
      });
    } else if (amh.value > 5) {
      insights.push({
        hormone: 'AMH',
        value: amh.value,
        unit: amh.unit,
        meaning: 'Your AMH is elevated, suggesting a high ovarian reserve.',
        impact: 'Very high AMH can be associated with PCOS. It also suggests good fertility potential if you\'re planning to conceive.',
        severity: 'info',
      });
    } else {
      insights.push({
        hormone: 'AMH',
        value: amh.value,
        unit: amh.unit,
        meaning: 'Your AMH is in a healthy range for your age.',
        impact: 'This suggests a good egg supply. Your ovarian reserve looks healthy.',
        severity: 'good',
      });
    }
  }

  // Prolactin
  if (prolactin) {
    if (prolactin.value > 25) {
      insights.push({
        hormone: 'Prolactin',
        value: prolactin.value,
        unit: prolactin.unit,
        meaning: 'Your prolactin is elevated.',
        impact: 'High prolactin can suppress ovulation, causing irregular or missed periods. Stress, certain medications, or a small pituitary gland issue could be the cause.',
        severity: 'caution',
      });
    }
  }

  // Testosterone
  if (testosterone) {
    if (testosterone.value > 70) {
      insights.push({
        hormone: 'Testosterone',
        value: testosterone.value,
        unit: testosterone.unit,
        meaning: 'Your testosterone is higher than typical for women.',
        impact: 'Elevated testosterone can cause acne, excess hair growth, and irregular cycles. This is commonly seen in PCOS.',
        severity: 'caution',
      });
    }
  }

  return insights;
}

const severityConfig = {
  good: { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-400', icon: '✅' },
  info: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-400', icon: 'ℹ️' },
  caution: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400', icon: '⚠️' },
  warning: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-400', icon: '🔴' },
};

export default function CycleImpactSection({ labResults, lifeStage }: CycleImpactProps) {
  const hormoneData = useMemo(() => {
    const estradiol = getLatestHormone(labResults, ['Estradiol', 'E2', 'Oestradiol']);
    const progesterone = getLatestHormone(labResults, ['Progesterone']);
    const fsh = getLatestHormone(labResults, ['FSH', 'Follicle Stimulating Hormone']);
    const lh = getLatestHormone(labResults, ['LH', 'Luteinizing Hormone']);

    const hasAnyHormone = estradiol || progesterone || fsh || lh;
    if (!hasAnyHormone) return null;

    const phase = detectPhase({
      estradiol: estradiol?.value,
      progesterone: progesterone?.value,
      fsh: fsh?.value,
      lh: lh?.value,
    });

    const insights = generateHormoneInsights(labResults, lifeStage);

    return { phase, insights, hormones: { estradiol, progesterone, fsh, lh } };
  }, [labResults, lifeStage]);

  if (!hormoneData) return null;

  const { phase, insights } = hormoneData;
  const phaseInfo = HORMONE_PHASES[phase.phase];
  const PhaseIcon = phaseInfo.icon;

  const showPhaseDetection = lifeStage !== 'pregnancy' && lifeStage !== 'menopause' && lifeStage !== 'post-menopause';

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold flex items-center gap-2">
        <HeartPulse className="h-4 w-4 text-primary" />
        What Your Hormones Mean for Your Cycle
      </h3>

      {/* Phase detection card */}
      {showPhaseDetection && (
        <Card className={`overflow-hidden border ${phaseInfo.bgColor}`}>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-white/60 dark:bg-white/10 flex-shrink-0`}>
                <PhaseIcon className={`h-6 w-6 ${phaseInfo.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h4 className={`text-base font-bold ${phaseInfo.color}`}>{phaseInfo.label}</h4>
                  <Badge variant="outline" className={`text-[10px] ${phaseInfo.color} border-current/20`}>
                    {phase.confidence} confidence
                  </Badge>
                </div>
                <p className="text-sm text-foreground/80 mb-2">{phaseInfo.description}</p>
                <p className="text-xs text-muted-foreground">{phase.reasoning}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual hormone insights */}
      {insights.length > 0 && (
        <div className="space-y-2.5">
          {insights.map((insight, idx) => {
            const config = severityConfig[insight.severity];
            return (
              <div key={idx} className={`rounded-xl p-4 border ${config.bg} ${config.border}`}>
                <div className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{config.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold">{insight.hormone}</span>
                      <span className={`text-xs font-mono font-bold ${config.text}`}>
                        {insight.value} {insight.unit}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 mb-1">{insight.meaning}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{insight.impact}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground italic px-1">
        These insights are based on your lab results and general medical knowledge. They are not a diagnosis — always discuss hormone results with your doctor.
      </p>
    </div>
  );
}
