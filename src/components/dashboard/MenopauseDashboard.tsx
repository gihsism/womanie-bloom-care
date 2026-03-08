import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Flame,
  Heart,
  Moon,
  Brain,
  Shield,
  Activity,
  Droplets,
  ThermometerSun,
  ChevronRight,
  CheckCircle2,
  Lightbulb,
  Bone,
  Eye,
  Pill,
  Smile,
  Salad,
  Dumbbell,
  BookOpen,
  Sparkles,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react';

const symptoms = [
  { id: 'hot-flashes', label: 'Hot Flashes', emoji: '🔥', description: 'Sudden warmth spreading through the body, often face and chest. Can last seconds to minutes.' },
  { id: 'night-sweats', label: 'Night Sweats', emoji: '🌙', description: 'Hot flashes during sleep that can drench bedding. Try breathable fabrics and a cool room.' },
  { id: 'mood-changes', label: 'Mood Changes', emoji: '🎭', description: 'Irritability, anxiety, or sadness. Hormonal shifts affect brain chemistry - this is real and valid.' },
  { id: 'sleep-issues', label: 'Sleep Disruption', emoji: '😴', description: 'Difficulty falling or staying asleep. Night sweats and hormonal changes both contribute.' },
  { id: 'brain-fog', label: 'Brain Fog', emoji: '🌫️', description: 'Forgetfulness, difficulty concentrating. Estrogen affects memory - it usually improves over time.' },
  { id: 'joint-pain', label: 'Joint Pain', emoji: '🦴', description: 'Stiffness and aching, especially in mornings. Declining estrogen affects joint lubrication.' },
  { id: 'weight-changes', label: 'Weight Changes', emoji: '⚖️', description: 'Metabolism slows and fat distribution shifts. Focus on strength training and balanced nutrition.' },
  { id: 'vaginal-dryness', label: 'Vaginal Dryness', emoji: '💧', description: 'Reduced estrogen thins vaginal tissue. Moisturizers and lubricants can help significantly.' },
];

const wellnessStrategies = [
  { icon: Dumbbell, title: 'Strength Training', tip: 'Weight-bearing exercise protects bone density and boosts metabolism. Aim for 2-3 sessions weekly.', color: 'text-primary', priority: 'Essential' },
  { icon: Salad, title: 'Anti-Inflammatory Diet', tip: 'Emphasize omega-3s, leafy greens, berries, and whole grains. Reduce sugar, alcohol, and processed foods.', color: 'text-green-600', priority: 'Essential' },
  { icon: Moon, title: 'Sleep Hygiene', tip: 'Keep bedroom cool (65-68F), use breathable bedding, maintain consistent sleep schedule.', color: 'text-indigo-500', priority: 'Essential' },
  { icon: Brain, title: 'Stress Management', tip: 'Meditation, deep breathing, and yoga can reduce hot flash frequency by up to 40%.', color: 'text-purple-500', priority: 'High' },
  { icon: Bone, title: 'Bone Health', tip: 'Get 1200mg calcium + 800IU vitamin D daily. Consider a DEXA scan for bone density baseline.', color: 'text-amber-600', priority: 'Essential' },
  { icon: Heart, title: 'Heart Health', tip: 'Estrogen loss increases cardiovascular risk. Monitor blood pressure, cholesterol, and stay active.', color: 'text-red-500', priority: 'High' },
  { icon: Eye, title: 'Regular Screenings', tip: 'Mammograms, bone density scans, thyroid checks, and cardiovascular screening become more important.', color: 'text-blue-500', priority: 'High' },
  { icon: Smile, title: 'Mental Wellness', tip: 'Join support groups, talk therapy can help. This transition is significant - support matters.', color: 'text-pink-500', priority: 'High' },
];

