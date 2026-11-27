import {
  ArtDefs, ArtSvg, Figure, Ground, INK, Leader, RULE, STONE_HI, useArtIds, type ArtProps,
} from './primitives';

// Landing hero: the body-map woman standing, full height, holding a visit
// card, with a plaster at the inner elbow (a blood test) and the cycle as a
// small ring at the abdomen. Three leader-line labels say what Womanie keeps
// track of. 360 x 420; replaces the stock doctor illustration.

const T = { x: 57, y: -10, s: 0.62 };
const at = (x: number, y: number) => [T.x + x * T.s, T.y + y * T.s] as const;

export function LandingHeroFigure({
  title = 'Drawing of a standing woman with three labels: cycle, lab results and visits',
  className,
  labels = { cycle: 'Cycle', labs: 'Lab results', visits: 'Visits' },
}: ArtProps & { labels?: { cycle: string; labs: string; visits: string } }) {
  const ids = useArtIds();
  const card = at(234, 236);
  const elbow = at(139, 284);
  const belly = at(188, 352);
  return (
    <ArtSvg w={360} h={420} title={title} className={className} name="landing-hero">
      <ArtDefs ids={ids} shadow={10} />
      <Ground cx={154} cy={404} rx={46} ry={5} />
      <circle cx={belly[0]} cy={belly[1]} r="30" fill={`url(#${ids.glow})`} stroke="none" />
      <Figure
        ids={ids}
        weight={1.6}
        transform={`translate(${T.x},${T.y}) scale(${T.s})`}
        forearm="M140,290 C158,286 192,268 222,250"
      />
      <g transform={`translate(${T.x},${T.y}) scale(${T.s})`} stroke={INK}>
        {/* plaster at the inner elbow */}
        <g transform="rotate(-28 139 284)">
          <rect x="127" y="279" width="24" height="10" rx="4" fill={STONE_HI} strokeWidth="1.4" />
          <rect x="135" y="281" width="8" height="6" rx="1.5" strokeWidth=".9" opacity=".6" />
        </g>
        {/* visit card held in the hand */}
        <g transform="rotate(-12 234 236)" filter={`url(#${ids.shadow})`}>
          <rect x="214" y="210" width="40" height="52" rx="3" fill={STONE_HI} strokeWidth="1.8" />
        </g>
        <g transform="rotate(-12 234 236)">
          <path d="M214,222 h40" strokeWidth="1.2" />
          {Array.from({ length: 9 }, (_, i) => (
            <circle key={i} cx={222 + (i % 3) * 12} cy={232 + Math.floor(i / 3) * 10} r="1.6" fill={INK} stroke="none" opacity=".5" />
          ))}
        </g>
        <path d="M216,252 C222,246 228,244 232,247" strokeWidth="1.4" />
      </g>
      {/* the cycle as a small ring at the abdomen */}
      <circle cx={belly[0]} cy={belly[1]} r="10" stroke={RULE} strokeWidth="1" />
      <path d={`M${belly[0]},${belly[1] - 10} A10,10 0 0 1 ${belly[0] + 9.5},${belly[1] - 3.1}`} stroke={INK} strokeWidth="2.6" />
      <Leader from={[belly[0] + 7.1, belly[1] + 7.1]} via={[262, 250]} to={[278, 250]} label={labels.cycle} accent size={10} />
      <Leader from={[elbow[0], elbow[1]]} via={[96, 212]} to={[84, 212]} label={labels.labs} size={10} />
      <Leader from={[card[0] + 4, card[1] - 10]} via={[262, 96]} to={[278, 96]} label={labels.visits} size={10} />
    </ArtSvg>
  );
}
