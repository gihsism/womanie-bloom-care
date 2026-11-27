import type { ReactElement, ReactNode } from 'react';
import {
  ACCENT, ArtDefs, ArtSvg, FAINT, Figure, Ground, INK, LABEL, Leader, LINE, MONO, PAPER, PEN, RULE,
  STONE_HI, STONE_LO, Uterus, useArtIds, type ArtIds, type ArtProps,
} from './primitives';

// Life-stage plates, one per stage, 320 x 220. Drawn like a page from an
// anatomy atlas: one subject in stone and ink, a figure number, and one or
// two leader-line labels in DM Mono. The raspberry accent marks one thing.

const W = 320;
const H = 220;

/** A plate can carry another figure number when a page shows a selection (the landing's FIG. 1-4). */
export type PlateProps = ArtProps & { fig?: number };

export type PlateStage =
  | 'cycle' | 'conception' | 'pregnancy' | 'postpartum'
  | 'contraception' | 'ivf' | 'menopause' | 'general';

function Plate({
  fig, name, title, className, children,
}: ArtProps & { fig: number; name: string; children: (ids: ArtIds) => ReactNode }) {
  const ids = useArtIds();
  return (
    <ArtSvg w={W} h={H} title={title} className={className} name={name}>
      <ArtDefs ids={ids} />
      <text x="14" y="20" fontFamily={MONO} fontSize="8" letterSpacing=".12em" fill={LABEL} stroke="none">
        FIG. {fig}
      </text>
      {children(ids)}
    </ArtSvg>
  );
}

const ringPoint = (cx: number, cy: number, r: number, t: number) => {
  const a = t * 2 * Math.PI - Math.PI / 2;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};
const ringArc = (cx: number, cy: number, r: number, t0: number, t1: number) => {
  const [x0, y0] = ringPoint(cx, cy, r, t0);
  const [x1, y1] = ringPoint(cx, cy, r, t1);
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${t1 - t0 > 0.5 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
};

/** A vertical week/month scale like the Home body maps, with the accent filled up to `at`. */
function Scale({ x, y0, y1, steps, at, major, first, last }: {
  x: number; y0: number; y1: number; steps: number; at: number; major: number; first: string; last: string;
}) {
  const y = (i: number) => y0 + (i / steps) * (y1 - y0);
  return (
    <g>
      <line x1={x} y1={y0} x2={x} y2={y1} stroke={RULE} strokeWidth=".8" />
      {Array.from({ length: steps + 1 }, (_, i) => (
        <line key={i} x1={x} x2={x - (i % major === 0 ? 5 : 3)} y1={y(i)} y2={y(i)} stroke={FAINT} strokeWidth=".7" />
      ))}
      <line x1={x} y1={y0} x2={x} y2={y(at)} stroke={ACCENT} strokeWidth="1.6" />
      <circle cx={x} cy={y(at)} r="3" fill={ACCENT} stroke="none" />
      <text x={x - 9} y={y0 + 3} textAnchor="end" fontFamily={MONO} fontSize="8" fill={LABEL} stroke="none">{first}</text>
      <text x={x - 9} y={y1 + 3} textAnchor="end" fontFamily={MONO} fontSize="8" fill={LABEL} stroke="none">{last}</text>
    </g>
  );
}

/** Menstrual cycle: the uterus with its lining shed, and the cycle ring at day 1. */
export function CyclePlate({ title = 'Drawing of a uterus with its lining, beside a 28-day cycle ring at day 1', className, fig }: PlateProps) {
  const today = ringPoint(254, 118, 34, 0.5 / 28);
  return (
    <Plate fig={fig ?? 1} name="plate-cycle" title={title} className={className}>
      {(ids) => (
        <>
          <g transform="translate(118,108) scale(1.15)"><Uterus ids={ids} lining={0.8} /></g>
          <circle cx="254" cy="118" r="34" stroke={RULE} strokeWidth="1" />
          {Array.from({ length: 28 }, (_, i) => {
            const [ax, ay] = ringPoint(254, 118, 31, i / 28);
            const [bx, by] = ringPoint(254, 118, i % 7 === 0 ? 39 : 36, i / 28);
            return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke={FAINT} strokeWidth=".7" />;
          })}
          <path d={ringArc(254, 118, 34, 0, 5 / 28)} stroke={PEN} strokeWidth="4" />
          <path d={ringArc(254, 118, 34, 23 / 28, 27.6 / 28)} stroke={LINE} strokeWidth="1.1" strokeDasharray="2 4" />
          <Leader from={[118, 112]} via={[98, 192]} to={[84, 192]} label="Lining" />
          <Leader from={[today[0], today[1]]} via={[240, 46]} to={[226, 46]} label="Day 1 of 28" accent />
        </>
      )}
    </Plate>
  );
}

/** Trying to conceive: an egg leaving the ovary, and the fertile days on a strip. */
export function ConceptionPlate({ title = 'Drawing of an ovary releasing an egg, with the fertile window marked on a strip of cycle days', className, fig }: PlateProps) {
  return (
    <Plate fig={fig ?? 2} name="plate-conception" title={title} className={className}>
      {(ids) => (
        <>
          <g transform="translate(112,104) scale(1.1)"><Uterus ids={ids} follicle /></g>
          {/* the released egg drifting towards the tube */}
          <path d="M180,98 C188,90 194,84 202,82" stroke={LINE} strokeWidth=".7" strokeDasharray="1.5 3" />
          <circle cx="208" cy="80" r="9" stroke={ACCENT} strokeWidth=".7" opacity=".5" />
          <circle cx="208" cy="80" r="5" fill={PAPER} stroke={PEN} strokeWidth="1" />
          <circle cx="208" cy="80" r="1.8" fill={ACCENT} stroke="none" />
          {/* cycle days 8-21 */}
          <line x1="206" y1="168" x2="304" y2="168" stroke={RULE} strokeWidth=".8" />
          {Array.from({ length: 15 }, (_, i) => (
            <line key={i} x1={206 + i * 7} x2={206 + i * 7} y1="168" y2={i % 7 === 0 ? 162 : 164.5} stroke={FAINT} strokeWidth=".7" />
          ))}
          <line x1="241" y1="168" x2="276" y2="168" stroke={ACCENT} strokeWidth="3" />
          <Leader from={[216, 74]} via={[234, 50]} to={[248, 50]} label="Ovulation" accent />
          <Leader from={[258, 170]} via={[248, 196]} to={[234, 196]} label="Fertile window" />
        </>
      )}
    </Plate>
  );
}

/** Pregnancy: the body-map figure with the bump, beside the 40-week scale. */
export function PregnancyPlate({ title = 'Drawing of a pregnant woman in profile beside a 40-week scale at week 24', className, fig }: PlateProps) {
  return (
    <Plate fig={fig ?? 3} name="plate-pregnancy" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={136} cy={203} rx={30} ry={3} />
          <circle cx="146" cy="104" r="22" fill={`url(#${ids.glow})`} stroke="none" />
          <Figure ids={ids} pregnant transform="translate(76,4) scale(0.3)" weight={3} />
          <Scale x={232} y0={40} y1={180} steps={40} at={24} major={5} first="1" last="40" />
          <Leader from={[150, 104]} via={[178, 66]} to={[192, 66]} label="Uterus" />
          <Leader from={[232, 124]} to={[248, 124]} label="Week 24" />
        </>
      )}
    </Plate>
  );
}

