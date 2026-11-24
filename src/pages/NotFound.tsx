import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Calendar, MessageSquare, FileText, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const suggestions = [
  { icon: Home, label: 'Womanie website', path: '/', description: 'The main site' },
  { icon: Calendar, label: 'Home', path: '/dashboard', description: 'Your health today', auth: true },
  { icon: MessageSquare, label: 'Ask AI', path: '/dashboard/ai-doctor', description: 'Ask a health question', auth: true },
  { icon: FileText, label: 'Records', path: '/dashboard/medical-history', description: 'Your results and documents', auth: true },
];

const NotFound = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const visibleSuggestions = suggestions.filter(s => !s.auth || user);

  return (
    // data-hide-install-banner: on phones the install banner sat over
    // "Go back"; this page opts out so the way out is always visible.
    <div className="min-h-screen bg-background flex flex-col" data-hide-install-banner>
      <div className="w-full max-w-md mx-auto px-4 pt-3 min-h-12 flex items-center">
        <button type="button" onClick={() => { window.location.href = '/'; }} className="text-xl font-extrabold text-stage-accent hover:opacity-80">
          Womanie
        </button>
      </div>
      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-10 pb-10">
        <p className="text-[15px] font-bold text-stage-accent">Error 404</p>
        <h1 className="page-title mt-1">Page not found</h1>
        <p className="page-sub mt-2">This page doesn't exist or has moved.</p>

        <button
          type="button"
          className="btn-stage w-full mt-7"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(user ? '/dashboard' : '/'))}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          Go back
        </button>

        <h2 className="section-title mt-10 mb-3">Or go to</h2>
        <div className="row-group">
          {visibleSuggestions.map((s) => (
            <button
              key={s.path}
              type="button"
              className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-muted/60"
              onClick={() => navigate(s.path)}
            >
              <span className="grid place-items-center h-10 w-10 shrink-0 rounded-full bg-stage-tint text-stage-accent" aria-hidden="true">
                <s.icon className="h-5 w-5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] font-bold">{s.label}</span>
                <span className="block text-[14px] text-muted-foreground">{s.description}</span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>
      </main>
    </div>
  );
};

export default NotFound;
