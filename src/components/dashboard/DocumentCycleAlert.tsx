import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Baby, Flame, HeartPulse } from 'lucide-react';
import { lifeStageLabel } from '@/lib/lifeStageLabels';
import { labNumber } from '@/lib/labValue';

interface LabResult {
  title: string;
  value: string | null;
  status: string | null;
  data_type: string;
}

interface DocumentCycleAlertProps {
  medicalData: LabResult[];
  lifeStage: string | null;
  onSwitchMode: (mode: string) => void;
}

function getVal(data: LabResult[], names: string[]): number | null {
  for (const name of names) {
    const match = data.find(d =>
      d.data_type === 'lab_result' && d.title.toLowerCase().includes(name.toLowerCase()) && d.value && labNumber(d.value) !== null
    );
    if (match) return (labNumber(match.value) as number);
  }
  return null;
}

export default function DocumentCycleAlert({ medicalData, lifeStage, onSwitchMode }: DocumentCycleAlertProps) {
  const alert = useMemo(() => {
    const hcg = getVal(medicalData, ['HCG', 'hCG', 'Beta-HCG', 'Beta HCG']);
    const fsh = getVal(medicalData, ['FSH']);
    const estradiol = getVal(medicalData, ['Estradiol', 'E2']);
    const progesterone = getVal(medicalData, ['Progesterone']);

    // Detect pregnancy from documents when not in pregnancy mode
    if (hcg && hcg > 25 && lifeStage !== 'pregnancy') {
      return {
        icon: Baby,
        color: 'bg-primary/5 border-primary/20',
        iconColor: 'text-primary',
        title: 'Your documents indicate pregnancy',
        description: `Your HCG level (${hcg} mIU/mL) indicates pregnancy, but your app is set to "${lifeStageLabel(lifeStage) || 'Period tracking'}". Switch to Pregnancy for week-by-week tracking, prenatal tips, and pregnancy-specific health analysis.`,
        action: 'Switch to Pregnancy',
        mode: 'pregnancy',
      };
    }

    // Detect menopause indicators when not in menopause mode
    if (fsh && fsh > 25 && estradiol && estradiol < 30 && lifeStage !== 'menopause' && lifeStage !== 'post-menopause' && lifeStage !== 'pregnancy') {
      return {
        icon: Flame,
        color: 'bg-destructive/5 border-destructive/20',
        iconColor: 'text-destructive',
        title: 'Your hormones suggest perimenopause',
        description: `Your FSH (${fsh}) is elevated and estradiol (${estradiol}) is low — this pattern indicates perimenopause. Switch to Menopause for symptom tracking, hot flash logging, and menopause-specific health insights.`,
        action: 'Switch to Menopause',
        mode: 'menopause',
      };
    }

    // Detect high progesterone suggesting ovulation/luteal phase
    if (progesterone && progesterone > 10 && (lifeStage === 'conception' || lifeStage === 'menstrual-cycle')) {
      return {
        icon: HeartPulse,
        color: 'bg-primary/5 border-primary/20',
        iconColor: 'text-primary',
        title: 'Ovulation confirmed by your lab results',
        description: `Your progesterone level (${progesterone} ng/mL) confirms that ovulation occurred recently. This is a great sign for fertility! Your cycle predictions have been updated.`,
        action: null,
        mode: null,
      };
    }

    return null;
  }, [medicalData, lifeStage]);

  if (!alert) return null;

  const Icon = alert.icon;

  return (
    <Card className={`overflow-hidden border-2 ${alert.color}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${alert.color}`}>
            <Icon className={`h-5 w-5 ${alert.iconColor}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
              <h4 className="text-sm font-medium">{alert.title}</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">{alert.description}</p>
            {alert.action && alert.mode && (
              <Button
                size="sm"
                onClick={() => onSwitchMode(alert.mode!)}
              >
                {alert.action}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
