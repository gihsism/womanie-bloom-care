import { Shield, Lock, UserCheck, Stethoscope } from 'lucide-react';
import { IconRows, PublicSection } from '@/components/public/PublicUI';

const TrustSecurity = () => {
  const features = [
    {
      icon: Shield,
      title: 'Private by design',
      description:
        'Your health data belongs to you. We never sell it, and you can export or delete it at any time.',
    },
    {
      icon: Lock,
      title: 'Encrypted',
      description:
        'Your health data is encrypted in transit and at rest, so it stays secure.',
    },
    {
      icon: UserCheck,
      title: 'You decide who sees what',
      description:
        'Decide exactly what data to share with doctors, partners, or family members.',
    },
    {
      icon: Stethoscope,
      title: 'Based on medical evidence',
      description:
        'Health content is guided by clinical references from ACOG, CDC, and other leading medical sources.',
    },
  ];

  return (
    <PublicSection title="Your privacy comes first" sub="Health data is sensitive. Security and privacy are built into everything we do.">
      <IconRows items={features} />
    </PublicSection>
  );
};

export default TrustSecurity;
