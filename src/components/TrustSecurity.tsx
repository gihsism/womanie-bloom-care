import { Shield, Lock, UserCheck, Stethoscope } from 'lucide-react';

const TrustSecurity = () => {
  const features = [
    {
      icon: Shield,
      title: 'Your data, not ours',
      description:
        'We never sell it. Download everything or delete your account from Settings at any time.',
    },
    {
      icon: Lock,
      title: 'Encrypted Data',
      description:
        'Your data is encrypted on the way to our servers and while it is stored there.',
    },
    {
      icon: UserCheck,
      title: 'You decide who sees it',
      description:
        'A doctor sees your records only after you approve their request, and you can stop sharing later.',
    },
    {
      icon: Stethoscope,
      title: 'Where the facts come from',
      description:
        'Our health guidance follows published clinical sources such as ACOG and the CDC.',
    },
  ];

  return (
    <section className="py-16 lg:py-24 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">
            What happens to your data
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Health data is personal. Here is plainly what we do with yours, and what we never do.
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
