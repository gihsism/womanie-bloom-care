import {
  Calendar,
  Bot,
  Video,
  FolderHeart,
  Users,
  Watch,
} from 'lucide-react';

const KeyFeatures = () => {
  const features = [
    {
      icon: Calendar,
      title: 'Adaptive Cycle Tracking',
      description:
        'Smart tracking that evolves with you - from periods to pregnancy to perimenopause. Our AI learns your patterns for accurate predictions.',
    },
    {
      icon: Bot,
      title: 'AI Health Assistant',
      description:
        'Get instant answers to health questions, symptom analysis, and personalized recommendations based on your unique health profile.',
    },
    {
      icon: Video,
      title: 'Doctor Consultations',
      description:
        'Connect with board-certified OB-GYNs, endocrinologists, and mental health specialists via secure video calls. No waiting rooms.',
    },
    {
      icon: FolderHeart,
      title: 'Medical Records Hub',
      description:
        'Store and manage all your health records, lab results, and prescriptions in one secure, easily shareable location.',
    },
    {
      icon: Users,
      title: 'Community Support',
      description:
        'Join supportive groups based on your journey stage. Share experiences, ask questions, and find solidarity with others.',
    },
    {
      icon: Watch,
      title: 'Wearable Integration',
      description:
        'Sync with Apple Health, Fitbit, and other devices to automatically track sleep, activity, heart rate, and more.',
    },
  ];

  return (
    <section className="py-16 lg:py-24 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">Key Features</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Comprehensive tools to support your complete health journey
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
