import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Heart,
  Moon,
  Brain,
  ThermometerSun,
  ChevronRight,
  CheckCircle2,
  Bone,
  Eye,
  Pill,
  Smile,
  Salad,
  Dumbbell,
  BookOpen,
  Sparkles,
  AlertTriangle,
  Shield,
  Activity,
  Flower2,
  HeartPulse,
  Sun,
} from 'lucide-react';

interface MenopauseDashboardProps {
  isPostMenopause?: boolean;
}

// ─── Menopause symptoms ───
const menoSymptoms = [
  { id: 'hot-flashes', label: 'Hot Flashes', emoji: '🔥', description: 'Sudden warmth spreading through body, often face and chest.' },
  { id: 'night-sweats', label: 'Night Sweats', emoji: '🌙', description: 'Hot flashes during sleep. Try breathable fabrics and a cool room.' },
  { id: 'mood-changes', label: 'Mood Changes', emoji: '🎭', description: 'Irritability, anxiety, or sadness from hormonal shifts.' },
  { id: 'sleep-issues', label: 'Sleep Disruption', emoji: '😴', description: 'Difficulty falling or staying asleep.' },
  { id: 'brain-fog', label: 'Brain Fog', emoji: '🌫️', description: 'Forgetfulness, difficulty concentrating. Usually improves over time.' },
  { id: 'joint-pain', label: 'Joint Pain', emoji: '🦴', description: 'Stiffness and aching from declining estrogen.' },
  { id: 'weight-changes', label: 'Weight Changes', emoji: '⚖️', description: 'Metabolism slows and fat distribution shifts.' },
  { id: 'vaginal-dryness', label: 'Vaginal Dryness', emoji: '💧', description: 'Reduced estrogen thins vaginal tissue. Moisturizers can help.' },
];

// ─── Post-menopause symptoms ───
const postSymptoms = [
  { id: 'bone-loss', label: 'Bone Density Loss', emoji: '🦴', description: 'Accelerated bone loss in first 5-7 years. DEXA scans are critical.' },
  { id: 'heart-risk', label: 'Heart Health', emoji: '❤️', description: 'Cardiovascular risk increases without estrogen protection.' },
  { id: 'urinary', label: 'Urinary Changes', emoji: '💧', description: 'Increased UTI risk and incontinence. Pelvic floor exercises help.' },
  { id: 'skin-hair', label: 'Skin & Hair', emoji: '✨', description: 'Thinner skin, slower collagen production, hair changes.' },
  { id: 'cognitive', label: 'Cognitive Health', emoji: '🧠', description: 'Stay mentally active — puzzles, reading, social connections protect brain health.' },
  { id: 'joint-pain', label: 'Joint Stiffness', emoji: '🤸', description: 'Low-impact movement and anti-inflammatory foods reduce stiffness.' },
  { id: 'energy', label: 'Energy Levels', emoji: '⚡', description: 'Fatigue is common. Prioritize sleep, nutrition, and gentle exercise.' },
  { id: 'mood', label: 'Emotional Wellness', emoji: '🌻', description: 'Many women feel a sense of freedom. Honor all your feelings.' },
];

const menoWellness = [
  { icon: Dumbbell, title: 'Strength Training', tip: 'Protects bone density and boosts metabolism. 2-3 sessions weekly.', priority: 'Essential' },
  { icon: Salad, title: 'Anti-Inflammatory Diet', tip: 'Omega-3s, leafy greens, berries. Reduce sugar and alcohol.', priority: 'Essential' },
  { icon: Moon, title: 'Sleep Hygiene', tip: 'Cool bedroom (65-68°F), breathable bedding, consistent schedule.', priority: 'Essential' },
  { icon: Brain, title: 'Stress Management', tip: 'Meditation and yoga can reduce hot flash frequency by up to 40%.', priority: 'High' },
  { icon: Bone, title: 'Bone Health', tip: '1200mg calcium + 800IU vitamin D daily. Consider DEXA scan.', priority: 'Essential' },
  { icon: Heart, title: 'Heart Health', tip: 'Monitor blood pressure, cholesterol. Stay active.', priority: 'High' },
];

