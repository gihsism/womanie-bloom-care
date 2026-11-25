import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { HeaderModel } from '@/lib/stageHeader';
import TileIcon from './TileIcon';

// Idea 4 header, round 6 ("much more straightforward"): the stage's calm
// colour, full-bleed, rounded at the bottom. A chip (taps through to change
// the life stage), ONE big fact ("Week 31", "Day 14", "Period in 3 days")
// and one short sentence. The page's one action sits at the bottom of the
// header (passed in as children); everything else lives off Home.

/** Short facts ("Week 31", "Day 6") get the really big size. */
export const bigSize = (big: string) =>
  big.length <= 9 ? 'text-[60px] sm:text-[64px]' : big.length <= 14 ? 'text-[46px] sm:text-[50px]' : 'text-[38px] sm:text-[42px]';

export default function StageHeader({ model, children }: { model: HeaderModel; children?: ReactNode }) {
  return (
    <header className="-mx-4 bg-stage-head text-stage-ink rounded-b-[32px] px-5 pt-5 pb-5 sm:mx-0 sm:rounded-[32px]">
      <Link
        to="/dashboard/settings#life-stage"
        aria-label={`${model.chip}: change life stage`}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-stage-chip/60 text-[15px] font-bold hover:bg-stage-chip/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-ink"
      >
        <TileIcon name={model.chipIcon} className="h-[18px] w-[18px]" />
        {model.chip}
      </Link>
      <h1 className={`mt-6 ${bigSize(model.big)} leading-[1.02] font-extrabold tracking-[-0.03em] tabular-nums`}>{model.big}</h1>
      <p className="mt-2 text-[18px] font-semibold text-stage-muted">{model.sentence}</p>
      {children && <div className="mt-6">{children}</div>}
    </header>
  );
}
