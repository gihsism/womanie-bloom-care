import { useNavigate } from 'react-router-dom';
import { startLogin } from '@/lib/login';
import { Button } from '@/components/ui/button';
import { LandingHeroFigure } from '@/components/art';
import { useAuth } from '@/contexts/AuthContext';
import { Column } from './parts';

// Plate I: a short plain headline on the left, the standing figure with its
// three leader-line labels on the right, one primary action and a quiet log-in.

export default function LandingHero() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <section aria-labelledby="landing-title" className="pt-24 pb-14 lg:pt-32 lg:pb-24">
      <Column>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-6 lg:pt-10">
            <p className="label-mono mb-6">Womanie · a health record for women</p>
            <h1
              id="landing-title"
              className="font-display text-[2.6rem] font-normal leading-[1.05] tracking-[-0.01em] sm:text-5xl lg:text-[4.25rem]"
            >
              Know what your lab results <em className="text-primary">actually</em> say.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
              Upload a blood test or a doctor&rsquo;s letter and read each value in plain words, next to your
              earlier results. Womanie also follows your cycle, pregnancy, IVF or menopause, and changes when
              you do.
            </p>

            <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
              {user ? (
                <Button size="lg" className="h-12 px-8 text-base" onClick={() => navigate('/dashboard')}>
                  Open your Home
                </Button>
              ) : (
                <>
                  <Button size="lg" className="h-12 px-8 text-base" onClick={() => navigate('/auth/select-type')}>
                    Create a free account
                  </Button>
                  <p className="text-[15px] text-muted-foreground">
                    Already have one?{' '}
                    <button
                      type="button"
                      onClick={() => startLogin(navigate)}
                      className="tap-target font-medium text-foreground underline decoration-foreground/40 underline-offset-4 hover:decoration-primary"
                    >
                      Log in
                    </button>
                  </p>
                </>
              )}
            </div>
          </div>

          <figure className="lg:col-span-6 lg:-mr-6">
            <div className="mx-auto max-w-[26rem] lg:max-w-none">
              <LandingHeroFigure />
            </div>
            <figcaption className="mt-4 flex gap-3 border-t border-border pt-3 text-sm text-muted-foreground lg:ml-16">
              <span className="label-mono shrink-0 pt-0.5">Plate I</span>
              <span>One place for the three things a visit runs on: your cycle, your results and your appointments.</span>
            </figcaption>
          </figure>
        </div>
      </Column>
    </section>
  );
}
