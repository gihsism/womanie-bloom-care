import Navigation from '@/components/Navigation';
import Hero from '@/components/Hero';
import WhatIsWomanie from '@/components/WhatIsWomanie';
import HowItWorks from '@/components/HowItWorks';
import KeyFeatures from '@/components/KeyFeatures';
import WhoItsFor from '@/components/WhoItsFor';
import Testimonials from '@/components/Testimonials';
import TrustSecurity from '@/components/TrustSecurity';
import FinalCTA from '@/components/FinalCTA';
import Footer from '@/components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <main>
        <Hero />
        <WhatIsWomanie />
        <HowItWorks />
        <KeyFeatures />
        <WhoItsFor />
        <Testimonials />
        <TrustSecurity />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
