import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DocumentUpload from '@/components/dashboard/DocumentUpload';
// IMPORTANT: These custom components provide AI-powered health analysis.
// Do NOT remove these imports — they are used in the health records page below.
import CycleImpactSection from '@/components/dashboard/CycleImpactSection';
import PersonalizedInsights from '@/components/dashboard/PersonalizedInsights';
import CycleUpdateSuggestions from '@/components/dashboard/CycleUpdateSuggestions';
import HealthCategories from '@/components/dashboard/HealthCategories';
import SmartRecommendations from '@/components/dashboard/SmartRecommendations';
import TestComparisonTable from '@/components/dashboard/TestComparisonTable';
import HealthTimeline from '@/components/dashboard/HealthTimeline';
import ResultsRangeChart from '@/components/dashboard/ResultsRangeChart';
import DocumentCycleAlert from '@/components/dashboard/DocumentCycleAlert';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  FileText,
  Pill,
  Activity,
  FlaskConical,
  Syringe,
  AlertTriangle,
  Calendar,
  Stethoscope,
  Upload,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  BarChart3,
  Clock,
  Target,
  Minus,
  Info,
  Lightbulb,
  ArrowRight,
  Heart,
  ThumbsUp,
  Eye,
  HelpCircle,
  Trash2,
  Pencil,
} from 'lucide-react';
import { format, differenceInDays, addDays } from 'date-fns';
import {
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  ReferenceArea,
  PieChart as RechartsPie,
  Pie,
} from 'recharts';

interface MedicalDataItem {
  id: string;
  data_type: string;
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  date_recorded: string | null;
  notes: string | null;
  created_at: string;
  document_id: string | null;
  raw_data?: {
    priority?: string;
    panel?: string;
    is_repeat_test?: boolean;
    possible_conditions?: string[];
  } | null;
}

interface DocumentInfo {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  ai_suggested_name: string | null;
  ai_summary: string | null;
  ai_suggested_category: string | null;
  uploaded_at: string | null;
  document_type: string;
}

