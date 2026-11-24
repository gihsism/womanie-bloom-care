import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { PublicSection, TextLink } from '@/components/public/PublicUI';
import { useAuth } from '@/contexts/AuthContext';

const FinalCTA = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <PublicSection
      className="pb-16"
      title={user ? 'Your health, one tap away' : 'Start understanding your health today'}
      sub={user
        ? 'Upload a new document, check your latest results, or log today.'
        : 'Upload your lab results and get them explained in minutes. Free to start, no credit card.'}
    >
      <button type="button" className="btn-stage w-full sm:w-auto sm:px-8" onClick={() => navigate(user ? '/dashboard' : '/auth/select-type')}>
        {user ? 'Go to Home' : 'Get started free'}
      </button>
      <p className="mt-2">
        <TextLink onClick={() => navigate('/install')}><Download className="h-4 w-4" aria-hidden="true" />Install the app</TextLink>
      </p>
    </PublicSection>
  );
};

export default FinalCTA;
