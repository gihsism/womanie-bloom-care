import { useNavigate } from 'react-router-dom';
import { Pill, Baby, HeartPulse, Microscope, Flame } from 'lucide-react';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { LIFE_STAGE_LABELS } from '@/lib/lifeStageLabels';
import { IconRows, PublicSection } from '@/components/public/PublicUI';

const WhoItsFor = () => {
  const navigate = useNavigate();

  const journeys: { icon: typeof Pill; title: string; description: string; stage: LifeStage }[] = [
    {
      icon: Pill,
      title: 'Contraception',
      description:
        'Track your birth control, manage side effects, and get expert guidance on the best options for you.',
      stage: 'contraception',
    },
    {
      icon: Baby,
      title: 'Conception',
      description:
        'Optimize your fertility window with predictive tracking and connect with fertility specialists.',
      stage: 'conception',
    },
    {
      icon: HeartPulse,
      title: 'Pregnancy',
      description:
        'Monitor your pregnancy journey with week-by-week guidance and on-demand prenatal care.',
      stage: 'pregnancy',
    },
    {
      icon: Microscope,
      title: 'IVF',
      description:
        'Navigate your IVF journey with medication tracking, appointment management, and emotional support.',
      stage: 'ivf',
    },
    {
      icon: Flame,
      title: 'Menopause',
      description:
        'Manage symptoms, track hormone changes, and get specialized care for this transition.',
      stage: 'menopause',
    },
  ];

  return (
    <PublicSection title="For every stage of your life" sub="Womanie changes with you, wherever you are.">
      <IconRows
        items={journeys.map((j) => ({
          icon: j.icon,
          title: LIFE_STAGE_LABELS[j.stage],
          description: j.description,
          stage: j.stage,
          onClick: () => navigate('/auth/select-type'),
          ariaLabel: `Get started with ${LIFE_STAGE_LABELS[j.stage]}`,
        }))}
      />
    </PublicSection>
  );
};

export default WhoItsFor;