// Friendly labels for statuses — no jargon
const friendlyStatus: Record<string, { label: string; emoji: string; color: string; bgColor: string; description: string }> = {
  normal: { label: 'All good', emoji: '✅', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', description: 'This result is within the healthy range.' },
  expected: { label: 'Normal for you', emoji: '💙', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', description: 'This is outside the general range, but perfectly normal for your situation.' },
  abnormal: { label: 'Worth discussing', emoji: '⚠️', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', description: 'This result is outside the normal range. Talk to your doctor about it.' },
  critical: { label: 'Needs attention', emoji: '🔴', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', description: 'This needs urgent medical attention.' },
  informational: { label: 'For reference', emoji: 'ℹ️', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', description: 'Tracked for your records.' },
  active: { label: 'Current', emoji: '📌', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', description: '' },
  resolved: { label: 'Resolved', emoji: '✓', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', description: '' },
};

const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

// Friendly "what does this mean" for common test names
const friendlyTestNames: Record<string, string> = {
  'Hemoglobin': 'Hemoglobin — carries oxygen in your blood',
  'Ferritin': 'Ferritin — your iron stores',
  'TSH': 'TSH — thyroid function',
  'HCG': 'HCG — pregnancy hormone',
  'Vitamin D': 'Vitamin D — bone & immune health',
  'Vitamin B12': 'Vitamin B12 — nerve & blood cell health',
  'Folate': 'Folate — cell growth & pregnancy support',
  'Folic Acid': 'Folic Acid — cell growth & pregnancy support',
  'Iron': 'Iron — mineral for energy',
  'Glucose': 'Glucose — blood sugar',
  'Fasting Glucose': 'Fasting Glucose — blood sugar (fasting)',
  'HbA1c': 'HbA1c — average blood sugar over 3 months',
  'Platelets': 'Platelets — blood clotting cells',
  'White Blood Cells': 'White Blood Cells — infection fighters',
  'Red Blood Cells': 'Red Blood Cells — oxygen carriers',
  'ALT': 'ALT — liver health marker',
  'AST': 'AST — liver health marker',
  'GGT': 'GGT — liver & bile duct marker',
  'Bilirubin': 'Bilirubin — liver processing marker',
  'Estradiol': 'Estradiol — main estrogen hormone',
  'Progesterone': 'Progesterone — supports pregnancy & cycle',
  'FSH': 'FSH — reproductive hormone',
  'LH': 'LH — ovulation hormone',
  'AMH': 'AMH — ovarian reserve (egg supply)',
  'Prolactin': 'Prolactin — hormone affecting periods & fertility',
  'Testosterone': 'Testosterone — hormone affecting skin, hair & cycle',
  'DHEA-S': 'DHEA-S — adrenal hormone',
  'Creatinine': 'Creatinine — kidney function',
  'Urea': 'Urea — kidney function',
  'Total Cholesterol': 'Total Cholesterol — heart health',
  'LDL': 'LDL — "bad" cholesterol',
  'HDL': 'HDL — "good" cholesterol',
  'Triglycerides': 'Triglycerides — blood fat levels',
  'CRP': 'CRP — inflammation marker',
  'D-Dimer': 'D-Dimer — blood clotting marker',
  'Fibrinogen': 'Fibrinogen — blood clotting protein',
  'Calcium': 'Calcium — bone & muscle health',
  'Magnesium': 'Magnesium — muscle, nerve & sleep support',
  'Sodium': 'Sodium — fluid balance',
  'Potassium': 'Potassium — heart & muscle function',
  'Phosphate': 'Phosphate — bone health',
  'Total Protein': 'Total Protein — overall nutrition',
  'Albumin': 'Albumin — liver function & nutrition',
  'ANA': 'ANA — autoimmune screening',
  'Anti-TPO': 'Anti-TPO — thyroid autoimmune marker',
  'Anticardiolipin': 'Anticardiolipin — blood clotting disorder marker',
  'INR': 'INR — blood clotting speed',
  'PT': 'PT — blood clotting time',
  'APTT': 'APTT — blood clotting time',
  'Hematocrit': 'Hematocrit — red blood cell proportion',
  'MCV': 'MCV — red blood cell size',
  'MCH': 'MCH — hemoglobin per red blood cell',
  'MCHC': 'MCHC — hemoglobin concentration',
  'RDW': 'RDW — red blood cell size variation',
  'Neutrophils': 'Neutrophils — main infection fighters',
  'Lymphocytes': 'Lymphocytes — immune system cells',
  'Monocytes': 'Monocytes — immune cells',
  'Eosinophils': 'Eosinophils — allergy & parasite fighters',
  'Basophils': 'Basophils — allergy-related immune cells',
};

// Specific explanations for common tests — what the result means when high or low
const testExplanations: Record<string, { high: string; low: string; normal: string }> = {
  'hemoglobin': {
    low: 'Low hemoglobin means your blood carries less oxygen, which can cause fatigue, dizziness, and shortness of breath. Common causes include iron deficiency, heavy periods, or vitamin deficiency.',
    high: 'Elevated hemoglobin can be caused by dehydration, smoking, or living at high altitude. Rarely, it can indicate a blood disorder.',
    normal: 'Your hemoglobin is healthy — your blood is carrying oxygen well.',
  },
  'ferritin': {
    low: 'Low ferritin means your iron stores are depleted. This is very common in women due to menstrual blood loss. You may feel tired, have brain fog, or experience hair loss. Iron supplements and iron-rich foods can help.',
    high: 'Elevated ferritin can indicate inflammation, liver issues, or iron overload. Your doctor may want to investigate the cause.',
    normal: 'Your iron stores look good.',
  },
  'tsh': {
    low: 'Low TSH suggests your thyroid is overactive (hyperthyroidism). This can cause weight loss, anxiety, rapid heartbeat, and shorter/lighter periods.',
    high: 'Elevated TSH suggests your thyroid is underactive (hypothyroidism). This can cause fatigue, weight gain, feeling cold, and heavier/irregular periods. It\'s very treatable with medication.',
    normal: 'Your thyroid function is healthy.',
  },
  'vitamin d': {
    low: 'Low vitamin D is very common and can affect bone health, mood, immunity, and fertility. A supplement (usually 1000-4000 IU daily) can bring it back to healthy levels.',
    high: 'Very high vitamin D is rare and usually only from excessive supplementation. Your doctor may adjust your dose.',
    normal: 'Your vitamin D level is healthy.',
  },
  'glucose': {
    low: 'Low blood sugar can cause shakiness, dizziness, and confusion. If fasting, mildly low values are usually not concerning.',
    high: 'Elevated blood sugar may indicate prediabetes or diabetes. Lifestyle changes (diet, exercise) can make a big difference. Your doctor may recommend a follow-up HbA1c test.',
    normal: 'Your blood sugar is in a healthy range.',
  },
  'hba1c': {
    low: 'Very low HbA1c is uncommon and rarely a concern.',
    high: 'Elevated HbA1c means your average blood sugar has been high over the past 3 months. Above 5.7% suggests prediabetes; above 6.5% suggests diabetes. Diet, exercise, and sometimes medication can help.',
    normal: 'Your average blood sugar over the past 3 months is healthy.',
  },
  'iron': {
    low: 'Low iron can cause anemia, fatigue, weakness, and pale skin. Women with heavy periods are especially prone. Iron-rich foods (red meat, spinach, lentils) and supplements can help.',
    high: 'Elevated iron may indicate hemochromatosis or liver issues. Your doctor may want to check ferritin and transferrin levels.',
    normal: 'Your iron level is healthy.',
  },
  'platelets': {
    low: 'Low platelets mean your blood may not clot as well, leading to easy bruising or prolonged bleeding. Causes range from viral infections to autoimmune conditions.',
    high: 'Elevated platelets can indicate inflammation, infection, or iron deficiency. Persistently high levels may need further investigation.',
    normal: 'Your platelet count is healthy — blood clotting looks normal.',
  },
  'white blood cells': {
    low: 'Low white blood cells may mean your immune system is weakened. This can be caused by viral infections, certain medications, or autoimmune conditions.',
    high: 'Elevated white blood cells usually indicate your body is fighting an infection or inflammation. Stress and certain medications can also raise them.',
    normal: 'Your white blood cell count is normal — your immune system looks healthy.',
  },
  'creatinine': {
    low: 'Low creatinine is usually not a concern and can occur with low muscle mass.',
    high: 'Elevated creatinine may indicate reduced kidney function. Your doctor may want to check your GFR (kidney filtration rate).',
    normal: 'Your kidney function looks healthy.',
  },
  'alt': {
    low: 'Low ALT is normal and not a concern.',
    high: 'Elevated ALT suggests liver stress or inflammation. Common causes include fatty liver, alcohol, medications, or viral hepatitis. Your doctor may recommend lifestyle changes or further tests.',
    normal: 'Your liver health marker looks good.',
  },
  'ast': {
    low: 'Low AST is normal and not a concern.',
    high: 'Elevated AST can indicate liver or muscle issues. It\'s often checked alongside ALT for a clearer picture of liver health.',
    normal: 'Your liver marker is in a healthy range.',
  },
  'cholesterol': {
    low: 'Very low cholesterol is uncommon but can occur with certain conditions or diets.',
    high: 'Elevated total cholesterol increases cardiovascular risk. Diet, exercise, and sometimes medication can bring it down.',
    normal: 'Your cholesterol level is healthy.',
  },
  'total cholesterol': {
    low: 'Very low total cholesterol is uncommon.',
    high: 'Elevated total cholesterol increases cardiovascular risk. A heart-healthy diet, regular exercise, and sometimes statins can help.',
    normal: 'Your total cholesterol is in a healthy range.',
  },
  'ldl': {
    low: 'Low LDL is generally good for heart health.',
    high: 'Elevated LDL ("bad" cholesterol) increases risk of heart disease. Diet changes (less saturated fat, more fiber) and exercise can help lower it.',
    normal: 'Your LDL cholesterol is in a healthy range.',
  },
  'hdl': {
    low: 'Low HDL ("good" cholesterol) increases cardiovascular risk. Regular exercise, healthy fats (olive oil, nuts, avocado), and reducing processed foods can raise it.',
    high: 'High HDL is generally protective for heart health.',
    normal: 'Your HDL cholesterol is healthy — good for your heart.',
  },
  'estradiol': {
    low: 'Low estradiol can affect cycle regularity, bone density, and mood. In menopause this is expected. In reproductive years, it may indicate hormonal imbalance.',
    high: 'Elevated estradiol often occurs around ovulation or can indicate conditions like endometriosis. During IVF stimulation, elevated levels are expected.',
    normal: 'Your estradiol level is in a healthy range for your cycle phase.',
  },
  'progesterone': {
    low: 'Low progesterone may indicate you haven\'t ovulated recently, or can affect your ability to maintain a pregnancy. This is normal in the first half of your cycle.',
    high: 'Elevated progesterone confirms ovulation has occurred. During pregnancy, high progesterone is expected and supports the baby.',
    normal: 'Your progesterone level looks appropriate.',
  },
  'fsh': {
    low: 'Low FSH can indicate hormonal suppression, which may affect ovulation.',
    high: 'Elevated FSH can indicate diminished ovarian reserve (fewer eggs remaining). In menopause, high FSH is expected. If you\'re of reproductive age, a fertility specialist can discuss options.',
    normal: 'Your FSH level is in a healthy range.',
  },
  'lh': {
    low: 'Low LH can indicate hormonal imbalance affecting ovulation.',
    high: 'Elevated LH can indicate an LH surge (ovulation is near!) or, if persistently high, may be associated with PCOS.',
    normal: 'Your LH level is in a healthy range.',
  },
  'hcg': {
    low: 'Low HCG in early pregnancy may need monitoring — rising HCG is a good sign. Outside of pregnancy, HCG should be very low.',
    high: 'Elevated HCG typically indicates pregnancy. The level helps estimate how far along the pregnancy is.',
    normal: 'Your HCG level is in the expected range.',
  },
  'amh': {
    low: 'Low AMH indicates a lower ovarian reserve (fewer eggs remaining). If you\'re planning to conceive, timing matters — consider discussing your options with a fertility specialist.',
    high: 'Elevated AMH can indicate a high egg reserve (good for fertility) or may be associated with PCOS.',
    normal: 'Your ovarian reserve looks healthy.',
  },
  'vitamin b12': {
    low: 'Low B12 can cause fatigue, tingling in hands/feet, memory issues, and mood changes. Vegans/vegetarians are especially at risk. B12 supplements or injections can help.',
    high: 'Elevated B12 is usually not a concern, often from supplements.',
    normal: 'Your B12 level is healthy.',
  },
  'folate': {
    low: 'Low folate is important to address, especially if planning pregnancy — folate prevents neural tube defects. Eat leafy greens and take a prenatal vitamin with folic acid.',
    high: 'Elevated folate from food or supplements is not a concern.',
    normal: 'Your folate level is healthy.',
  },
  'calcium': {
    low: 'Low calcium can affect bone density and cause muscle cramps. Dairy, leafy greens, and supplements can help.',
    high: 'Elevated calcium may indicate a parathyroid issue. Your doctor may want to check your PTH level.',
    normal: 'Your calcium level is healthy for bone and muscle function.',
  },
  'magnesium': {
    low: 'Low magnesium can worsen PMS cramps, cause muscle cramps, sleep problems, and anxiety. Magnesium supplements (especially glycinate) before bed can help.',
    high: 'Elevated magnesium is rare from diet alone and usually only from excessive supplementation.',
    normal: 'Your magnesium level is healthy.',
  },
  'crp': {
    low: 'Low CRP indicates minimal inflammation — this is good.',
    high: 'Elevated CRP indicates inflammation somewhere in your body. Causes range from infection to autoimmune conditions. Chronic inflammation can worsen PMS and affect fertility.',
    normal: 'No significant inflammation detected.',
  },
  'prolactin': {
    low: 'Low prolactin is usually not a concern.',
    high: 'Elevated prolactin can suppress ovulation, causing irregular or missed periods. Causes include stress, certain medications, or a small pituitary issue. It\'s treatable.',
    normal: 'Your prolactin level is in a healthy range.',
  },
  'testosterone': {
    low: 'Low testosterone in women can cause low libido and fatigue.',
    high: 'Elevated testosterone in women can cause acne, excess hair growth, and irregular periods. This is commonly seen in PCOS.',
    normal: 'Your testosterone level is in a healthy range for women.',
  },
};

// Generate a helpful explanation when the AI didn't provide notes
function generateFallbackNote(item: MedicalDataItem): string | null {
  if (item.notes) return null; // AI already provided notes

  const val = item.value ? parseFloat(item.value) : null;
  const hasValue = val !== null && !isNaN(val);

  // Find a matching explanation
  const titleLower = item.title.toLowerCase();
  const explanation = testExplanations[titleLower]
    || Object.entries(testExplanations).find(([key]) => titleLower.includes(key))?.[1];

  // Determine direction (high/low)
  let direction: 'high' | 'low' | 'unknown' = 'unknown';
  if (hasValue && item.reference_range) {
    const match = item.reference_range.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
    if (match) {
      const low = parseFloat(match[1]);
      const high = parseFloat(match[2]);
      if (val! < low) direction = 'low';
      else if (val! > high) direction = 'high';
    }
  }

  if (item.status === 'normal' || item.status === 'expected') {
    if (explanation) return explanation.normal;
    return null;
  }

  if (item.status === 'abnormal' || item.status === 'critical') {
    if (explanation && direction !== 'unknown') {
      const rangeText = item.reference_range ? ` (healthy range: ${item.reference_range}${item.unit ? ' ' + item.unit : ''})` : '';
      return `Your ${item.title} (${item.value}${item.unit ? ' ' + item.unit : ''}) is ${direction === 'low' ? 'below' : 'above'} the healthy range${rangeText}. ${explanation[direction]}`;
    }

    // Generic but still specific about the value
    const dirLabel = direction === 'low' ? 'lower than' : direction === 'high' ? 'higher than' : 'outside';
    return `Your ${item.title} (${item.value || ''}${item.unit ? ' ' + item.unit : ''}) is ${dirLabel} the healthy range${item.reference_range ? ` (${item.reference_range}${item.unit ? ' ' + item.unit : ''})` : ''}. Bring this up at your next doctor visit for personalized advice.`;
  }

  // informational or unknown status
  if (explanation) return explanation.normal;
  return null;
}

function getFriendlyName(title: string): string {
  return friendlyTestNames[title] || title;
}

function getStatusInfo(status: string | null) {
  return friendlyStatus[status || ''] || friendlyStatus.informational;
}

// Render a value with a visual "gauge" showing where it falls in range
function ValueGauge({ value, unit, refRange, status }: { value: string | null; unit: string | null; refRange: string | null; status: string | null }) {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;

  const numVal = parseFloat(value);
  const hasNumeric = !isNaN(numVal);
  let percentage: number | null = null;

  if (hasNumeric && refRange) {
    const match = refRange.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
    if (match) {
      const low = parseFloat(match[1]);
      const high = parseFloat(match[2]);
      const range = high - low;
      if (range > 0) {
        // Show position: 0% = at low end, 100% = at high end
        percentage = Math.max(0, Math.min(100, ((numVal - low) / range) * 100));
      }
    }
  }

  const statusInfo = getStatusInfo(status);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-1.5">
        <span className={`text-lg font-bold tabular-nums ${statusInfo.color}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {percentage !== null && (
        <div className="space-y-0.5">
          <div className="h-2 bg-muted rounded-full overflow-hidden relative">
            <div className="absolute inset-0 bg-green-200 dark:bg-green-900/40 rounded-full" />
            <div
              className={`absolute top-0 h-full w-1.5 rounded-full ${
                status === 'critical' ? 'bg-red-500' : status === 'abnormal' ? 'bg-amber-500' : 'bg-green-500'
              }`}
              style={{ left: `calc(${percentage}% - 3px)` }}
            />
          </div>
          <div className="flex justify-between">
            <span className="text-[9px] text-muted-foreground">Low</span>
            <span className="text-[9px] text-muted-foreground">High</span>
          </div>
        </div>
      )}
      {refRange && (
        <p className="text-[10px] text-muted-foreground">
          Healthy range: {refRange} {unit || ''}
        </p>
      )}
    </div>
  );
}

function renderEnhancedSummary(summary: string) {
  const sections = summary.split('\n\n');
  return (
    <div className="space-y-3">
      {sections.map((section, i) => {
        const trimmed = section.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('📋 Key Takeaways:')) {
          const items = trimmed.replace('📋 Key Takeaways:', '').trim().split('\n').filter(l => l.trim());
          return (
            <div key={i} className="bg-primary/5 rounded-xl p-4 border border-primary/10">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-wide">What you should know</span>
              </div>
              <ul className="space-y-2">
                {items.map((item, j) => (
                  <li key={j} className="text-sm leading-relaxed flex items-start gap-2">
                    <span className="text-primary mt-0.5 flex-shrink-0">💡</span>
                    <span>{item.replace(/^[•\-]\s*/, '')}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        if (trimmed.startsWith('⚡ Action Items:')) {
          const items = trimmed.replace('⚡ Action Items:', '').trim().split('\n').filter(l => l.trim());
          return (
            <div key={i} className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-4 border border-amber-200 dark:border-amber-900/30">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">What to do next</span>
              </div>
              <ul className="space-y-2">
                {items.map((item, j) => (
                  <li key={j} className="text-sm leading-relaxed flex items-start gap-2">
                    <span className="text-amber-600 mt-0.5 flex-shrink-0">→</span>
                    <span>{item.replace(/^[•\-]\s*/, '')}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        return (
          <p key={i} className="text-sm leading-relaxed text-foreground/90">{trimmed}</p>
        );
      })}
    </div>
  );
}

// A single result card — friendly, visual, no jargon
function ResultCard({ item }: { item: MedicalDataItem }) {
  const statusInfo = getStatusInfo(item.status);
  const fallbackNote = generateFallbackNote(item);
  const displayNote = item.notes || fallbackNote;

  return (
    <div className={`rounded-xl p-4 border ${statusInfo.bgColor} transition-all`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-base">{statusInfo.emoji}</span>
            <span className="text-sm font-semibold">{getFriendlyName(item.title)}</span>
          </div>
          <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${statusInfo.color} border-current/20`}>
            {statusInfo.label}
          </Badge>
        </div>
        <div className="text-right flex-shrink-0">
          <ValueGauge value={item.value} unit={item.unit} refRange={item.reference_range} status={item.status} />
        </div>
      </div>
      {displayNote && (
        <div className="mt-3 bg-background/60 rounded-lg px-3 py-2.5 border border-border/30">
          <p className="text-sm leading-relaxed text-foreground/80">
            {displayNote}
          </p>
        </div>
      )}
      {/* Possible conditions — only for abnormal/critical */}
      {(item.status === 'abnormal' || item.status === 'critical') &&
        (item.raw_data as any)?.possible_conditions?.length > 0 && (
        <div className="mt-2.5 bg-background/80 rounded-lg px-3 py-2.5 border border-border/40">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <HelpCircle className="h-3 w-3" />
            What this could mean
          </p>
          <div className="flex flex-wrap gap-1.5">
            {((item.raw_data as any).possible_conditions as string[]).map((condition: string, idx: number) => (
              <span key={idx} className={`text-xs px-2.5 py-1 rounded-full border ${
                item.status === 'critical'
                  ? 'bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                  : 'bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
              }`}>
                {condition}
              </span>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground mt-2 italic">
            ⚕️ These are possibilities, not diagnoses. Only your doctor can make a diagnosis.
          </p>
        </div>
      )}
      {item.date_recorded && (
        <p className="text-[10px] text-muted-foreground mt-2">
          📅 {format(new Date(item.date_recorded), 'MMMM d, yyyy')}
        </p>
      )}
    </div>
  );
}

export default function MedicalHistory() {
  const navigate = useNavigate();
  usePageTitle('Health Records');
  const { user, loading: authLoading } = useAuth();
  const [medicalData, setMedicalData] = useState<MedicalDataItem[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [lifeStage, setLifeStage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPanels, setExpandedPanels] = useState<Set<string>>(new Set());
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState({ done: 0, total: 0 });
  const { toast } = useToast();

  // Handle cycle update suggestions (e.g., switch to pregnancy mode)
  const handleCycleUpdate = async (suggestion: { type: string; id: string }) => {
    if (!user) return;

    try {
      let newLifeStage: string | null = null;

      switch (suggestion.type) {
        case 'pregnancy_detected':
          newLifeStage = 'pregnancy';
          break;
        case 'menopause_indicator':
          newLifeStage = 'menopause';
          break;
        case 'ovulation_confirmed':
        case 'phase_update':
        case 'cycle_length_adjust':
        case 'irregularity_flag':
          toast({ title: 'Noted!', description: 'This will be factored into your predictions.' });
          return;
        default:
          return;
      }

      // Update profile
      const { data, error } = await supabase
        .from('profiles')
        .update({ life_stage: newLifeStage })
        .eq('id', user.id)
        .select('life_stage')
        .single();

      if (error) throw error;

      // Verify it actually changed
      if (data?.life_stage !== newLifeStage) {
        throw new Error('Update did not apply');
      }

      setLifeStage(newLifeStage);
      toast({
        title: 'Mode updated!',
        description: `Switching to ${newLifeStage.replace('-', ' ')} mode...`,
      });

      // Force full page reload to dashboard so profile is re-fetched fresh
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
    } catch (error) {
      console.error('Error updating cycle:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update your mode. Please try again.',
      });
    }
  };

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth/login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [medRes, docRes, profileRes] = await Promise.all([
        supabase.from('medical_extracted_data').select('*').eq('user_id', user!.id).order('date_recorded', { ascending: false, nullsFirst: false }),
        supabase.from('health_documents').select('id, file_name, file_path, mime_type, ai_suggested_name, ai_summary, ai_suggested_category, uploaded_at, document_type').eq('user_id', user!.id).order('uploaded_at', { ascending: false }),
        supabase.from('profiles').select('life_stage').eq('id', user!.id).single(),
      ]);
      if (medRes.data) setMedicalData(medRes.data as MedicalDataItem[]);
      if (docRes.data) setDocuments(docRes.data);
      if (profileRes.data) setLifeStage(profileRes.data.life_stage);
    } catch (error) {
      console.error('Error fetching medical history:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePanel = (panel: string) => {
    setExpandedPanels(prev => {
      const next = new Set(prev);
      if (next.has(panel)) next.delete(panel);
      else next.add(panel);
      return next;
    });
  };

  const renameDocument = async (docId: string, currentName: string) => {
    const newName = window.prompt('Rename document:', currentName);
    if (!newName || newName === currentName) return;
    try {
      await supabase.from('health_documents').update({ ai_suggested_name: newName }).eq('id', docId);
      toast({ title: 'Renamed' });
      await fetchData();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to rename.' });
    }
  };

  const deleteDocument = async (docId: string, filePath: string) => {
    if (!user) return;
    try {
      // Delete extracted data first
      await supabase.from('medical_extracted_data').delete().eq('document_id', docId);
      // Delete document record
      await supabase.from('health_documents').delete().eq('id', docId).eq('user_id', user.id);
      // Delete file from storage
      await supabase.storage.from('health-documents').remove([filePath]);
      toast({ title: 'Document deleted' });
      await fetchData();
    } catch (error) {
      console.error('Delete error:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete document.' });
    }
  };

  const reanalyzeAll = async () => {
    if (!user || documents.length === 0) return;
    setReanalyzing(true);
    const total = documents.length;
    setReanalyzeProgress({ done: 0, total });
    await supabase.from('medical_extracted_data').delete().eq('user_id', user.id);

    // Process 3 documents in parallel for speed
    let done = 0;
    const batch = 3;
    for (let i = 0; i < total; i += batch) {
      const chunk = documents.slice(i, i + batch);
      await Promise.allSettled(
        chunk.map(doc =>
          supabase.functions.invoke('analyze-document', {
            body: { documentId: doc.id, filePath: doc.file_path, fileName: doc.file_name, mimeType: doc.mime_type },
          })
        )
      );
      done += chunk.length;
      setReanalyzeProgress({ done, total });
    }

    await fetchData();
    setReanalyzing(false);
  };

  const stats = useMemo(() => {
    const labResults = medicalData.filter(i => i.data_type === 'lab_result');
    const normalLabs = labResults.filter(i => i.status === 'normal' || i.status === 'expected').length;
    const abnormalLabs = labResults.filter(i => i.status === 'abnormal').length;
    const criticalLabs = labResults.filter(i => i.status === 'critical').length;
    const expectedLabs = labResults.filter(i => i.status === 'expected').length;

    const activeConditions = medicalData.filter(i => i.data_type === 'condition' && i.status === 'active');
    const activeMedications = medicalData.filter(i => i.data_type === 'medication' && i.status === 'active');

    // Group labs by panel
    const labsByPanel: Record<string, MedicalDataItem[]> = {};
    labResults.forEach(lab => {
      const rawData = lab.raw_data as any;
      const panel = rawData?.panel || 'Other Tests';
      if (!labsByPanel[panel]) labsByPanel[panel] = [];
      labsByPanel[panel].push(lab);
    });

    // Sort panels: panels with issues first
    const sortedPanels = Object.entries(labsByPanel).sort((a, b) => {
      const aHasIssue = a[1].some(l => l.status === 'critical' || l.status === 'abnormal');
      const bHasIssue = b[1].some(l => l.status === 'critical' || l.status === 'abnormal');
      if (aHasIssue && !bHasIssue) return -1;
      if (!aHasIssue && bHasIssue) return 1;
      return 0;
    });

    // Lab trends
    const labsWithValues = labResults
      .filter(l => l.value && !isNaN(parseFloat(l.value)) && l.date_recorded)
      .map(l => ({
        ...l,
        numVal: parseFloat(l.value!),
        rawData: l.raw_data as any,
      }));

    const labsByTitle: Record<string, typeof labsWithValues> = {};
    labsWithValues.forEach(l => {
      const key = l.title;
      if (!labsByTitle[key]) labsByTitle[key] = [];
      labsByTitle[key].push(l);
    });

    const labTrendData: Record<string, { data: { date: string; value: number; refLow: number | null; refHigh: number | null }[]; unit: string; latestStatus: string | null }> = {};
    Object.entries(labsByTitle).forEach(([title, labs]) => {
      const sorted = [...labs].sort((a, b) => new Date(a.date_recorded!).getTime() - new Date(b.date_recorded!).getTime());
      const parseRange = (r: string | null) => {
        if (!r) return { low: null, high: null };
        const m = r.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
        return m ? { low: parseFloat(m[1]), high: parseFloat(m[2]) } : { low: null, high: null };
      };
      labTrendData[title] = {
        data: sorted.map(l => {
          const { low, high } = parseRange(l.reference_range);
          return { date: format(new Date(l.date_recorded!), 'MMM d, yy'), value: l.numVal, refLow: low, refHigh: high };
        }),
        unit: sorted[0].unit || '',
        latestStatus: sorted[sorted.length - 1].status,
      };
    });

    const repeatedTests = Object.entries(labTrendData).filter(([, info]) => info.data.length >= 2);

    // Predictions
    const predictions: { title: string; trend: 'improving' | 'worsening' | 'stable'; detail: string }[] = [];
    repeatedTests.forEach(([title, info]) => {
      const vals = info.data.map(d => d.value);
      const first = vals[0];
      const last = vals[vals.length - 1];
      const refHigh = info.data[info.data.length - 1].refHigh;
      const refLow = info.data[info.data.length - 1].refLow;
      const changePct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;

      let trend: 'improving' | 'worsening' | 'stable' = 'stable';
      let detail = '';

      if (refHigh !== null && refLow !== null) {
        const isInRange = last >= refLow && last <= refHigh;
        const wasInRange = first >= refLow && first <= refHigh;
        if (!wasInRange && isInRange) { trend = 'improving'; detail = 'Back to a healthy range — great progress!'; }
        else if (wasInRange && !isInRange) { trend = 'worsening'; detail = 'Moved outside the healthy range — worth discussing with your doctor.'; }
        else if (Math.abs(changePct) <= 5) { detail = isInRange ? 'Staying steady in a healthy range.' : 'Still outside the healthy range, but stable.'; }
        else if (isInRange) { detail = `Changed ${Math.abs(changePct)}% but still healthy.`; }
        else {
          const movingToward = (last > refHigh && changePct < 0) || (last < refLow && changePct > 0);
          trend = movingToward ? 'improving' : 'worsening';
          detail = movingToward ? 'Moving toward the healthy range — heading in the right direction.' : 'Moving further from the healthy range — talk to your doctor.';
        }
      } else {
        detail = Math.abs(changePct) <= 5 ? 'Staying stable.' : `Changed ${Math.abs(changePct)}% across ${info.data.length} readings.`;
      }

      predictions.push({ title, trend, detail });
    });

    predictions.sort((a, b) => {
      const order = { worsening: 0, improving: 1, stable: 2 };
      return order[a.trend] - order[b.trend];
    });

    // Health score
    const overallHealthScore = labResults.length > 0 ? Math.round((normalLabs / labResults.length) * 100) : null;

    // Checkup timing
    const sortedDates = documents.filter(d => d.uploaded_at).map(d => new Date(d.uploaded_at!)).sort((a, b) => a.getTime() - b.getTime());
    let avgDaysBetweenDocs: number | null = null;
    let nextCheckupEstimate: Date | null = null;
    if (sortedDates.length >= 2) {
      const gaps = [];
      for (let i = 1; i < sortedDates.length; i++) gaps.push(differenceInDays(sortedDates[i], sortedDates[i - 1]));
      avgDaysBetweenDocs = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
      nextCheckupEstimate = addDays(sortedDates[sortedDates.length - 1], avgDaysBetweenDocs);
    }
    const daysSinceLastDoc = sortedDates.length > 0 ? differenceInDays(new Date(), sortedDates[sortedDates.length - 1]) : null;

    // Status pie
    const labStatusPie = [
      { name: 'All good', value: normalLabs - expectedLabs, color: '#22c55e' },
      { name: 'Normal for you', value: expectedLabs, color: '#3b82f6' },
      { name: 'Worth discussing', value: abnormalLabs, color: '#f59e0b' },
      { name: 'Needs attention', value: criticalLabs, color: '#ef4444' },
    ].filter(d => d.value > 0);

    return {
      labResults, normalLabs, abnormalLabs, criticalLabs, expectedLabs,
      activeConditions, activeMedications,
      labsByPanel: sortedPanels,
      labTrendData, repeatedTests, predictions,
      overallHealthScore, labStatusPie,
      avgDaysBetweenDocs, nextCheckupEstimate, daysSinceLastDoc,
    };
  }, [medicalData, documents]);

  const flaggedItems = useMemo(() =>
    [...medicalData]
      .filter(i => i.status === 'abnormal' || i.status === 'critical')
      .sort((a, b) => (priorityOrder[(a.raw_data as any)?.priority || 'low'] ?? 2) - (priorityOrder[(b.raw_data as any)?.priority || 'low'] ?? 2)),
    [medicalData]
  );

  const analyzedDocs = documents.filter(d => d.ai_summary);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hasData = medicalData.length > 0;
  const hasDocuments = documents.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">My Health Records</h1>
            <p className="text-sm text-muted-foreground">Your results explained in plain language</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
            Dashboard
          </Button>
          <button type="button" onClick={() => { window.location.href = '/'; }} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
            Womanie
          </button>
        </div>
      </div>

      <div className="px-4 py-6 max-w-4xl mx-auto space-y-6">
        {hasDocuments && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">My Documents ({documents.length})</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={reanalyzeAll}
                disabled={reanalyzing}
              >
                {reanalyzing ? (
                  <>Analyzing {reanalyzeProgress.done}/{reanalyzeProgress.total}…</>
                ) : (
                  <>🔄 Re-analyze all</>
                )}
              </Button>
            </div>
            {reanalyzing && (
              <Progress value={reanalyzeProgress.total > 0 ? (reanalyzeProgress.done / reanalyzeProgress.total) * 100 : 0} className="h-1.5" />
            )}
            <div className="space-y-1.5">
              {documents.map(doc => {
                const docResults = medicalData.filter(m => m.document_id === doc.id);
                const abnormals = docResults.filter(m => m.status === 'abnormal' || m.status === 'critical').length;
                return (
                  <div key={doc.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 group">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      abnormals > 0 ? 'bg-amber-500' : docResults.length > 0 ? 'bg-green-500' : 'bg-muted-foreground'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{doc.ai_suggested_name || doc.file_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {doc.uploaded_at ? format(new Date(doc.uploaded_at), 'MMM d, yyyy') : ''}
                        {docResults.length > 0 && ` • ${docResults.length} results`}
                        {abnormals > 0 && ` • ${abnormals} flagged`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                      onClick={() => renameDocument(doc.id, doc.ai_suggested_name || doc.file_name)}
                      aria-label="Rename document"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      onClick={() => {
                        if (window.confirm(`Delete "${doc.ai_suggested_name || doc.file_name}"?`)) {
                          deleteDocument(doc.id, doc.file_path);
                        }
                      }}
                      aria-label="Delete document"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
        <DocumentUpload />

        {/* Section quick nav — only show when there's data */}
        {hasData && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {[
              { id: 'snapshot', label: 'Snapshot' },
              { id: 'categories', label: 'Categories' },
              { id: 'insights', label: 'Insights' },
              ...(flaggedItems.length > 0 ? [{ id: 'attention', label: 'Attention' }] : []),
              ...(stats.labsByPanel.length > 0 ? [{ id: 'results', label: 'Results' }] : []),
              ...(stats.repeatedTests.length > 0 ? [{ id: 'trends', label: 'Trends' }] : []),
              { id: 'documents', label: 'Documents' },
            ].map(section => (
              <button
                key={section.id}
                onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors whitespace-nowrap font-medium text-muted-foreground"
              >
                {section.label}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-6">
          {/* ============ MAIN CONTENT — SINGLE SCROLLABLE PAGE ============ */}
            {!hasDocuments ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-foreground text-center mb-2 font-semibold text-lg">Upload your first document</p>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Upload lab results, prescriptions, or medical reports. We'll analyze them and explain everything in plain language.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Quick Summary — friendly language */}
                {hasData && stats.labResults.length > 0 && (
                  <Card id="snapshot" className="overflow-hidden scroll-mt-20">
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Heart className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h2 className="font-bold text-base">Your Health Snapshot</h2>
                          <p className="text-xs text-muted-foreground">Based on {stats.labResults.length} test results</p>
                        </div>
                      </div>

                      {/* Traffic light summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-green-200 dark:border-green-800">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-base">✅</span>
                            <span className="text-xs font-medium text-green-700 dark:text-green-400">All good</span>
                          </div>
                          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.normalLabs}</p>
                          <p className="text-[10px] text-green-600/70 dark:text-green-500/70">results look healthy</p>
                        </div>
                        {stats.expectedLabs > 0 && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-base">💙</span>
                              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Normal for you</span>
                            </div>
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.expectedLabs}</p>
                            <p className="text-[10px] text-blue-600/70 dark:text-blue-500/70">expected for your stage</p>
                          </div>
                        )}
                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-base">⚠️</span>
                            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Worth discussing</span>
                          </div>
                          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.abnormalLabs}</p>
                          <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70">ask your doctor</p>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 border border-red-200 dark:border-red-800">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-base">🔴</span>
                            <span className="text-xs font-medium text-red-700 dark:text-red-400">Needs attention</span>
                          </div>
                          <p className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.criticalLabs}</p>
                          <p className="text-[10px] text-red-600/70 dark:text-red-500/70">talk to doctor soon</p>
                        </div>
                      </div>

                      {/* Health score bar */}
                      {stats.overallHealthScore !== null && (
                        <div className="mt-4 bg-muted/30 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-muted-foreground">Overall wellness score</span>
                            <span className={`text-sm font-bold ${
                              stats.overallHealthScore >= 80 ? 'text-green-600' : stats.overallHealthScore >= 50 ? 'text-amber-600' : 'text-red-600'
                            }`}>{stats.overallHealthScore}%</span>
                          </div>
                          <Progress value={stats.overallHealthScore} className="h-2.5" />
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            {stats.overallHealthScore >= 80 ? '🌟 Most of your results look great!' :
                             stats.overallHealthScore >= 50 ? '💬 Some results need a conversation with your doctor.' :
                             '⚕️ Several results need medical attention. Please consult your doctor.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* ============ DOCUMENT-CYCLE CONNECTION ALERT ============ */}
                <DocumentCycleAlert
                  medicalData={medicalData}
                  lifeStage={lifeStage}
                  onSwitchMode={async (mode) => {
                    if (!user) return;
                    try {
                      await supabase.from('profiles').update({ life_stage: mode }).eq('id', user.id);
                      setLifeStage(mode);
                      toast({ title: 'Mode updated!', description: `Switching to ${mode.replace('-', ' ')} mode...` });
                      setTimeout(() => { window.location.href = '/dashboard'; }, 1000);
                    } catch {
                      toast({ variant: 'destructive', title: 'Error', description: 'Failed to switch mode.' });
                    }
                  }}
                />

                {/* ============ VISUAL RANGE CHART ============ */}
                <ResultsRangeChart medicalData={medicalData} />

                {/* ============ CUSTOM HEALTH ANALYSIS COMPONENTS ============ */}
                {/* IMPORTANT: Do NOT remove these components. They are custom-built   */}
                {/* and live in src/components/dashboard/. They provide health category */}
                {/* scoring, cycle analysis, cross-referenced insights, smart           */}
                {/* recommendations, and test comparison tables.                        */}

                {/* Health by body system category with per-category scores */}
                <div id="categories" className="scroll-mt-20">
                <HealthCategories medicalData={medicalData} />
                </div>

                {/* Suggests cycle tracker updates based on hormone lab results */}
                <CycleUpdateSuggestions labResults={stats.labResults} lifeStage={lifeStage} onUpdateCycle={handleCycleUpdate} />

                {/* Detects cycle phase from hormones and explains what each means */}
                <CycleImpactSection labResults={stats.labResults} lifeStage={lifeStage} />

                {/* Cross-references multiple test results to surface health patterns */}
                <div id="insights" className="scroll-mt-20">
                <PersonalizedInsights medicalData={medicalData} lifeStage={lifeStage} />
                </div>

                {/* Smart recommendations: missing tests, stale results, retests needed */}
                <SmartRecommendations medicalData={medicalData} lifeStage={lifeStage} />

                {/* ============ END CUSTOM HEALTH ANALYSIS ============ */}

                {/* ⚠️ Things that need attention — front and center */}
                {flaggedItems.length > 0 && (
                  <div id="attention" className="scroll-mt-20">
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <Eye className="h-4 w-4 text-amber-600" />
                      Things to discuss with your doctor
                    </h3>
                    <div className="space-y-3">
                      {flaggedItems.map(item => (
                        <ResultCard key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Active conditions & medications — friendly */}
                {(stats.activeConditions.length > 0 || stats.activeMedications.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stats.activeConditions.length > 0 && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Stethoscope className="h-4 w-4 text-primary" />
                            <span className="text-sm font-bold">Current Conditions</span>
                          </div>
                          <div className="space-y-2">
                            {stats.activeConditions.map(item => (
                              <div key={item.id} className="bg-primary/5 rounded-xl px-3 py-2.5 border border-primary/10">
                                <span className="text-sm font-medium">📌 {item.title}</span>
                                {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {stats.activeMedications.length > 0 && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Pill className="h-4 w-4 text-primary" />
                            <span className="text-sm font-bold">Your Medications</span>
                          </div>
                          <div className="space-y-2">
                            {stats.activeMedications.map(item => (
                              <div key={item.id} className="bg-primary/5 rounded-xl px-3 py-2.5 border border-primary/10">
                                <span className="text-sm font-medium">💊 {item.title}</span>
                                {item.value && <span className="text-xs text-muted-foreground ml-2">{item.value}</span>}
                                {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {/* All results grouped by panel — collapsible, friendly */}
                {stats.labsByPanel.length > 0 && (
                  <div id="results" className="scroll-mt-20">
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <FlaskConical className="h-4 w-4 text-primary" />
                      All Your Test Results
                    </h3>
                    <div className="space-y-3">
                      {stats.labsByPanel.map(([panelName, labs]) => {
                        const hasIssues = labs.some(l => l.status === 'critical' || l.status === 'abnormal');
                        const allGood = labs.every(l => l.status === 'normal' || l.status === 'expected');
                        const isExpanded = expandedPanels.has(panelName);

                        return (
                          <Card key={panelName} className={`overflow-hidden ${hasIssues ? 'border-amber-200 dark:border-amber-900/30' : ''}`}>
                            <button
                              onClick={() => togglePanel(panelName)}
                              className="w-full p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors text-left"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-lg">
                                  {hasIssues ? '⚠️' : allGood ? '✅' : 'ℹ️'}
                                </span>
                                <div>
                                  <span className="text-sm font-semibold">{panelName}</span>
                                  <p className="text-[11px] text-muted-foreground">
                                    {labs.length} test{labs.length !== 1 ? 's' : ''} — {
                                      hasIssues
                                        ? `${labs.filter(l => l.status === 'abnormal' || l.status === 'critical').length} need${labs.filter(l => l.status === 'abnormal' || l.status === 'critical').length === 1 ? 's' : ''} review`
                                        : 'all look good'
                                    }
                                  </p>
                                </div>
                              </div>
                              <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                            {isExpanded && (
                              <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                                {labs
                                  .sort((a, b) => {
                                    const aPri = (a.raw_data as any)?.priority || 'low';
                                    const bPri = (b.raw_data as any)?.priority || 'low';
                                    return (priorityOrder[aPri] ?? 2) - (priorityOrder[bPri] ?? 2);
                                  })
                                  .map(lab => (
                                    <ResultCard key={lab.id} item={lab} />
                                  ))
                                }
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AI Summaries */}
                {analyzedDocs.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      AI Summary of Your Documents
                    </h3>
                    <div className="space-y-3">
                      {analyzedDocs.map((doc) => (
                        <Card key={doc.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <FileText className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                  <h4 className="text-sm font-semibold">{doc.ai_suggested_name || doc.file_name}</h4>
                                  {doc.uploaded_at && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                                    </span>
                                  )}
                                </div>
                                <div className="bg-muted/30 rounded-xl p-4 border border-border/30">
                                  {doc.ai_summary && renderEnhancedSummary(doc.ai_summary)}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* ============ RESULTS BREAKDOWN PIE CHART ============ */}
                {stats.labStatusPie.length > 0 && (
                  <Card className="overflow-hidden">
                    <CardContent className="p-5">
                      <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        Results Breakdown
                      </h3>
                      <div className="flex items-center gap-6">
                        <ResponsiveContainer width={120} height={120}>
                          <RechartsPie>
                            <Pie data={stats.labStatusPie} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                              {stats.labStatusPie.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                              ))}
                            </Pie>
                          </RechartsPie>
                        </ResponsiveContainer>
                        <div className="flex-1 space-y-2">
                          {stats.labStatusPie.map((entry, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                              <span className="text-xs text-muted-foreground flex-1">{entry.name}</span>
                              <span className="text-xs font-bold">{entry.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ============ TEST COMPARISON & TRENDS ============ */}
                <div id="trends" className="scroll-mt-20">
                <TestComparisonTable medicalData={medicalData} />
                </div>

                {/* ============ TRENDS & PREDICTIONS (INLINE) ============ */}
                {stats.repeatedTests.length > 0 && (
                  <>
                {/* Predictions — friendly language */}
                {stats.predictions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      How your results are changing
                    </h3>
                    <div className="space-y-2">
                      {stats.predictions.map(p => (
                        <Card key={p.title} className={`overflow-hidden ${
                          p.trend === 'worsening' ? 'border-amber-200 dark:border-amber-900/30' :
                          p.trend === 'improving' ? 'border-green-200 dark:border-green-900/30' : ''
                        }`}>
                          <CardContent className="p-3.5 flex items-center gap-3">
                            <span className="text-xl">
                              {p.trend === 'improving' ? '📈' : p.trend === 'worsening' ? '📉' : '➡️'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{getFriendlyName(p.title)}</p>
                              <p className="text-xs text-muted-foreground">{p.detail}</p>
                            </div>
                            <Badge variant="outline" className={`text-[10px] ${
                              p.trend === 'improving' ? 'text-green-600 border-green-300' :
                              p.trend === 'worsening' ? 'text-amber-600 border-amber-300' :
                              'text-muted-foreground'
                            }`}>
                              {p.trend === 'improving' ? 'Getting better' : p.trend === 'worsening' ? 'Getting worse' : 'Stable'}
                            </Badge>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline charts — for repeated tests with trend lines */}
                {stats.repeatedTests.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Test Trends Over Time
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Tests with multiple readings. Green area = healthy range. Dashed dot = predicted next value.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {stats.repeatedTests.map(([title, info]) => {
                        const hasRefRange = info.data.some(d => d.refLow !== null && d.refHigh !== null);
                        const refLow = info.data.find(d => d.refLow !== null)?.refLow ?? undefined;
                        const refHigh = info.data.find(d => d.refHigh !== null)?.refHigh ?? undefined;
                        const latestVal = info.data[info.data.length - 1].value;
                        const firstVal = info.data[0].value;
                        const changePct = firstVal > 0 ? Math.round(((latestVal - firstVal) / firstVal) * 100) : 0;
                        const statusInfo = getStatusInfo(info.latestStatus);

                        // Prediction
                        let predictedNext: number | null = null;
                        if (info.data.length >= 3) {
                          const vals = info.data.map(d => d.value);
                          const avgChange = (vals[vals.length - 1] - vals[0]) / (vals.length - 1);
                          predictedNext = Math.round((vals[vals.length - 1] + avgChange) * 100) / 100;
                        }

                        return (
                          <Card key={title}>
                            <CardHeader className="pb-1">
                              <CardTitle className="text-xs flex items-center justify-between">
                                <span className="truncate">{getFriendlyName(title)}</span>
                                <span className={`font-mono text-sm font-bold ${statusInfo.color}`}>
                                  {latestVal}{info.unit ? ` ${info.unit}` : ''}
                                </span>
                              </CardTitle>
                              <p className="text-[10px] text-muted-foreground">
                                {info.data.length} readings • {changePct > 0 ? '+' : ''}{changePct}% change
                              </p>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <ResponsiveContainer width="100%" height={140}>
                                <ComposedChart data={[
                                  ...info.data,
                                  ...(predictedNext !== null ? [{ date: 'Next?', value: predictedNext, refLow: refLow ?? null, refHigh: refHigh ?? null }] : [])
                                ]} margin={{ left: 0, right: 5, top: 5, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                                  <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                                  {hasRefRange && refLow !== undefined && refHigh !== undefined && (
                                    <ReferenceArea y1={refLow} y2={refHigh} fill="#22c55e" fillOpacity={0.08} label={{ value: "Healthy", position: "insideTopLeft", fontSize: 8, fill: "#22c55e" }} />
                                  )}
                                  <Tooltip
                                    content={({ active, payload }) => {
                                      if (!active || !payload?.length) return null;
                                      const d = payload[0].payload;
                                      const isPredicted = d.date === 'Next?';
                                      return (
                                        <div className="bg-background border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
                                          <p className={isPredicted ? 'text-primary font-medium' : ''}>
                                            {isPredicted ? '🔮 Predicted' : d.date}: <span className="font-bold">{d.value}{info.unit ? ` ${info.unit}` : ''}</span>
                                          </p>
                                          {d.refLow !== null && <p className="text-muted-foreground">Healthy range: {d.refLow}–{d.refHigh}</p>}
                                        </div>
                                      );
                                    }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="value"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    dot={(props: any) => {
                                      const { cx, cy, payload } = props;
                                      if (payload.date === 'Next?') {
                                        return <circle key="predicted" cx={cx} cy={cy} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 2" opacity={0.4} />;
                                      }
                                      return <circle key={payload.date} cx={cx} cy={cy} r={3} fill="hsl(var(--primary))" />;
                                    }}
                                  />
                                </ComposedChart>
                              </ResponsiveContainer>
                              {predictedNext !== null && (
                                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                  <span className="text-primary">🔮</span> We predict your next result could be around <span className="font-bold">{predictedNext}{info.unit ? ` ${info.unit}` : ''}</span>
                                  {hasRefRange && refLow !== undefined && refHigh !== undefined && (
                                    <span className={predictedNext >= refLow && predictedNext <= refHigh ? 'text-green-600' : 'text-amber-600'}>
                                      ({predictedNext >= refLow && predictedNext <= refHigh ? 'in the healthy range' : 'outside healthy range'})
                                    </span>
                                  )}
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Single readings — with visual range bars */}
                {Object.entries(stats.labTrendData).filter(([, info]) => info.data.length === 1).length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-1">Single Readings</h3>
                    <p className="text-xs text-muted-foreground mb-3">Upload more documents with the same tests to see trends and predictions.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.entries(stats.labTrendData)
                        .filter(([, info]) => info.data.length === 1)
                        .sort(([, a], [, b]) => {
                          const order: Record<string, number> = { critical: 0, abnormal: 1, expected: 2, normal: 3 };
                          return (order[a.latestStatus || 'normal'] ?? 3) - (order[b.latestStatus || 'normal'] ?? 3);
                        })
                        .map(([title, info]) => {
                          const d = info.data[0];
                          const statusInfo = getStatusInfo(info.latestStatus);
                          const refLow = d.refLow;
                          const refHigh = d.refHigh;
                          const hasRange = refLow !== null && refHigh !== null;

                          // Calculate bar position
                          let barPercent = 50;
                          if (hasRange && refLow !== null && refHigh !== null) {
                            const range = refHigh - refLow;
                            const ext = range * 0.3;
                            barPercent = Math.max(0, Math.min(100, ((d.value - (refLow - ext)) / (range + ext * 2)) * 100));
                          }

                          return (
                            <Card key={title} className={`p-3.5 ${
                              info.latestStatus === 'critical' ? 'border-red-200 dark:border-red-900/30' :
                              info.latestStatus === 'abnormal' ? 'border-amber-200 dark:border-amber-900/30' : ''
                            }`}>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate">{getFriendlyName(title)}</p>
                                  <p className="text-[10px] text-muted-foreground">{d.date}</p>
                                </div>
                                <div className="text-right">
                                  <p className={`text-base font-mono font-bold ${statusInfo.color}`}>
                                    {d.value}{info.unit ? ` ${info.unit}` : ''}
                                  </p>
                                  <div className="flex items-center gap-1 justify-end">
                                    <span className="text-[10px]">{statusInfo.emoji}</span>
                                    <span className={`text-[10px] ${statusInfo.color}`}>{statusInfo.label}</span>
                                  </div>
                                </div>
                              </div>
                              {hasRange && (
                                <div className="space-y-0.5">
                                  <div className="h-3 bg-muted rounded-full overflow-hidden relative">
                                    <div className="absolute top-0 bottom-0 bg-green-200/60 dark:bg-green-900/30 rounded-full" style={{ left: '23%', width: '54%' }} />
                                    <div
                                      className={`absolute top-0.5 bottom-0.5 w-2 rounded-full shadow-sm ${
                                        info.latestStatus === 'critical' ? 'bg-red-500' :
                                        info.latestStatus === 'abnormal' ? 'bg-amber-500' : 'bg-green-500'
                                      }`}
                                      style={{ left: `calc(${barPercent}% - 4px)` }}
                                    />
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-[9px] text-muted-foreground">{refLow}</span>
                                    <span className="text-[9px] text-green-600">Healthy range</span>
                                    <span className="text-[9px] text-muted-foreground">{refHigh}</span>
                                  </div>
                                </div>
                              )}
                            </Card>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Checkup timing */}
                {documents.length >= 2 && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="h-4 w-4 text-primary" />
                        <span className="text-sm font-bold">Your Checkup Pattern</span>
                      </div>
                      <div className="space-y-2">
                        {stats.avgDaysBetweenDocs !== null && (
                          <p className="text-sm text-muted-foreground">
                            📊 You typically get checked every <span className="font-semibold text-foreground">{stats.avgDaysBetweenDocs} days</span>
                          </p>
                        )}
                        {stats.daysSinceLastDoc !== null && (
                          <p className="text-sm text-muted-foreground">
                            📅 Your last document was <span className="font-semibold text-foreground">{stats.daysSinceLastDoc} days ago</span>
                          </p>
                        )}
                        {stats.nextCheckupEstimate && (
                          <p className="text-sm">
                            {differenceInDays(stats.nextCheckupEstimate, new Date()) > 0
                              ? <>🗓️ Your next checkup might be around <span className="font-semibold text-primary">{format(stats.nextCheckupEstimate, 'MMMM d, yyyy')}</span></>
                              : <>⏰ You might be <span className="font-semibold text-amber-600">{Math.abs(differenceInDays(stats.nextCheckupEstimate, new Date()))} days overdue</span> for a checkup</>
                            }
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
                  </>
                )}

                {/* ============ HEALTH TIMELINE ============ */}
                <div id="documents" className="scroll-mt-20">
                  <HealthTimeline documents={documents} medicalData={medicalData} />
                </div>

                {/* ============ UPLOADED DOCUMENTS (detailed) ============ */}
                {documents.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      Document Details ({documents.length})
                    </h3>
                    <div className="space-y-3">
              {documents.map((doc) => (
                <Card key={doc.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm flex-1">{doc.ai_suggested_name || doc.file_name}</h4>
                          {doc.uploaded_at && (
                            <span className="text-xs text-muted-foreground">{format(new Date(doc.uploaded_at), 'MMMM d, yyyy')}</span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (window.confirm(`Delete "${doc.ai_suggested_name || doc.file_name}"? This will also remove all extracted results.`)) {
                                deleteDocument(doc.id, doc.file_path);
                              }
                            }}
                            aria-label="Delete document"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {doc.ai_summary && (
                          <div className="bg-muted/30 rounded-xl p-4 mt-3 border border-border/30">
                            {renderEnhancedSummary(doc.ai_summary)}
                          </div>
                        )}
                        {medicalData.filter(m => m.document_id === doc.id).length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">What we found</p>
                            {medicalData.filter(m => m.document_id === doc.id)
                              .sort((a, b) => (priorityOrder[(a.raw_data as any)?.priority || 'low'] ?? 2) - (priorityOrder[(b.raw_data as any)?.priority || 'low'] ?? 2))
                              .map(item => {
                                const si = getStatusInfo(item.status);
                                return (
                                  <div key={item.id} className="flex items-center gap-2 text-xs py-0.5">
                                    <span>{si.emoji}</span>
                                    <span className="font-medium">{item.title}</span>
                                    {item.value && <span className="text-muted-foreground font-mono">{item.value}{item.unit ? ` ${item.unit}` : ''}</span>}
                                    <span className={`text-[10px] ${si.color}`}>{si.label}</span>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
                    </div>
                  </div>
                )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
