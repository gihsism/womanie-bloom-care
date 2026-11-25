import { useSearchParams } from 'react-router-dom';
import SubPageHeader from '@/components/SubPageHeader';
import { usePageTitle } from '@/hooks/usePageTitle';
import BabyTracker from '@/components/dashboard/BabyTracker';

// Full-page baby tracker, reachable at any life stage (the postpartum
// dashboard shows the same tracker inline for the first 6 months).
export default function BabyPage() {
  usePageTitle('Baby');
  const [params] = useSearchParams();
  const tab = params.get('tab');
  const initialTab = tab && ['feed', 'sleep', 'nappy', 'growth', 'vax', 'stats'].includes(tab) ? tab : 'feed';
  return (
    <div className="min-h-screen bg-background pb-24">
      <SubPageHeader title="Baby" backTo="/dashboard" backLabel="Home" />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <BabyTracker initialTab={initialTab} openAdd={params.get('add') === '1'} />
      </div>
    </div>
  );
}