const postWellness = [
  { icon: Bone, title: 'Bone Protection', tip: 'DEXA scan every 2 years. Weight-bearing exercise is critical. 1200mg calcium daily.', priority: 'Critical' },
  { icon: HeartPulse, title: 'Cardiovascular Care', tip: 'Annual blood pressure and cholesterol checks. 150 min moderate exercise weekly.', priority: 'Critical' },
  { icon: Dumbbell, title: 'Strength & Balance', tip: 'Resistance training 3x/week. Balance exercises prevent falls. Maintain muscle mass.', priority: 'Essential' },
  { icon: Brain, title: 'Brain Health', tip: 'Stay socially active, learn new skills, do puzzles. Mediterranean diet supports cognition.', priority: 'Essential' },
  { icon: Shield, title: 'Cancer Screening', tip: 'Regular mammograms, colonoscopy, skin checks. Follow your doctor\'s schedule.', priority: 'Critical' },
  { icon: Eye, title: 'Eye & Dental Health', tip: 'Annual eye exams for glaucoma/macular degeneration. Gum health affects heart health.', priority: 'High' },
  { icon: Salad, title: 'Nutrition Focus', tip: 'Protein at every meal for muscle. Vitamin B12, D, calcium. Fiber for gut health.', priority: 'Essential' },
  { icon: Smile, title: 'Social Connection', tip: 'Strong social ties lower dementia risk by 50%. Prioritize relationships and community.', priority: 'High' },
];

const menoMyths = [
  { myth: 'Menopause means getting old', fact: 'It\'s a natural transition, not aging. Many women feel more empowered after.' },
  { myth: 'Weight gain is inevitable', fact: 'Strength training and nutrition adjustments can maintain healthy weight.' },
  { myth: 'Hot flashes last forever', fact: 'Most resolve within 2-7 years. Many strategies reduce severity.' },
  { myth: 'Libido disappears completely', fact: 'Desire may change but doesn\'t disappear. Communication and HRT can help.' },
];

const postMyths = [
  { myth: 'Post-menopause means declining health', fact: 'With proactive care, many women are healthier and more active than ever.' },
  { myth: 'It\'s too late for exercise to help', fact: 'Starting exercise at any age builds bone, muscle, and heart health.' },
  { myth: 'You don\'t need to see a gynecologist anymore', fact: 'Regular screenings remain important for cervical, breast, and pelvic health.' },
  { myth: 'Memory loss is inevitable', fact: 'Active lifestyle, social connection, and mental stimulation protect cognitive function.' },
];

const stages = [
  { name: 'Perimenopause', duration: '2-10 years before', description: 'Periods become irregular. Symptoms begin as hormones fluctuate.' },
  { name: 'Menopause', duration: '12 months no period', description: 'After 12 consecutive months without a period. Average age is 51.' },
  { name: 'Post-Menopause', duration: 'The rest of life', description: 'Symptoms often ease. Focus shifts to long-term health prevention.' },
];

