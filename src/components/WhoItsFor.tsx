import { Pill, Baby, HeartPulse, Microscope, Flame } from 'lucide-react';

const WhoItsFor = () => {
  const journeys = [
    {
      icon: Pill,
      title: 'Contraception',
      description:
        'Track your birth control, manage side effects, and get expert guidance on the best options for you.',
    },
    {
      icon: Baby,
      title: 'Conception',
      description:
        'Optimize your fertility window with predictive tracking and connect with fertility specialists.',
    },
    {
      icon: HeartPulse,
      title: 'Pregnancy',
      description:
        'Monitor your pregnancy journey with week-by-week guidance and on-demand prenatal care.',
    },
    {
      icon: Microscope,
      title: 'IVF',
      description:
        'Navigate your IVF journey with medication tracking, appointment management, and emotional support.',
    },
    {
      icon: Flame,
      title: 'Menopause',
      description:
        'Manage symptoms, track hormone changes, and get specialized care for this transition.',
    },
  ];

  return (
    <section className="py-16 lg:py-24 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">
            For Every Stage of Your Journey
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Womanie adapts to your unique needs, wherever you are in your reproductive health journey
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {journeys.map((journey, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-background to-muted/50 rounded-2xl p-6 border border-border hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 cursor-pointer group"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <journey.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{journey.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {journey.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhoItsFor;
