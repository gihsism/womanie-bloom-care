import { Shield, Upload, Brain, TrendingUp } from 'lucide-react';

const WhatIsWomanie = () => {
  const steps = [
    {
      icon: Upload,
      number: '1',
      title: 'Add a report',
      description: 'Blood tests, prescriptions, scan reports, doctor\'s letters. A PDF, a photo of the paper, or a Word file.',
    },
    {
      icon: Brain,
      number: '2',
      title: 'Claude reads it',
      description: 'Claude, an AI model, pulls out each test value, says what it measures and marks the ones outside the lab range.',
    },
    {
      icon: TrendingUp,
      number: '3',
      title: 'You see the picture',
      description: 'Values sorted by body system, charted against your earlier tests, explained without jargon.',
    },
  ];

  const badges = [
    { icon: Shield, label: 'Encrypted, and never sold' },
  ];

  return (
    <section className="py-16 lg:py-24 px-4 bg-muted/30">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">
            How it works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From the PDF in your inbox to an explanation you can follow, in a few minutes
          </p>
        </div>

        {/* 3-step process */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {steps.map((step) => (
            <div key={step.number} className="text-center">
              <div className="relative mx-auto mb-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto">
                  <step.icon className="h-8 w-8 text-white" aria-hidden="true" />
                </div>
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-background border-2 border-primary flex items-center justify-center text-xs font-bold text-primary">
                  {step.number}
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>

        {/* Trust Badges */}
        <div className="flex flex-wrap justify-center gap-4 lg:gap-8">
          {badges.map((badge, index) => (
            <div
              key={index}
              className="flex items-center gap-2.5 px-5 py-2.5 bg-background rounded-full shadow-sm border border-border"
            >
              <badge.icon className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="font-medium text-sm">{badge.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhatIsWomanie;
