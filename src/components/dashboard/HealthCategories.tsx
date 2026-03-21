import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Droplet,
  HeartPulse,
  Flame,
  Pill,
  Shield,
  Zap,
  Brain,
  Bone,
  type LucideIcon,
} from 'lucide-react';

interface LabResult {
  title: string;
  value: string | null;
  unit: string | null;
  status: string | null;
  data_type: string;
}

interface HealthCategoriesProps {
  medicalData: LabResult[];
}

interface Category {
  name: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  tests: string[];
}

const CATEGORIES: Category[] = [
  {
    name: 'Blood Health',
    icon: Droplet,
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    tests: ['hemoglobin', 'ferritin', 'iron', 'hematocrit', 'mcv', 'mch', 'mchc', 'rdw', 'red blood cells', 'platelets', 'white blood cells', 'neutrophils', 'lymphocytes', 'monocytes', 'eosinophils', 'basophils'],
  },
  {
    name: 'Hormones & Cycle',
    icon: HeartPulse,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50 dark:bg-pink-900/20',
    tests: ['estradiol', 'progesterone', 'fsh', 'lh', 'hcg', 'amh', 'prolactin', 'testosterone', 'dhea', 'shbg'],
  },
  {
    name: 'Thyroid',
    icon: Zap,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-900/20',
    tests: ['tsh', 't3', 't4', 'free t3', 'free t4', 'anti-tpo', 'anti-tg', 'thyroglobulin'],
  },
  {
    name: 'Metabolic & Sugar',
    icon: Flame,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    tests: ['glucose', 'fasting glucose', 'hba1c', 'insulin', 'c-peptide', 'cholesterol', 'total cholesterol', 'ldl', 'hdl', 'triglycerides'],
  },
  {
    name: 'Liver',
    icon: Shield,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    tests: ['alt', 'ast', 'ggt', 'bilirubin', 'direct bilirubin', 'alkaline phosphatase', 'albumin', 'total protein'],
  },
  {
    name: 'Kidney',
    icon: Droplet,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
    tests: ['creatinine', 'urea', 'bun', 'gfr', 'egfr', 'uric acid', 'cystatin'],
  },
  {
    name: 'Vitamins & Minerals',
    icon: Pill,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    tests: ['vitamin d', 'vitamin b12', 'folate', 'folic acid', 'calcium', 'magnesium', 'phosphate', 'potassium', 'sodium', 'zinc', 'selenium'],
  },
  {
    name: 'Immunity & Inflammation',
    icon: Brain,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    tests: ['crp', 'esr', 'ana', 'anti-tpo', 'anticardiolipin', 'd-dimer', 'fibrinogen', 'complement', 'immunoglobulin'],
  },
];

export default function HealthCategories({ medicalData }: HealthCategoriesProps) {
  const categories = useMemo(() => {
    const labs = medicalData.filter(d => d.data_type === 'lab_result' && d.value);

    return CATEGORIES.map(cat => {
      const matchingLabs = labs.filter(lab =>
        cat.tests.some(t => lab.title.toLowerCase().includes(t))
      );

      if (matchingLabs.length === 0) return null;

      const normal = matchingLabs.filter(l => l.status === 'normal' || l.status === 'expected').length;
      const total = matchingLabs.length;
      const score = total > 0 ? Math.round((normal / total) * 100) : 0;
      const hasIssues = matchingLabs.some(l => l.status === 'abnormal' || l.status === 'critical');
      const hasCritical = matchingLabs.some(l => l.status === 'critical');

      return {
        ...cat,
        matchingLabs,
        score,
        total,
        normal,
        hasIssues,
        hasCritical,
      };
    }).filter(Boolean) as (Category & { matchingLabs: LabResult[]; score: number; total: number; normal: number; hasIssues: boolean; hasCritical: boolean })[];
  }, [medicalData]);

  if (categories.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
        Health by Category
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {categories.map(cat => {
          const Icon = cat.icon;
          return (
            <Card key={cat.name} className={`overflow-hidden border ${
              cat.hasCritical ? 'border-red-200 dark:border-red-900/30' :
              cat.hasIssues ? 'border-amber-200 dark:border-amber-900/30' : ''
            }`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-lg ${cat.bgColor} flex items-center justify-center`}>
                    <Icon className={`h-4.5 w-4.5 ${cat.color}`} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{cat.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {cat.normal}/{cat.total} healthy
                    </p>
                  </div>
                  <span className={`text-lg font-bold ${
                    cat.score >= 80 ? 'text-green-600' :
                    cat.score >= 50 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {cat.score}%
                  </span>
                </div>
                <Progress value={cat.score} className="h-1.5" />
                <div className="mt-2 flex flex-wrap gap-1">
                  {cat.matchingLabs.map((lab, i) => {
                    const statusColor =
                      lab.status === 'critical' ? 'bg-red-500' :
                      lab.status === 'abnormal' ? 'bg-amber-500' :
                      lab.status === 'expected' ? 'bg-blue-500' : 'bg-green-500';
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground"
                        title={`${lab.title}: ${lab.value}${lab.unit ? ' ' + lab.unit : ''} — ${lab.status}`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                        <span className="truncate max-w-[80px]">{lab.title}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
