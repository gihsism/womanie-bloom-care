import { Shield, Lock, UserCheck, Stethoscope } from 'lucide-react';

const TrustSecurity = () => {
  const features = [
    {
      icon: Shield,
      title: 'Private by Design',
      description:
        'Your health data belongs to you. We never sell it, and you can export or delete it at any time.',
    },
    {
      icon: Lock,
      title: 'Encrypted Data',
      description:
        'Your health data is encrypted in transit and at rest, so it stays secure.',
    },
    {
      icon: UserCheck,
      title: 'You Control Sharing',
      description:
        'Decide exactly what data to share with doctors, partners, or family members.',
    },
    {
      icon: Stethoscope,
      title: 'Evidence-Based Content',
      description:
        'Health content is guided by clinical references from ACOG, CDC, and other leading medical sources.',
    },
  ];

  return (
    <section className="py-16 lg:py-24 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">
            Your Privacy, Our Priority
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We understand the sensitivity of your health data. That's why security and privacy are built into everything we do.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <div key={index} className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-accent/20 to-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <feature.icon className="h-8 w-8 text-accent" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustSecurity;