const stages = [
  { name: 'Perimenopause', duration: '2-10 years before', description: 'Periods become irregular. Symptoms begin as hormones fluctuate. You can still get pregnant.', color: 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700' },
  { name: 'Menopause', duration: '12 months no period', description: 'Officially reached after 12 consecutive months without a period. Average age is 51.', color: 'bg-primary/10 border-primary/30' },
  { name: 'Post-Menopause', duration: 'The rest of life', description: 'Symptoms often ease. Focus shifts to long-term health: bones, heart, and cognitive wellness.', color: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700' },
];

const mythsFacts = [
  { myth: 'Menopause means getting old', fact: 'Menopause is a natural transition, not aging. Many women feel more empowered and free after.' },
  { myth: 'Weight gain is inevitable', fact: 'Metabolism changes, but strength training and nutrition adjustments can maintain healthy weight.' },
  { myth: 'Hot flashes last forever', fact: 'Most hot flashes resolve within 2-7 years. Many strategies can reduce their severity.' },
  { myth: 'Libido disappears completely', fact: 'Desire may change but does not disappear. Communication, lubricants, and HRT can help.' },
];

export default function MenopauseDashboard() {
  const [trackedSymptoms, setTrackedSymptoms] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string | null>('symptoms');
  const [currentMythIndex, setCurrentMythIndex] = useState(0);

  const toggleSymptom = (id: string) => {
    setTrackedSymptoms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {/* Welcome Card */}
      <Card className="p-5 bg-gradient-to-br from-amber-50 via-rose-50 to-purple-50 dark:from-amber-950/30 dark:via-rose-950/30 dark:to-purple-950/30 border-amber-200/50 dark:border-amber-800/30">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-6 w-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold mb-1">Your Menopause Journey</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This is a powerful transition. Track your symptoms, learn evidence-based strategies, 
              and take charge of your health during this new chapter.
            </p>
          </div>
        </div>
      </Card>

      {/* Stages Overview */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {stages.map(stage => (
          <Card key={stage.name} className={`p-3 min-w-[160px] flex-shrink-0 border ${stage.color}`}>
            <p className="text-xs font-bold mb-0.5">{stage.name}</p>
            <p className="text-[10px] text-muted-foreground font-medium mb-1">{stage.duration}</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{stage.description}</p>
          </Card>
        ))}
      </div>

      {/* Myth Buster */}
      <Card className="p-4 border-purple-200/60 dark:border-purple-800/30 bg-purple-50/50 dark:bg-purple-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide mb-1">Myth vs Fact</p>
            <p className="text-sm font-medium text-destructive line-through mb-1">{mythsFacts[currentMythIndex].myth}</p>
            <p className="text-sm text-foreground">{mythsFacts[currentMythIndex].fact}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2"
            onClick={() => setCurrentMythIndex((currentMythIndex + 1) % mythsFacts.length)}
          >
            Next
          </Button>
        </div>
      </Card>

      {/* Section Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'symptoms', label: 'Symptoms', icon: ThermometerSun },
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

      {/* Symptom Tracker */}
      {activeSection === 'symptoms' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <ThermometerSun className="h-4 w-4" />
              Track Your Symptoms
            </h3>
            {trackedSymptoms.size > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {trackedSymptoms.size} active
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Tap symptoms you are currently experiencing to track them.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {symptoms.map((symptom) => {
              const isActive = trackedSymptoms.has(symptom.id);
              return (
                <button
                  key={symptom.id}
                  onClick={() => toggleSymptom(symptom.id)}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-primary/10 border-primary/30 shadow-sm'
                      : 'bg-card border-border hover:bg-muted/50'
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
            Evidence-Based Strategies
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {wellnessStrategies.map((strategy) => (
              <Card key={strategy.title} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <strategy.icon className={`h-5 w-5 ${strategy.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold">{strategy.title}</h4>
                      <Badge variant={strategy.priority === 'Essential' ? 'default' : 'outline'} className="text-[9px] px-1.5 py-0">
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
              {[
                { title: 'HRT: What You Need to Know', subtitle: 'Hormone replacement therapy options, risks and benefits', emoji: '💊' },
                { title: 'Nutrition After 45', subtitle: 'Foods that support bone, heart, and brain health', emoji: '🥗' },
                { title: 'Exercise for Menopause', subtitle: 'Best workouts for this life stage', emoji: '🏋️' },
                { title: 'Managing Hot Flashes', subtitle: 'Proven techniques and when to see a doctor', emoji: '🌡️' },
                { title: 'Sleep Solutions', subtitle: 'Evidence-based tips for better rest', emoji: '🛏️' },
                { title: 'Mental Health & Menopause', subtitle: 'Understanding mood changes and getting support', emoji: '🧠' },
                { title: 'Bone Health Guide', subtitle: 'DEXA scans, calcium, and prevention strategies', emoji: '🦴' },
                { title: 'When to See Your Doctor', subtitle: 'Warning signs and recommended screenings', emoji: '🩺' },
              ].map((resource) => (
                <button
                  key={resource.title}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                >
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

      {/* Talk to a Specialist CTA */}
      <Card className="p-5 bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Pill className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold mb-0.5">Considering HRT or other treatments?</h3>
            <p className="text-xs text-muted-foreground">Talk to a menopause specialist through our Doctor Chat.</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        </div>
      </Card>
    </div>
  );
}
