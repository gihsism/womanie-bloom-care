import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Download, ArrowRight, FileText, Brain, Shield } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';

const FinalCTA = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <section className="py-16 lg:py-24 px-4 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
      <div className="container mx-auto max-w-4xl text-center">
        <h2 className="text-3xl lg:text-5xl font-bold mb-4">
          {user ? 'Good to see you again' : 'Start with your latest lab report'}
        </h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          {user
            ? 'Add a new report, look at your latest results, or log how today went.'
            : 'Upload it and see each value explained within minutes. Free to start, no credit card needed.'}
        </p>

        {/* Value props */}
        {!user && (
          <div className="flex flex-wrap justify-center gap-6 mb-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
              PDF, photo or Word file
            </span>
            <span className="flex items-center gap-1.5">
              <Brain className="h-4 w-4 text-primary" aria-hidden="true" />
              Every value explained
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
              Encrypted, never sold
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {user ? (
            <Button
              size="lg"
              className="text-lg px-8"
              onClick={() => navigate('/dashboard')}
            >
              Go to Dashboard
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          ) : (
            <Button
              size="lg"
              className="text-lg px-8"
              onClick={() => navigate('/auth/select-type')}
            >
              Create a free account
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="lg"
            className="bg-background hover:bg-background/80"
            onClick={() => navigate('/install')}
          >
            <Download className="mr-2 h-5 w-5" aria-hidden="true" />
            Add to home screen
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
