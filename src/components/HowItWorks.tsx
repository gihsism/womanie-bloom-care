import { UserPlus, Activity, Stethoscope, TrendingUp } from 'lucide-react';

const HowItWorks = () => {
  const steps = [
    {
      icon: UserPlus,
      title: 'Sign up & personalize',
      description:
        'Create your profile and tell us about your health journey. Our AI adapts to your unique needs.',
    },
    {
      icon: Activity,
      title: 'Track your health journey',
      description:
        'Log symptoms, cycles, moods, and more. Connect wearables for automatic tracking.',
    },
    {
      icon: Stethoscope,
      title: 'Connect with doctors',
      description:
        'Schedule video consultations with board-certified specialists. Get prescriptions and referrals.',
    },
    {
      icon: TrendingUp,
      title: 'Get insights & support',
      description:
        'Receive personalized health insights, predictions, and connect with a supportive community.',
    },
  ];

  return (
    <section className="py-16 lg:py-24 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">How It Works</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Get started in minutes and take control of your health journey
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative group hover:scale-105 transition-transform duration-300"
            >
              <div className="bg-background border border-border rounded-2xl p-6 h-full shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center">
                    <step.icon className="h-6 w-6 text-white" aria-hidden="true" />
                  </div>
                  <div className="text-3xl font-bold text-primary/20">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-4 w-8 h-0.5 bg-gradient-to-r from-primary/50 to-transparent"></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
