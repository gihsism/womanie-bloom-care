import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Home, ArrowLeft, Calendar, MessageSquare, FileText, Heart } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const suggestions = [
  { icon: Home, label: 'Homepage', path: '/', description: 'Back to the main site' },
  { icon: Calendar, label: 'Dashboard', path: '/dashboard', description: 'Your health dashboard', auth: true },
  { icon: MessageSquare, label: 'AI Doctor', path: '/dashboard/ai-doctor', description: 'Chat with AI assistant', auth: true },
  { icon: FileText, label: 'Medical Records', path: '/dashboard/medical-history', description: 'View your documents', auth: true },
];

const NotFound = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const visibleSuggestions = suggestions.filter(s => !s.auth || user);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 flex justify-center border-b border-border">
        <button type="button" onClick={() => { window.location.href = '/'; }} className="text-xl font-bold text-primary hover:opacity-80 transition-opacity">
          Womanie
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-3">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Heart className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-6xl font-bold text-primary">404</h1>
          <p className="text-lg font-semibold text-foreground">Page not found</p>
          <p className="text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="space-y-2">
          {visibleSuggestions.map((s) => (
            <Card
              key={s.path}
              className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(s.path)}
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <s.icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
            </Card>
          ))}
        </div>

        <Button
          variant="outline"
          onClick={() => navigate(-1)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Go back
        </Button>
      </div>
      </div>
    </div>
  );
};

export default NotFound;
