import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Flower2,
  BookOpen,
  Heart,
  Sparkles,
  Shield,
  Apple,
  Moon,
  Sun,
  ChevronRight,
  CheckCircle2,
  Star,
  Lightbulb,
  Activity,
  Smile,
} from 'lucide-react';

const bodyChangesData = [
  { title: 'Breast Development', icon: '🌸', description: 'One of the first signs of puberty. Totally normal for one side to grow faster.', ageRange: '8–13 years' },
  { title: 'Growth Spurt', icon: '📏', description: 'You may grow several inches quickly. Your body needs extra nutrition and sleep.', ageRange: '9–14 years' },
  { title: 'Body Hair', icon: '🌿', description: 'Hair appears under arms and in the pubic area. This is natural and healthy.', ageRange: '9–14 years' },
  { title: 'Skin Changes', icon: '✨', description: 'Oily skin and acne may appear due to hormones. A gentle skincare routine helps.', ageRange: '10–14 years' },
  { title: 'Mood Changes', icon: '🎭', description: 'Feeling emotional is normal — hormones are fluctuating. Talking to someone helps.', ageRange: '10–14 years' },
  { title: 'Vaginal Discharge', icon: '💧', description: 'White or clear discharge is a sign your first period may be coming in 6–12 months.', ageRange: '10–14 years' },
];

const wellnessTips = [
  { icon: Apple, title: 'Nutrition', tip: 'Eat iron-rich foods like leafy greens, lean meat, and beans to prepare your body.', color: 'text-green-600' },
  { icon: Moon, title: 'Sleep', tip: 'Aim for 9–11 hours of sleep. Your body is growing and needs plenty of rest.', color: 'text-indigo-500' },
  { icon: Activity, title: 'Exercise', tip: 'Stay active with activities you enjoy — dance, swimming, cycling, or yoga.', color: 'text-primary' },
  { icon: Heart, title: 'Emotional Health', tip: 'Journaling and talking to trusted friends or family can help with big emotions.', color: 'text-pink-500' },
  { icon: Shield, title: 'Hygiene', tip: 'Use gentle unscented products. Learn about period products so you feel prepared.', color: 'text-blue-500' },
  { icon: Sun, title: 'Self-Care', tip: 'Take time for things that make you happy. Your mental health matters just as much.', color: 'text-amber-500' },
];

const periodPrepChecklist = [
  { id: 1, label: 'I know what a period is and why it happens', emoji: '📚' },
  { id: 2, label: 'I have period products ready (pads or liners)', emoji: '🎒' },
  { id: 3, label: 'I have a trusted adult I can talk to', emoji: '💬' },
  { id: 4, label: 'I know period cramps are normal', emoji: '💪' },
  { id: 5, label: 'I know periods are nothing to be embarrassed about', emoji: '🌟' },
  { id: 6, label: 'I have a small pouch/kit for school', emoji: '👛' },
];

const funFacts = [
  "Your first period is called 'menarche' (say: meh-NAR-kee).",
  'Most people get their first period between ages 10 and 15.',
  'Periods usually last 3–7 days and come every 21–35 days.',
  'The uterus is about the size of your fist!',
  'Exercise can actually help reduce cramps when you get your period.',
  "Everyone's cycle is different - there is no wrong way.",
];

export default function PreMenstrualDashboard() {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [activeSection, setActiveSection] = useState<string | null>('changes');
  const [currentFactIndex, setCurrentFactIndex] = useState(0);

  const toggleCheck = (id: number) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const readinessPercent = Math.round((checkedItems.size / periodPrepChecklist.length) * 100);

  return (
    <div className="space-y-5">
      {/* Welcome Card */}
      <Card className="p-5 bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 dark:from-pink-950/30 dark:via-purple-950/30 dark:to-indigo-950/30 border-pink-200/50 dark:border-pink-800/30">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center flex-shrink-0">
            <Flower2 className="h-6 w-6 text-pink-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold mb-1">Your Body, Your Journey 🌸</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your body is getting ready for an amazing change. Here you'll learn what to expect, 
              how to feel prepared, and why everything you're experiencing is perfectly normal.
            </p>
          </div>
        </div>
      </Card>

      {/* Fun Fact Card */}
      <Card className="p-4 border-amber-200/60 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">Did you know?</p>
            <p className="text-sm">{funFacts[currentFactIndex]}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2"
            onClick={() => setCurrentFactIndex((currentFactIndex + 1) % funFacts.length)}
          >
            Next →
          </Button>
        </div>
      </Card>

      {/* Section Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'changes', label: 'Body Changes', icon: Sparkles },
          { id: 'wellness', label: 'Wellness', icon: Heart },
          { id: 'prep', label: 'Period Prep', icon: Shield },
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

      {/* Body Changes */}
      {activeSection === 'changes' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            What's Happening to My Body?
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {bodyChangesData.map((item) => (
              <Card key={item.title} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{item.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-semibold">{item.title}</h4>
                      <Badge variant="outline" className="text-[10px] px-1.5">{item.ageRange}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Wellness Tips */}
      {activeSection === 'wellness' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Wellness & Self-Care
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {wellnessTips.map((tip) => (
              <Card key={tip.title} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <tip.icon className={`h-4.5 w-4.5 ${tip.color}`} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold mb-1">{tip.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{tip.tip}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Period Prep Checklist */}
      {activeSection === 'prep' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Period Readiness Checklist
          </h3>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Your readiness</span>
              <span className="text-sm font-bold text-primary">{readinessPercent}%</span>
            </div>
            <Progress value={readinessPercent} className="h-2 mb-4" />

            <div className="space-y-2">
              {periodPrepChecklist.map((item) => {
                const isChecked = checkedItems.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleCheck(item.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                      isChecked
                        ? 'bg-primary/10 border border-primary/20'
                        : 'bg-muted/40 border border-transparent hover:bg-muted/60'
                    }`}
                  >
                    <span className="text-lg">{item.emoji}</span>
                    <span className={`flex-1 text-sm ${isChecked ? 'font-medium' : ''}`}>
                      {item.label}
                    </span>
                    {isChecked && <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            {readinessPercent === 100 && (
              <div className="mt-4 p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/40 text-center">
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                  🎉 You're prepared! You've got this!
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Quick Resources */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Learn More
        </h3>
        <div className="space-y-2">
          {[
            { title: 'What is a period?', subtitle: 'The basics explained simply' },
            { title: 'Puberty timeline', subtitle: 'What happens and when' },
            { title: 'How to talk to parents', subtitle: 'Starting the conversation' },
            { title: 'Period products guide', subtitle: 'Pads, tampons & more' },
          ].map((resource) => (
            <button
              key={resource.title}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-medium">{resource.title}</p>
                <p className="text-xs text-muted-foreground">{resource.subtitle}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
