import Navigation from '@/components/Navigation';
import LandingHero from '@/components/landing/LandingHero';
import LandingPlates from '@/components/landing/LandingPlates';
import LabSample from '@/components/landing/LabSample';
import LandingPrivacy from '@/components/landing/LandingPrivacy';
import LandingFooter from '@/components/landing/LandingFooter';

// The public landing page, laid out like a catalogue of plates:
// I the figure, II what it does, III a report explained, IV your data.
const Index = () => {
  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <Navigation />
      <main>
        <LandingHero />
        <LandingPlates />
        <LabSample />
        <LandingPrivacy />
      </main>
      <LandingFooter />
    </div>
  );
};

export default Index;
