import { FileText, Brain, TrendingUp, Shield } from 'lucide-react';
import { IconRows, PublicSection } from '@/components/public/PublicUI';

const highlights = [
  {
    icon: FileText,
    title: 'Your documents, explained',
    description: 'Upload lab results and get instant, plain-language explanations of every test — what it means, whether it\'s healthy, and what to do next.',
  },
  {
    icon: Brain,
    title: 'Patterns across results',
    description: 'Our AI cross-references your results to find patterns that matter — like how your iron levels connect to your cycle, or what your hormones mean for fertility.',
  },
  {
    icon: TrendingUp,
    title: 'Trends over time',
    description: 'Track how your health changes over time with visual charts, comparisons, and predictions for where your values are heading.',
  },
  {
    icon: Shield,
    title: 'Private and secure',
    description: 'Your health data is encrypted and visible only to you. We never share, sell, or use your data for anything other than helping you.',
  },
];

const Testimonials = () => {
  return (
    <PublicSection
      title="Built for real women's health"
      sub="More than a tracker: Womanie reads your medical documents and explains the results in plain language, so you go to your doctor with the right questions."
    >
      <IconRows items={highlights} />
    </PublicSection>
  );
};

export default Testimonials;
