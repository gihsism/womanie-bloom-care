import { Link } from 'react-router-dom';
import type { HeaderModel } from '@/lib/stageHeader';
import TileIcon from './TileIcon';

// Idea 4 header: the stage's calm colour, full-bleed, rounded at the
// bottom. Chip (taps through to change the life stage), one big status
// line, one sentence, two small fact boxes. Colours are the stage tokens.

export default function StageHeader({ model }: { model: HeaderModel }) {
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
      <h1 className="mt-4 text-[40px] sm:text-[44px] leading-[1.05] font-extrabold tracking-[-0.02em] tabular-nums">{model.big}</h1>
      <p className="mt-1.5 text-[18px] font-semibold text-stage-muted">{model.sentence}</p>
      <dl className="mt-5 grid grid-cols-2 gap-2 tabular-nums">
        {model.facts.map(f => (
          <div key={f.label} className="rounded-2xl bg-stage-chip/70 px-3 py-2.5 min-w-0">
            <dt className="text-[14px] font-semibold text-stage-muted truncate">{f.label}</dt>
            <dd className="text-[18px] font-extrabold truncate">{f.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
