import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import BabyTracker from '@/components/dashboard/BabyTracker';
import { ArrowLeft } from 'lucide-react';

// Full-page baby tracker, reachable at any life stage (the postpartum
// dashboard shows the same tracker inline for the first 6 months).
export default function BabyPage() {
  usePageTitle('Baby');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tab = params.get('tab');
  const initialTab = tab && ['feed', 'sleep', 'nappy', 'growth', 'vax', 'stats'].includes(tab) ? tab : 'feed';
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="w-full px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-xl font-bold text-primary">Baby</h1>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <BabyTracker initialTab={initialTab} />
      </div>
    </div>
  );
}
