import {
  Calendar,
  Bot,
  Video,
  FolderHeart,
  Users,
  Watch,
} from '@/components/icons';

const KeyFeatures = () => {
  const features = [
    {
      icon: Calendar,
      title: 'Cycle and stage tracking',
      description:
        'Periods, ovulation, pregnancy weeks, pill days or menopause symptoms. Predictions use the dates you log, so they get better as you go.',
    },
    {
      icon: Bot,
      title: 'Questions about your results',
      description:
        'Ask about a value, a symptom or what to raise at your next visit. Answers take your own results and stage into account.',
    },
    {
      icon: Video,
      title: 'Doctor visits',
      description:
        'Book a doctor listed on Womanie, in person or by video, and share only the records you choose with them.',
    },
    {
      icon: FolderHeart,
      title: 'All your records in one place',
      description:
        'Lab results, prescriptions and letters, kept together and searchable. Print a summary before an appointment.',
    },
    {
      icon: Users,
      title: 'Community (in progress)',
      description:
        'Groups for each stage, where women can compare notes and ask each other questions. We are still building this part.',
    },
    {
      icon: Watch,
      title: 'Apple Health',
      description:
        'On iPhone, bring in sleep, steps, heart rate and cycle data from Apple Health. Fitbit and Garmin are planned.',
    },
  ];

  return (
    <section className="py-16 lg:py-24 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">What it does</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Tracking, records and answers, in one app that knows your stage
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-background rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 border border-border group hover:-translate-y-1"
            >
              <div className="w-14 h-14 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <feature.icon className="h-7 w-7 text-white" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default KeyFeatures;
