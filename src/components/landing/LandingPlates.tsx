import type { ReactElement } from 'react';
import {
  CyclePlate, GeneralHealthPlate, MenopausePlate, PregnancyPlate, type PlateProps,
} from '@/components/art';
import { Column, RunningHead } from './parts';

// "What it does" as four numbered plates from the atlas. Staggered in two
// columns on desktop (the right column drops by half a plate) so it reads
// as a catalogue spread, not a feature grid.

const PLATES: { fig: number; name: string; Art: (p: PlateProps) => ReactElement; text: string }[] = [
  {
    fig: 1,
    name: 'Lab reports',
    Art: GeneralHealthPlate,
    text: 'Add a PDF, a photo of the paper or a Word file. Each value is pulled out, explained, and set against the range printed on your own report.',
  },
  {
    fig: 2,
    name: 'Cycle',
    Art: CyclePlate,
    text: 'Log a period in a couple of taps. Predictions come from the dates you log, so they get closer as the months add up.',
  },
  {
    fig: 3,
    name: 'Pregnancy',
    Art: PregnancyPlate,
    text: 'Home shows the week you are in, what is changing in your body and the baby, and which tests are usually due around now.',
  },
  {
    fig: 4,
    name: 'Menopause',
    Art: MenopausePlate,
    text: 'Note hot flushes, sleep and mood, and follow hormone, bone and heart markers across your blood tests.',
  },
];

export default function LandingPlates() {
  return (
    <section aria-labelledby="what-it-does" className="py-14 lg:py-24">
      <Column>
        <RunningHead no="II" label="What it does" />
        <div className="mt-8 grid gap-10 lg:mt-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <h2 id="what-it-does" className="font-display text-3xl font-normal leading-tight lg:text-4xl">
              One app, set to your stage.
            </h2>
            <p className="mt-4 max-w-sm text-muted-foreground">
              You pick your stage when you sign up and change it whenever life changes. Four of them
              are drawn here; contraception, trying to conceive, IVF and the months after birth have their own too.
            </p>
          </div>

          <ol className="grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:col-span-8">
            {PLATES.map(({ fig, name, Art, text }, i) => (
              <li key={fig} className={i % 2 === 1 ? 'sm:mt-24' : ''}>
                <figure>
                  <div className="border-b border-border pb-2">
                    <Art fig={fig} title={null} />
                  </div>
                  <figcaption className="mt-4">
                    <p className="font-display text-xl">{name}</p>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{text}</p>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ol>
        </div>
      </Column>
    </section>
  );
}
