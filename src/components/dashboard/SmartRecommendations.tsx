import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Lightbulb, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';

interface LabResult {
  title: string;
  value: string | null;
  unit: string | null;
  status: string | null;
  date_recorded: string | null;
  data_type: string;
}

interface SmartRecommendationsProps {
  medicalData: LabResult[];
  lifeStage?: string | null;
}

interface Recommendation {
  emoji: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

// Tests recommended for each life stage
const RECOMMENDED_TESTS: Record<string, { tests: string[]; label: string }> = {
  'menstrual-cycle': {
    tests: ['ferritin', 'hemoglobin', 'iron', 'vitamin d', 'tsh', 'vitamin b12'],
    label: 'cycle tracking',
  },
  'conception': {
    tests: ['ferritin', 'hemoglobin', 'vitamin d', 'tsh', 'folate', 'folic acid', 'vitamin b12', 'amh', 'fsh', 'lh', 'prolactin'],
    label: 'conception planning',
  },
  'ivf': {
    tests: ['amh', 'fsh', 'lh', 'estradiol', 'progesterone', 'tsh', 'prolactin', 'vitamin d', 'ferritin', 'hemoglobin'],
    label: 'IVF treatment',
  },
  'pregnancy': {
    tests: ['ferritin', 'hemoglobin', 'iron', 'vitamin d', 'tsh', 'glucose', 'hba1c', 'folate', 'vitamin b12', 'platelets', 'calcium'],
    label: 'pregnancy care',
  },
  'menopause': {
    tests: ['fsh', 'estradiol', 'tsh', 'vitamin d', 'calcium', 'cholesterol', 'ldl', 'hdl', 'glucose', 'hba1c'],
    label: 'menopause management',
  },
  'post-menopause': {
    tests: ['vitamin d', 'calcium', 'cholesterol', 'ldl', 'hdl', 'glucose', 'hba1c', 'tsh', 'creatinine'],
    label: 'post-menopause health',
  },
};

export default function SmartRecommendations({ medicalData, lifeStage }: SmartRecommendationsProps) {
  const recommendations = useMemo(() => {
    const recs: Recommendation[] = [];
    const labs = medicalData.filter(d => d.data_type === 'lab_result');
    const testedNames = new Set(labs.map(l => l.title.toLowerCase()));
    const now = new Date();

    // 1. Missing recommended tests for life stage
    const stageConfig = RECOMMENDED_TESTS[lifeStage || ''] || RECOMMENDED_TESTS['menstrual-cycle'];
    const missingTests = stageConfig.tests.filter(t => !testedNames.has(t) && ![...testedNames].some(tn => tn.includes(t)));

    if (missingTests.length > 0 && missingTests.length <= 6) {
      const testNames = missingTests.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ');
      recs.push({
        emoji: '🔬',
        title: `Consider testing: ${testNames}`,
        description: `These tests are commonly recommended for ${stageConfig.label}. Ask your doctor if they'd be relevant for you.`,
        priority: 'medium',
      });
    }

    // 2. Stale results — tests older than 6 months
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const staleTests = labs.filter(l => {
      if (!l.date_recorded) return false;
      const testDate = new Date(l.date_recorded);
      return testDate < sixMonthsAgo && (l.status === 'abnormal' || l.status === 'critical');
    });

    if (staleTests.length > 0) {
      const staleNames = [...new Set(staleTests.map(t => t.title))].slice(0, 3).join(', ');
      recs.push({
        emoji: '🔄',
        title: `Retest: ${staleNames}`,
        description: `These abnormal results are over 6 months old. A follow-up test can show if values have improved.`,
        priority: 'high',
      });
    }

    // 3. Abnormal results that haven't been retested
    const abnormalTitles = [...new Set(
      labs.filter(l => l.status === 'abnormal' || l.status === 'critical').map(l => l.title)
    )];
    const unretestedAbnormals = abnormalTitles.filter(title => {
      const testsForTitle = labs.filter(l => l.title === title);
      return testsForTitle.length === 1; // only tested once and it was abnormal
    });

    if (unretestedAbnormals.length > 0) {
      const names = unretestedAbnormals.slice(0, 3).join(', ');
      recs.push({
        emoji: '📋',
        title: `Follow up on: ${names}`,
        description: `These were flagged as outside the healthy range but haven't been retested yet. A follow-up test can confirm if it was a one-time reading or a pattern.`,
        priority: 'high',
      });
    }

    // 4. Positive trend encouragement
    const improvingTests = labs.filter(l => {
      if (!l.date_recorded) return false;
      const sameTitle = labs.filter(ll => ll.title === l.title && ll.date_recorded);
      if (sameTitle.length < 2) return false;
      const sorted = sameTitle.sort((a, b) => new Date(a.date_recorded!).getTime() - new Date(b.date_recorded!).getTime());
      const last = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      return prev.status === 'abnormal' && last.status === 'normal' && last.id === l.id;
    });

    if (improvingTests.length > 0) {
      const names = [...new Set(improvingTests.map(t => t.title))].join(', ');
      recs.push({
        emoji: '🎉',
        title: `Great progress on: ${names}`,
        description: `These results have moved back into the healthy range since your last test. Keep doing what you're doing!`,
        priority: 'low',
      });
    }

    // 5. General: no tests at all
    if (labs.length === 0) {
      recs.push({
        emoji: '📄',
        title: 'Upload your lab results',
        description: 'Upload your blood test results, imaging reports, or other medical documents. We\'ll analyze them and explain everything in plain language.',
        priority: 'low',
      });
    }

    return recs.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });
  }, [medicalData, lifeStage]);

  if (recommendations.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
        Smart Recommendations
      </h3>
      <div className="space-y-2.5">
        {recommendations.map((rec, i) => (
          <Card key={i} className={`overflow-hidden ${
            rec.priority === 'high' ? 'border-amber-200 dark:border-amber-900/30' : ''
          }`}>
            <CardContent className="p-3.5 flex items-start gap-3">
              <span className="text-xl flex-shrink-0">{rec.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{rec.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
