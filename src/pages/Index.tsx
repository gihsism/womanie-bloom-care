import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
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
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      setChecking(true);
      supabase
        .from('profiles')
        .select('life_stage')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.life_stage) {
            navigate('/dashboard', { replace: true });
          } else {
            navigate('/welcome', { replace: true });
          }
        });
    }
  }, [user, loading, navigate]);

  if (!loading && user) {
    return null;
  }

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
