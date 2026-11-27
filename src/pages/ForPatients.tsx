import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { FileText, Brain, TrendingUp, MessageCircle, Shield, Heart, ArrowRight } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { useAuth } from '@/contexts/AuthContext';

const ForPatients = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  usePageTitle('For Patients');

  const features = [
    { icon: FileText, title: 'Upload any medical document', description: 'Lab results, prescriptions, scan reports, discharge letters. PDF, a photo, or a Word file.' },
    { icon: Brain, title: 'Each result explained', description: 'Claude, an AI model, reads your document, pulls out each test and explains what the value means in plain words.' },
    { icon: TrendingUp, title: 'Track Changes Over Time', description: 'Charts show how each value moves across your tests, so you can see what is improving and what is not.' },
    { icon: MessageCircle, title: 'Ask about your results', description: 'Ask a question in your own words. The AI assistant sees your results and answers with them in mind.' },
    { icon: Shield, title: 'Private', description: 'Your data is encrypted and only you see it, unless you approve a doctor. We never sell it.' },
    { icon: Heart, title: 'Changes with your stage', description: 'Pregnancy, cycles, IVF, menopause: Home shows what matters for the stage you are in.' },
  ];

  const journeys = [
    { icon: '📅', title: 'Cycle Tracking', description: 'Period predictions, ovulation tracking, hormone insights from your lab results' },
    { icon: '🤰', title: 'Pregnancy', description: 'Week-by-week tracking, prenatal test analysis, key date reminders' },
    { icon: '🥚', title: 'Fertility & IVF', description: 'AMH, FSH, hormone tracking, treatment timeline, egg reserve monitoring' },
    { icon: '💊', title: 'Contraception', description: 'Method tracking, side effect logging, relevant blood test monitoring' },
    { icon: '🔥', title: 'Menopause', description: 'Symptom tracking, hormone levels, bone health, cardiovascular markers' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero */}
      <section className="py-16 lg:py-24 pt-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">
              Finally Understand Your <span className="text-primary">Medical Results</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Upload a lab report and see every test explained in plain language, next to your earlier results and in the context of your stage.
            </p>
            <Button size="lg" className="gap-2" onClick={() => navigate(user ? '/dashboard' : '/auth/select-type')}>
              {user ? 'Go to Dashboard' : 'Create a free account'}
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <Card key={f.title} className="p-6 hover:shadow-md transition-shadow">
                <f.icon className="h-10 w-10 text-primary mb-4" aria-hidden="true" />
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Life Stages */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-4">
            For Every Stage of Your Life
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Womanie adapts to where you are — showing relevant tests, insights, and recommendations
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
            {journeys.map(j => (
              <Card key={j.title} className="p-5 text-center hover:shadow-md transition-shadow">
                <span className="text-3xl mb-3 block">{j.icon}</span>
                <h3 className="font-semibold mb-1">{j.title}</h3>
                <p className="text-xs text-muted-foreground">{j.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h2 className="text-3xl font-bold mb-12">3 Steps to Better Health Understanding</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">1</div>
              <h3 className="font-semibold mb-2">Upload</h3>
              <p className="text-sm text-muted-foreground">Take a photo or upload a PDF of your lab results</p>
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">2</div>
              <h3 className="font-semibold mb-2">Analyze</h3>
              <p className="text-sm text-muted-foreground">AI reads every result and explains what it means for you</p>
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">3</div>
              <h3 className="font-semibold mb-2">Understand</h3>
              <p className="text-sm text-muted-foreground">See trends, get recommendations, ask the AI any question</p>
            </div>
          </div>
          <Button size="lg" className="mt-12 gap-2" onClick={() => navigate(user ? '/dashboard' : '/auth/select-type')}>
            {user ? 'Go to Dashboard' : 'Start Free'}
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ForPatients;