export default function MenopauseDashboard({ isPostMenopause = false }: MenopauseDashboardProps) {
  const [trackedSymptoms, setTrackedSymptoms] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string | null>('symptoms');
  const [currentMythIndex, setCurrentMythIndex] = useState(0);

  const currentSymptoms = isPostMenopause ? postSymptoms : menoSymptoms;
  const currentWellness = isPostMenopause ? postWellness : menoWellness;
  const currentMyths = isPostMenopause ? postMyths : menoMyths;

  const toggleSymptom = (id: string) => {
    setTrackedSymptoms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {/* Welcome Card */}
      <Card className={`p-5 border ${
        isPostMenopause
          ? 'bg-gradient-to-br from-green-50 via-teal-50 to-blue-50 dark:from-green-950/30 dark:via-teal-950/30 dark:to-blue-950/30 border-green-200/50 dark:border-green-800/30'
          : 'bg-gradient-to-br from-amber-50 via-rose-50 to-purple-50 dark:from-amber-950/30 dark:via-rose-950/30 dark:to-purple-950/30 border-amber-200/50 dark:border-amber-800/30'
      }`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            isPostMenopause ? 'bg-green-100 dark:bg-green-900/40' : 'bg-amber-100 dark:bg-amber-900/40'
          }`}>
            {isPostMenopause ? <Flower2 className="h-6 w-6 text-green-600" /> : <Sparkles className="h-6 w-6 text-amber-600" />}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold mb-1">
              {isPostMenopause ? 'Your Post-Menopause Wellness' : 'Your Menopause Journey'}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isPostMenopause
                ? 'Focus on long-term health, prevention, and thriving. This stage is about empowerment, not decline.'
                : 'Track your symptoms, learn evidence-based strategies, and take charge of your health during this transition.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Post-menopause: Health priorities at a glance */}
      {isPostMenopause && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Bone, label: 'Bones', emoji: '🦴', color: 'bg-primary/5' },
            { icon: HeartPulse, label: 'Heart', emoji: '❤️', color: 'bg-destructive/5' },
            { icon: Brain, label: 'Brain', emoji: '🧠', color: 'bg-secondary/10' },
          ].map(p => (
            <Card key={p.label} className={`p-3 text-center ${p.color}`}>
              <span className="text-2xl">{p.emoji}</span>
              <p className="text-xs font-bold mt-1">{p.label} Health</p>
              <p className="text-[10px] text-muted-foreground">Priority focus</p>
            </Card>
          ))}
        </div>
      )}

      {/* Stages Overview (menopause only) */}
      {!isPostMenopause && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {stages.map(stage => (
            <Card key={stage.name} className="p-3 min-w-[160px] flex-shrink-0 border">
              <p className="text-xs font-bold mb-0.5">{stage.name}</p>
              <p className="text-[10px] text-muted-foreground font-medium mb-1">{stage.duration}</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{stage.description}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Screening reminder for post-menopause */}
      {isPostMenopause && (
        <Card className="p-4 border-blue-200/60 dark:border-blue-800/30 bg-blue-50/50 dark:bg-blue-950/20">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">Screening Reminder</p>
              <p className="text-sm text-foreground">Schedule annual check-ups: mammogram, bone density scan, blood pressure, cholesterol, and blood sugar.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Myth Buster */}
      <Card className="p-4 border-purple-200/60 dark:border-purple-800/30 bg-purple-50/50 dark:bg-purple-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide mb-1">Myth vs Fact</p>
            <p className="text-sm font-medium text-destructive line-through mb-1">{currentMyths[currentMythIndex].myth}</p>
            <p className="text-sm text-foreground">{currentMyths[currentMythIndex].fact}</p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setCurrentMythIndex((currentMythIndex + 1) % currentMyths.length)}>
            Next
          </Button>
        </div>
      </Card>

      {/* Section Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'symptoms', label: isPostMenopause ? 'Health Focus' : 'Symptoms', icon: ThermometerSun },
          { id: 'wellness', label: 'Wellness', icon: Heart },
          { id: 'resources', label: 'Resources', icon: BookOpen },
        ].map(s => (
          <Button
            key={s.id}
            variant={activeSection === s.id ? 'default' : 'outline'}
            size="sm"
            className="rounded-xl text-xs gap-1.5 flex-shrink-0"
            onClick={() => setActiveSection(activeSection === s.id ? null : s.id)}
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
          </Button>
        ))}
      </div>

      {/* Symptom / Health Focus Tracker */}
      {activeSection === 'symptoms' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <ThermometerSun className="h-4 w-4" />
              {isPostMenopause ? 'Health Focus Areas' : 'Track Your Symptoms'}
            </h3>
            {trackedSymptoms.size > 0 && (
              <Badge variant="secondary" className="text-[10px]">{trackedSymptoms.size} tracked</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isPostMenopause ? 'Tap areas you want to focus on for better long-term health.' : 'Tap symptoms you are currently experiencing.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {currentSymptoms.map(symptom => {
              const isActive = trackedSymptoms.has(symptom.id);
              return (
                <button
                  key={symptom.id}
                  onClick={() => toggleSymptom(symptom.id)}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    isActive ? 'bg-primary/10 border-primary/30 shadow-sm' : 'bg-card border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{symptom.emoji}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold">{symptom.label}</h4>
                        {isActive && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{symptom.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Wellness Strategies */}
      {activeSection === 'wellness' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Heart className="h-4 w-4" />
            {isPostMenopause ? 'Longevity & Wellness' : 'Evidence-Based Strategies'}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {currentWellness.map(strategy => (
              <Card key={strategy.title} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <strategy.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold">{strategy.title}</h4>
                      <Badge variant={strategy.priority === 'Critical' ? 'destructive' : strategy.priority === 'Essential' ? 'default' : 'outline'} className="text-[9px] px-1.5 py-0">
                        {strategy.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{strategy.tip}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Resources */}
      {activeSection === 'resources' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Resources & Support
          </h3>
          <Card className="p-4">
            <div className="space-y-2">
              {(isPostMenopause ? [
                { title: 'Osteoporosis Prevention', subtitle: 'DEXA scans, calcium, exercise, and medication options', emoji: '🦴' },
                { title: 'Heart Health After Menopause', subtitle: 'Risk factors, prevention, and warning signs', emoji: '❤️' },
                { title: 'Brain Health & Cognition', subtitle: 'Protecting memory and mental sharpness', emoji: '🧠' },
                { title: 'Staying Active at Every Age', subtitle: 'Safe, effective exercise for post-menopause', emoji: '🏃‍♀️' },
                { title: 'Nutrition for Longevity', subtitle: 'Key nutrients, supplements, and meal planning', emoji: '🥗' },
                { title: 'Pelvic Floor Health', subtitle: 'Exercises and treatments for bladder health', emoji: '💪' },
                { title: 'Cancer Screening Guide', subtitle: 'What tests to get and when', emoji: '🩺' },
                { title: 'Thriving in Post-Menopause', subtitle: 'Mental health, relationships, and purpose', emoji: '🌻' },
              ] : [
                { title: 'HRT: What You Need to Know', subtitle: 'Hormone replacement therapy options, risks and benefits', emoji: '💊' },
                { title: 'Nutrition After 45', subtitle: 'Foods that support bone, heart, and brain health', emoji: '🥗' },
                { title: 'Exercise for Menopause', subtitle: 'Best workouts for this life stage', emoji: '🏋️' },
                { title: 'Managing Hot Flashes', subtitle: 'Proven techniques and when to see a doctor', emoji: '🌡️' },
                { title: 'Sleep Solutions', subtitle: 'Evidence-based tips for better rest', emoji: '🛏️' },
                { title: 'Mental Health & Menopause', subtitle: 'Understanding mood changes and getting support', emoji: '🧠' },
                { title: 'Bone Health Guide', subtitle: 'DEXA scans, calcium, and prevention strategies', emoji: '🦴' },
                { title: 'When to See Your Doctor', subtitle: 'Warning signs and recommended screenings', emoji: '🩺' },
              ]).map(resource => (
                <button key={resource.title} className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{resource.emoji}</span>
                    <div>
                      <p className="text-sm font-medium">{resource.title}</p>
                      <p className="text-xs text-muted-foreground">{resource.subtitle}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* CTA */}
      <Card className="p-5 bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Pill className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold mb-0.5">
              {isPostMenopause ? 'Questions about your health?' : 'Considering HRT or other treatments?'}
            </h3>
            <p className="text-xs text-muted-foreground">Talk to a specialist through our Doctor Chat.</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        </div>
      </Card>
    </div>
  );
}
