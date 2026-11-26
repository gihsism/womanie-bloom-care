import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { User, Stethoscope, ChevronRight } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';

const SelectUserType = () => {
  const navigate = useNavigate();
  usePageTitle('Get Started');

  const Row = ({ icon: Icon, title, text, to, clinic }: { icon: typeof User; title: string; text: string; to: string; clinic?: boolean }) => (
    <button
      type="button"
      onClick={() => navigate(to)}
      data-stage={clinic ? 'clinic' : undefined}
      className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-muted/60"
    >
      <span className="grid place-items-center h-12 w-12 shrink-0 rounded-full bg-stage-head text-stage-ink" aria-hidden="true">
        <Icon className="h-6 w-6" strokeWidth={1.9} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[17px] font-bold leading-snug">{title}</span>
        <span className="block text-[14px] leading-snug text-muted-foreground">{text}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );

  return (
    <AuthLayout backHref="/" title="Welcome to Womanie" sub="How will you use the app?">
      <div className="row-group">
        <Row icon={User} title="For my own health" text="Track your cycle, understand your results, book doctors" to="/auth/signup" />
        <Row icon={Stethoscope} title="I'm a doctor or midwife" text="See your patients' results and visits" to="/auth/doctor-signup" clinic />
      </div>

      {/* Already-have-an-account row — both audiences land on the
          same screen, so we have to surface both login paths. */}
      <p className="mt-8 text-center text-[15px] text-muted-foreground">
        Have an account?{' '}
        <button type="button" onClick={() => navigate('/auth/login')} className="relative hit-44 font-semibold text-stage-accent hover:underline">
          Patient log in
        </button>
        {' · '}
        <button type="button" onClick={() => navigate('/auth/doctor-login')} className="relative hit-44 font-semibold text-stage-accent hover:underline">
          Doctor log in
        </button>
      </p>
    </AuthLayout>
  );
};

export default SelectUserType;
