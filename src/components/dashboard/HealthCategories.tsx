import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ChevronDown } from 'lucide-react';
import {
  Droplet,
  HeartPulse,
  Flame,
  Pill,
  Shield,
  Zap,
  Brain,
  type LucideIcon,
} from 'lucide-react';

interface LabResult {
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
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
  barColor: string;
  tests: string[];
}

const CATEGORIES: Category[] = [
  { name: 'Blood Health', icon: Droplet, color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-900/20', barColor: 'bg-red-500',
    tests: ['hemoglobin', 'ferritin', 'iron', 'hematocrit', 'mcv', 'mch', 'mchc', 'rdw', 'red blood cells', 'platelets', 'white blood cells', 'neutrophils', 'lymphocytes', 'monocytes', 'eosinophils', 'basophils'] },
  { name: 'Hormones & Cycle', icon: HeartPulse, color: 'text-pink-600', bgColor: 'bg-pink-50 dark:bg-pink-900/20', barColor: 'bg-pink-500',
    tests: ['estradiol', 'progesterone', 'fsh', 'lh', 'hcg', 'amh', 'prolactin', 'testosterone', 'dhea', 'shbg'] },
  { name: 'Thyroid', icon: Zap, color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-900/20', barColor: 'bg-violet-500',
    tests: ['tsh', 't3', 't4', 'free t3', 'free t4', 'anti-tpo', 'anti-tg', 'thyroglobulin'] },
  { name: 'Metabolic & Sugar', icon: Flame, color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-900/20', barColor: 'bg-orange-500',
    tests: ['glucose', 'fasting glucose', 'hba1c', 'insulin', 'c-peptide', 'cholesterol', 'total cholesterol', 'ldl', 'hdl', 'triglycerides'] },
  { name: 'Liver', icon: Shield, color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/20', barColor: 'bg-emerald-500',
    tests: ['alt', 'ast', 'ggt', 'bilirubin', 'direct bilirubin', 'alkaline phosphatase', 'albumin', 'total protein'] },
  { name: 'Kidney', icon: Droplet, color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-900/20', barColor: 'bg-cyan-500',
    tests: ['creatinine', 'urea', 'bun', 'gfr', 'egfr', 'uric acid', 'cystatin'] },
  { name: 'Vitamins & Minerals', icon: Pill, color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/20', barColor: 'bg-amber-500',
    tests: ['vitamin d', 'vitamin b12', 'folate', 'folic acid', 'calcium', 'magnesium', 'phosphate', 'potassium', 'sodium', 'zinc', 'selenium'] },
  { name: 'Immunity & Inflammation', icon: Brain, color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/20', barColor: 'bg-blue-500',
    tests: ['crp', 'esr', 'ana', 'anti-tpo', 'anticardiolipin', 'd-dimer', 'fibrinogen', 'complement', 'immunoglobulin'] },
];

const statusEmoji = (s: string | null) =>
  s === 'critical' ? '🔴' : s === 'abnormal' ? '⚠️' : s === 'expected' ? '💙' : '✅';

function MiniBar({ value, refRange, status }: { value: string | null; refRange: string | null; status: string | null }) {
  if (!value || !refRange) return null;
  const val = parseFloat(value);
  if (isNaN(val)) return null;
  const match = refRange.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
  if (!match) return null;
  const low = parseFloat(match[1]);
  const high = parseFloat(match[2]);
  const range = high - low;
  if (range <= 0) return null;
  const ext = range * 0.3;
  const pct = Math.max(0, Math.min(100, ((val - (low - ext)) / (range + ext * 2)) * 100));
  const barColor = status === 'critical' ? 'bg-red-500' : status === 'abnormal' ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="w-16 h-2 rounded-full bg-muted relative overflow-hidden">
      <div className="absolute top-0 bottom-0 bg-green-200/50 dark:bg-green-900/20" style={{ left: '23%', width: '54%' }} />
      <div className={`absolute top-0 bottom-0 w-1.5 rounded-full ${barColor}`} style={{ left: `calc(${pct}% - 3px)` }} />
    </div>
  );
}

export default function HealthCategories({ medicalData }: HealthCategoriesProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

      // Sort: critical first, then abnormal, then rest
      const sorted = [...matchingLabs].sort((a, b) => {
        const order: Record<string, number> = { critical: 0, abnormal: 1, expected: 2, normal: 3 };
        return (order[a.status || 'normal'] ?? 3) - (order[b.status || 'normal'] ?? 3);
      });

      return { ...cat, matchingLabs: sorted, score, total, normal, hasIssues, hasCritical };
    }).filter(Boolean) as (Category & { matchingLabs: LabResult[]; score: number; total: number; normal: number; hasIssues: boolean; hasCritical: boolean })[];
  }, [medicalData]);

  if (categories.length === 0) return null;

  const toggle = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  return (
    <div>
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
        Health by Category
      </h3>
      <div className="space-y-2.5">
        {categories.map(cat => {
          const Icon = cat.icon;
          const isOpen = expanded.has(cat.name);
          const flagged = cat.matchingLabs.filter(l => l.status === 'abnormal' || l.status === 'critical');

          return (
            <Card key={cat.name} className={`overflow-hidden ${
              cat.hasCritical ? 'border-red-200 dark:border-red-900/30' :
              cat.hasIssues ? 'border-amber-200 dark:border-amber-900/30' : ''
            }`}>
              <button
                onClick={() => toggle(cat.name)}
                className="w-full p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className={`w-10 h-10 rounded-xl ${cat.bgColor} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`h-5 w-5 ${cat.color}`} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{cat.name}</p>
                    <span className={`text-sm font-bold ${
                      cat.score >= 80 ? 'text-green-600' : cat.score >= 50 ? 'text-amber-600' : 'text-red-600'
                    }`}>{cat.score}%</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Progress value={cat.score} className="h-1 flex-1" />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {cat.normal}/{cat.total} ok
                      {flagged.length > 0 && ` · ${flagged.length} flagged`}
                    </span>
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-border/50 pt-3">
                  <div className="space-y-2">
                    {cat.matchingLabs.map((lab, i) => (
                      <div key={i} className={`flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg ${
                        lab.status === 'critical' ? 'bg-red-50 dark:bg-red-900/10' :
                        lab.status === 'abnormal' ? 'bg-amber-50 dark:bg-amber-900/10' : ''
                      }`}>
                        <span className="text-xs flex-shrink-0">{statusEmoji(lab.status)}</span>
                        <span className="text-xs font-medium flex-1 min-w-0 truncate">{lab.title}</span>
                        <MiniBar value={lab.value} refRange={lab.reference_range} status={lab.status} />
                        <span className={`text-xs font-mono font-bold whitespace-nowrap ${
                          lab.status === 'critical' ? 'text-red-600' :
                          lab.status === 'abnormal' ? 'text-amber-600' :
                          'text-foreground'
                        }`}>
                          {lab.value}{lab.unit ? ` ${lab.unit}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
