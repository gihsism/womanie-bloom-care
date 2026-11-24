import { Shield, Lock, Award, Upload, Brain, TrendingUp } from 'lucide-react';
import { IconRows, PublicSection } from '@/components/public/PublicUI';

const WhatIsWomanie = () => {
  const steps = [
    {
      icon: Upload,
      number: '1',
      title: 'Upload your documents',
      description: 'Lab results, prescriptions, imaging reports — any medical document in PDF, image, or DOCX format.',
    },
    {
      icon: Brain,
      number: '2',
      title: 'Womanie reads every result',
      description: 'AI picks out every test result, explains what it means, and flags anything that needs attention.',
    },
    {
      icon: TrendingUp,
      number: '3',
      title: 'See what changed over time',
      description: 'Visual charts, health categories, cross-referenced patterns, and predictions — all in plain language.',
    },
  ];

  const badges = [
    { icon: Shield, label: 'Private by design' },
    { icon: Lock, label: 'Encrypted' },
    { icon: Award, label: 'Medical Board Reviewed' },
  ];

  return (
    <PublicSection id="how-it-works" title="How it works" sub="From upload to understanding in minutes. No medical degree needed.">
      <IconRows items={steps.map((s) => ({ n: Number(s.number), title: s.title, description: s.description }))} />
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-muted-foreground">
        {badges.map((badge) => (
          <li key={badge.label} className="flex items-center gap-1.5">
            <badge.icon className="h-4 w-4 text-stage-accent" aria-hidden="true" />
            {badge.label}
          </li>
        ))}
      </ul>
    </PublicSection>
  );
};

export default WhatIsWomanie;
