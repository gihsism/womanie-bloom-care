import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Activity, Calendar, MessageSquare, FileText, Shield, Zap } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { IconRows, PublicHero, PublicSection } from '@/components/public/PublicUI';
import { useAuth } from '@/contexts/AuthContext';

const Product = () => {
  const navigate = useNavigate();
  usePageTitle('Product');
  const { user } = useAuth();

  const features = [
    {
      icon: Activity,
      title: 'Health tracking',
      description: 'Monitor your menstrual cycle, symptoms, and overall health metrics and see patterns over time.',
    },
    {
      icon: Calendar,
      title: 'Cycle predictions',
      description: 'Get accurate predictions for your next period, ovulation, and fertile window based on your unique patterns.',
    },
    {
      icon: MessageSquare,
      title: 'Ask AI',
      description: 'Ask a health question and get an answer based on medical research and your own results.',
    },
    {
      icon: FileText,
      title: 'Medical records',
      description: 'Store and manage all your health documents, test results, and medical history securely in one place.',
    },
    {
      icon: Shield,
      title: 'Privacy first',
      description: 'Your health data is encrypted and protected with strong security. You control who sees your information.',
    },
    {
      icon: Zap,
      title: 'Your devices',
      description: 'Connect your smartwatch and fitness trackers to automatically sync health data and insights.',
    },
  ];

  const steps = [
    { n: 1, title: 'Sign up and set it up for you', description: 'Create your account and answer a few questions about your stage.' },
    { n: 2, title: 'Track and upload', description: 'Log your cycle and symptoms, upload results, connect your devices.' },
    { n: 3, title: 'Understand and get care', description: 'Read your results in plain language, ask AI, book a doctor, join the community.' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <PublicHero
          title="Your complete women's health app"
          sub="Womanie brings together AI that explains your results, real doctors and a supportive community, so you stay in charge of your health."
          cta={{ label: user ? 'Go to Home' : 'Get started free', onClick: () => navigate(user ? '/dashboard' : '/auth/select-type') }}
        />
        <PublicSection title="What's inside">
          <IconRows items={features} />
        </PublicSection>
        <PublicSection title="How Womanie works" className="pb-16">
          <IconRows items={steps} />
        </PublicSection>
      </main>
      <Footer />
    </div>
  );
};

export default Product;