/** Postpartum: the figure holding a swaddled baby against her chest. */
export function PostpartumPlate({ title = 'Drawing of a woman in profile holding a swaddled newborn', className, fig }: PlateProps) {
  return (
    <Plate fig={fig ?? 4} name="plate-postpartum" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={136} cy={203} rx={28} ry={3} />
          <Figure ids={ids} transform="translate(76,4) scale(0.3)" weight={3} forearm="M140,290 C162,300 200,296 236,280" />
          <g transform="translate(76,4) scale(0.3)" stroke={INK}>
            <g filter={`url(#${ids.shadow})`}>
              <ellipse cx="222" cy="262" rx="52" ry="27" transform="rotate(-14 222 262)" fill={`url(#${ids.stone})`} strokeWidth="3.6" />
              <circle cx="268" cy="236" r="21" fill={`url(#${ids.stone})`} strokeWidth="3.6" />
            </g>
            <path d="M180,266 C202,250 236,244 262,252" strokeWidth="2.6" opacity=".5" />
            <path d="M206,286 C222,276 244,270 262,270" strokeWidth="2.2" opacity=".35" />
            <path d="M262,236 q5,3.5 10,0" strokeWidth="2.6" opacity=".8" />
          </g>
          <Leader from={[156, 75]} via={[186, 52]} to={[200, 52]} label="Feeds" accent />
          <Leader from={[132, 124]} via={[188, 150]} to={[202, 150]} label="Recovery · 6 weeks" />
        </>
      )}
    </Plate>
  );
}

