import {
  Calendar,
  Bot,
  Video,
  FolderHeart,
  Users,
  Watch,
} from 'lucide-react';
import { IconRows, PublicSection } from '@/components/public/PublicUI';

const KeyFeatures = () => {
  const features = [
    {
      icon: Calendar,
      title: 'Cycle tracking that adapts',
      description:
        'Tracking that changes with you, from periods to pregnancy to perimenopause. Our AI learns your patterns for accurate predictions.',
    },
    {
      icon: Bot,
      title: 'Ask AI',
      description:
        'Get instant answers to health questions, symptom analysis, and personalized recommendations based on your unique health profile.',
    },
    {
      icon: Video,
      title: 'Doctor visits',
      description:
        'Connect with verified OB-GYNs, endocrinologists, and mental health specialists via secure video calls. No waiting rooms.',
    },
    {
      icon: FolderHeart,
      title: 'All your records in one place',
      description:
        'Store and manage all your health records, lab results, and prescriptions in one secure, easily shareable location.',
    },
    {
      icon: Users,
      title: 'Community',
      description:
        'Join supportive groups based on your journey stage. Share experiences, ask questions, and find solidarity with others.',
    },
    {
      icon: Watch,
      title: 'Wearables',
      description:
        'Sync with Apple Health, Fitbit, and other devices to automatically track sleep, activity, heart rate, and more.',
    },
  ];

  return (
    <PublicSection title="What you get" sub="Tools for every part of your health, in one app.">
      <IconRows items={features} />
    </PublicSection>
  );
};

export default KeyFeatures;
