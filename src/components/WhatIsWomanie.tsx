import { Shield, Lock, Award } from 'lucide-react';

const WhatIsWomanie = () => {
  const badges = [
    { icon: Shield, label: 'HIPAA Compliant' },
    { icon: Lock, label: 'Bank-Level Encryption' },
    { icon: Award, label: 'Medical Board Certified' },
  ];

  return (
    <section className="py-16 lg:py-24 px-4 bg-muted/30">
      <div className="container mx-auto max-w-4xl text-center">
        <h2 className="text-3xl lg:text-5xl font-bold mb-6">
          Everything You Need for Women's Health
        </h2>
        <p className="text-lg text-muted-foreground mb-12 max-w-3xl mx-auto">
          Womanie combines intelligent cycle tracking, personalized health insights,
          direct access to medical professionals, and secure medical document management
          in one platform. Whether you're managing contraception, planning pregnancy,
          navigating IVF, or transitioning through menopause, we're with you every step
          of the way.
        </p>

        {/* Trust Badges */}
        <div className="flex flex-wrap justify-center gap-6 lg:gap-12">
          {badges.map((badge, index) => (
            <div
              key={index}
              className="flex items-center gap-3 px-6 py-3 bg-background rounded-full shadow-sm"
            >
              <badge.icon className="h-5 w-5 text-primary" />
              <span className="font-medium text-sm">{badge.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhatIsWomanie;