/** Contraception: a 28-day blister pack, ten pills taken, today ringed. */
export function ContraceptionPlate({ title = 'Drawing of a 28-day pill pack with ten pills taken and today marked', className, fig }: PlateProps) {
  const pill = (i: number) => ({ x: 64 + (i % 7) * 19, y: 76 + Math.floor(i / 7) * 22 });
  const TODAY = 10;
  return (
    <Plate fig={fig ?? 5} name="plate-contraception" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={124} cy={174} rx={70} ry={4} />
          <g filter={`url(#${ids.shadow})`}>
            <path d="M48,58 C47,56 49,54 52,54 L196,52 C199,52 201,54 201,57 L203,161 C203,164 201,166 198,166 L54,167 C51,167 49,165 49,162 Z"
              fill={`url(#${ids.stone})`} stroke={INK} strokeWidth="1.2" />
          </g>
          {Array.from({ length: 28 }, (_, i) => {
            const { x, y } = pill(i);
            if (i >= 21) return <circle key={i} cx={x} cy={y} r="4.6" fill={STONE_HI} stroke={INK} strokeWidth=".8" strokeDasharray="1.4 1.8" />;
            if (i < TODAY) {
              return (
                <g key={i} stroke={INK}>
                  <circle cx={x} cy={y} r="6.4" fill={PAPER} strokeWidth=".8" opacity=".9" />
                  <path d={`M${x - 3},${y - 2} l2.5,1.5 l1,-2 l2.6,2.4`} strokeWidth=".6" opacity=".6" />
                </g>
              );
            }
            return <circle key={i} cx={x} cy={y} r="6.4" fill={STONE_LO} stroke={INK} strokeWidth="1" />;
          })}
          <circle cx={pill(TODAY).x} cy={pill(TODAY).y} r="10" stroke={ACCENT} strokeWidth="1.2" />
          <Leader from={[pill(TODAY).x + 7, pill(TODAY).y - 7]} via={[146, 34]} to={[160, 34]} label="Today" accent />
          <Leader from={[pill(27).x + 5, pill(27).y + 3]} via={[218, 186]} to={[232, 186]} label="Break week" />
        </>
      )}
    </Plate>
  );
}

/** IVF: a lab dish, and a magnified day-5 embryo. */
export function IvfPlate({ title = 'Drawing of a lab dish with a magnified view of a day-5 embryo', className, fig }: PlateProps) {
  return (
    <Plate fig={fig ?? 6} name="plate-ivf" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={94} cy={162} rx={70} ry={5} />
          <g stroke={INK} filter={`url(#${ids.shadow})`}>
            <path d="M28,138 L28,148 C28,160 160,160 160,148 L160,138" fill={`url(#${ids.stone})`} strokeWidth="1.2" />
            <ellipse cx="94" cy="138" rx="66" ry="14" fill={STONE_HI} strokeWidth="1.2" />
          </g>
          <ellipse cx="94" cy="139" rx="58" ry="10" stroke={INK} strokeWidth=".7" opacity=".45" />
          {/* magnifier lines */}
          <line x1="108" y1="138" x2="204" y2="62" stroke={LINE} strokeWidth=".6" />
          <line x1="108" y1="138" x2="208" y2="132" stroke={LINE} strokeWidth=".6" />
          <circle cx="108" cy="138" r="1.6" fill={PEN} stroke="none" />
          <g stroke={INK}>
            <circle cx="240" cy="96" r="46" fill={`url(#${ids.stone})`} strokeWidth="1.2" filter={`url(#${ids.shadow})`} />
            <circle cx="240" cy="96" r="30" fill={STONE_HI} strokeWidth="1" />
            <circle cx="240" cy="96" r="25" strokeWidth=".7" opacity=".7" />
            {Array.from({ length: 14 }, (_, i) => {
              const a0 = (i / 14) * 2 * Math.PI; const a1 = ((i + 1) / 14) * 2 * Math.PI;
              const p = (a: number, r: number) => `${(240 + r * Math.cos(a)).toFixed(1)},${(96 + r * Math.sin(a)).toFixed(1)}`;
              return <path key={i} d={`M${p(a0, 25)} L${p(a0, 21)} M${p(a0, 21)} Q${p((a0 + a1) / 2, 19.5)} ${p(a1, 21)}`} strokeWidth=".6" opacity=".55" />;
            })}
            <path d="M222,90 C220,80 230,74 238,78 C244,81 244,90 238,94 C232,98 224,97 222,90 Z" fill={ACCENT} fillOpacity=".8" strokeWidth=".9" />
          </g>
          <Leader from={[234, 84]} via={[268, 30]} to={[282, 30]} label="Day 5" accent />
          <Leader from={[42, 150]} via={[52, 192]} to={[66, 192]} label="Lab dish" />
        </>
      )}
    </Plate>
  );
}

