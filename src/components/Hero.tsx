import { useNavigate } from 'react-router-dom';
import { startLogin } from '@/lib/login';
import { FileText, Brain, Shield } from 'lucide-react';
import heroIllustration from '@/assets/hero-illustration.png';
import { useAuth } from '@/contexts/AuthContext';

const Hero = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <section className="pt-24 pb-10 lg:pt-32 lg:pb-16 px-4">
      <div className="mx-auto max-w-5xl grid lg:grid-cols-[1.2fr_1fr] gap-8 lg:gap-14 items-center">
        <div>
          <p className="text-[14px] font-bold text-stage-accent">Your health records, explained</p>
          <h1 className="mt-2 text-[2.25rem] lg:text-[3.25rem] leading-[1.08] font-extrabold tracking-[-0.02em]">
            Understand your health like never before
          </h1>
          <p className="mt-4 text-[17px] lg:text-[19px] leading-relaxed text-muted-foreground">
            Upload your lab results and medical documents. Womanie explains every result
            in plain language, spots patterns worth asking your doctor about, and follows
            you through cycles, fertility, pregnancy and menopause.
          </p>

          <ul className="mt-5 space-y-2 text-[15px] text-foreground">
            <li className="flex items-center gap-2.5"><FileText className="h-5 w-5 text-stage-accent" aria-hidden="true" />Upload any medical document</li>
            <li className="flex items-center gap-2.5"><Brain className="h-5 w-5 text-stage-accent" aria-hidden="true" />Every result explained</li>
            <li className="flex items-center gap-2.5"><Shield className="h-5 w-5 text-stage-accent" aria-hidden="true" />Private and encrypted</li>
          </ul>

          <button
            type="button"
            className="btn-stage mt-7 w-full sm:w-auto sm:px-8"
            onClick={() => navigate(user ? '/dashboard' : '/auth/select-type')}
          >
            {user ? 'Go to Home' : 'Get started free'}
          </button>
          <p className="mt-3 text-[15px] text-muted-foreground">
            <button type="button" onClick={() => navigate('/product')} className="font-semibold text-stage-accent hover:underline underline-offset-4 min-h-11 min-w-11">
              See how it works
            </button>
            {!user && (
              <>
                {' · '}Have an account?{' '}
                <button type="button" onClick={() => startLogin(navigate)} className="font-semibold text-stage-accent hover:underline underline-offset-4 min-h-11 min-w-11">
                  Log in
                </button>
              </>
            )}
          </p>
        </div>

        <img
          src={heroIllustration}
          alt="Woman holding a smartphone with her health dashboard"
          className="w-full max-w-sm lg:max-w-md mx-auto h-auto rounded-[1.75rem]"
          width={512}
          height={512}
          loading="eager"
          fetchPriority="high"
        />
      </div>
    </section>
  );
};

export default Hero;
