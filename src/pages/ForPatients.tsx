import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { FileText, Brain, TrendingUp, MessageCircle, Shield, Heart, CalendarHeart, Baby, Microscope, Pill, Sunset } from 'lucide-react';
import { LIFE_STAGE_LABELS } from '@/lib/lifeStageLabels';
import type { IconRow } from '@/components/public/PublicUI';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { IconRows, PublicHero, PublicSection } from '@/components/public/PublicUI';
import { useAuth } from '@/contexts/AuthContext';

const ForPatients = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  usePageTitle('For Patients');

  const features = [
    { icon: FileText, title: 'Upload any medical document', description: 'Lab results, prescriptions, imaging reports, discharge summaries — PDF, images, or DOCX. We handle it all.' },
    { icon: Brain, title: 'Every result explained', description: 'AI reads your documents, extracts every test, and explains what each result means in plain language — not medical jargon.' },
    { icon: TrendingUp, title: 'Changes over time', description: 'Visual charts show how your values change across multiple tests. See trends and predictions for where your health is heading.' },
    { icon: MessageCircle, title: 'Ask AI', description: 'Ask any health question — the AI knows your medical history and gives personalized answers based on your actual results.' },
    { icon: Shield, title: 'Completely private', description: 'Your health data is encrypted and visible only to you. We never share, sell, or use your data for anything else.' },
    { icon: Heart, title: 'Changes with your stage', description: 'Pregnancy, cycles, IVF, menopause — the app shows different insights and recommendations based on your life stage.' },
  ];

  const journeys: IconRow[] = [
    { icon: CalendarHeart, stage: 'menstrual-cycle', title: LIFE_STAGE_LABELS['menstrual-cycle'], description: 'Period predictions, ovulation, hormone results explained' },
    { icon: Baby, stage: 'pregnancy', title: LIFE_STAGE_LABELS.pregnancy, description: 'Week by week, pregnancy test results, key dates' },
    { icon: Microscope, stage: 'ivf', title: 'Fertility and IVF', description: 'AMH, FSH and other hormones, your treatment timeline, egg reserve' },
    { icon: Pill, stage: 'contraception', title: LIFE_STAGE_LABELS.contraception, description: 'Your method, side effects, the blood tests that matter' },
    { icon: Sunset, stage: 'menopause', title: LIFE_STAGE_LABELS.menopause, description: 'Symptoms, hormone levels, bone and heart health' },
  ];

  const steps = [
    { n: 1, title: 'Upload', description: 'Take a photo or upload a PDF of your lab results.' },
    { n: 2, title: 'Read', description: 'Womanie reads every result and explains what it means for you.' },
    { n: 3, title: 'Understand', description: 'See trends, get suggestions and ask AI any question.' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <PublicHero
          title="Finally understand your medical results"
          sub="Upload your lab results and get them explained in minutes: every test in plain language, with what it means for your stage of life."
          cta={{ label: user ? 'Go to Home' : 'Get started free', onClick: () => navigate(user ? '/dashboard' : '/auth/select-type') }}
        />
        <PublicSection title="What Womanie does for you">
          <IconRows items={features} />
        </PublicSection>
        <PublicSection title="For every stage of your life" sub="Womanie shows the tests, explanations and suggestions that matter where you are now.">
          <IconRows items={journeys} />
        </PublicSection>
        <PublicSection title="Three steps" className="pb-16">
          <IconRows items={steps} />
        </PublicSection>
      </main>
      <Footer />
    </div>
  );
};

export default ForPatients;