/** Menopause: the figure with heat at the neck, beside the 12-month scale. */
export function MenopausePlate({ title = 'Drawing of a woman in profile beside a scale counting 12 months without a period', className, fig }: PlateProps) {
  return (
    <Plate fig={fig ?? 7} name="plate-menopause" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={134} cy={203} rx={26} ry={3} />
          <Figure ids={ids} transform="translate(76,4) scale(0.3)" weight={3} />
          <g stroke={LINE} strokeWidth=".8">
            <path d="M142,74 c3,-3 -1,-6 2,-9 c3,-3 -1,-6 2,-9" />
            <path d="M148,78 c3,-3 -1,-6 2,-9 c3,-3 -1,-6 2,-9" opacity=".6" />
          </g>
          <Scale x={232} y0={46} y1={180} steps={12} at={9} major={3} first="0" last="12" />
          <Leader from={[133, 68]} via={[172, 22]} to={[186, 22]} label="Hot flushes" />
          <Leader from={[232, 146.5]} to={[248, 146.5]} label="Month 9" />
        </>
      )}
    </Plate>
  );
}

/** General health: a blood tube and a lab sheet with one value inside its range. */
export function GeneralHealthPlate({ title = 'Drawing of a blood test tube beside a lab report with one value inside its range', className, fig }: PlateProps) {
  return (
    <Plate fig={fig ?? 8} name="plate-general" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={90} cy={176} rx={24} ry={3} />
          <g stroke={INK} filter={`url(#${ids.shadow})`}>
            <path d="M76,58 L76,160 C76,173 104,173 104,160 L104,58 Z" fill={`url(#${ids.stone})`} strokeWidth="1.2" />
            <rect x="71" y="36" width="38" height="24" rx="3" fill={STONE_LO} strokeWidth="1.2" />
          </g>
          <path d="M77,114 C86,111 94,117 103,113 L103,160 C103,171 77,171 77,160 Z" fill={ACCENT} fillOpacity=".85" stroke="none" />
          <g stroke={INK}>
            <path d="M76,114 C86,111 94,117 104,113" strokeWidth=".8" />
            <line x1="71" y1="44" x2="109" y2="44" strokeWidth=".6" opacity=".5" />
            <rect x="81" y="68" width="18" height="34" fill={STONE_HI} strokeWidth=".8" />
            <path d="M85,76 h10 M85,82 h7 M85,88 h9" strokeWidth=".6" opacity=".6" />
          </g>
          <g transform="rotate(3 215 110)">
            <g filter={`url(#${ids.shadow})`}>
              <path d="M150,46 L272,44 L266,58 L280,58 L281,176 L151,178 Z" fill={STONE_HI} stroke={INK} strokeWidth="1.2" />
            </g>
            <path d="M266,44 L266,58 L280,58" stroke={INK} strokeWidth=".9" fill="none" />
            <g stroke={INK} strokeWidth=".7" opacity=".5">
              <path d="M164,66 h52 M164,76 h70 M164,86 h40" />
              <path d="M164,144 h80 M164,154 h60 M164,164 h72" />
            </g>
            <line x1="164" y1="120" x2="266" y2="120" stroke={RULE} strokeWidth="1" />
            <rect x="190" y="116" width="52" height="8" fill={STONE_LO} stroke={INK} strokeWidth=".6" />
            <circle cx="222" cy="120" r="3.4" fill={INK} stroke="none" />
            <text x="164" y="108" fontFamily={MONO} fontSize="6.5" letterSpacing=".06em" fill={LABEL} stroke="none">FERRITIN</text>
          </g>
          <Leader from={[96, 48]} via={[120, 22]} to={[134, 22]} label="Blood test" />
          <Leader from={[221, 124]} via={[236, 198]} to={[250, 198]} label="In range" />
        </>
      )}
    </Plate>
  );
}

export const LIFE_STAGE_PLATES: Record<PlateStage, (p: ArtProps) => ReactElement> = {
  cycle: CyclePlate,
  conception: ConceptionPlate,
  pregnancy: PregnancyPlate,
  postpartum: PostpartumPlate,
  contraception: ContraceptionPlate,
  ivf: IvfPlate,
  menopause: MenopausePlate,
  general: GeneralHealthPlate,
};

/**
 * The plate for an app life stage (profiles.life_stage / dashboard mode).
 * Pre-menstrual shares the cycle plate, post-menopause the menopause plate;
 * anything else gets the general-health plate.
 */
export function plateForStage(stage: string | null | undefined): (p: ArtProps) => ReactElement {
  switch (stage) {
    case 'menstrual-cycle':
    case 'pre-menstrual': return CyclePlate;
    case 'conception': return ConceptionPlate;
    case 'pregnancy': return PregnancyPlate;
    case 'postpartum': return PostpartumPlate;
    case 'contraception': return ContraceptionPlate;
    case 'ivf': return IvfPlate;
    case 'menopause':
    case 'post-menopause': return MenopausePlate;
    default: return GeneralHealthPlate;
  }
}
