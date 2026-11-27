import type { ReactElement, ReactNode } from 'react';
import {
  ACCENT, ArtDefs, ArtSvg, Ground, INK, LINE, PAPER, PEN, RULE, STONE_HI, STONE_LO,
  useArtIds, type ArtIds, type ArtProps,
} from './primitives';

// Empty states, 200 x 140: one small object on the table, drawn in the
// body-map hand, with a plain caption that says what goes here and how it
// starts. Decorative by default (the caption carries the meaning), so the
// svg is aria-hidden unless a title is passed.

const W = 200;
const H = 140;

export type EmptyStateKind = 'documents' | 'visits' | 'medicines' | 'chats' | 'charts' | 'search' | 'offline';

/** Suggested one-line captions, plain and specific. */
export const EMPTY_STATE_CAPTIONS: Record<EmptyStateKind, string> = {
  documents: 'Your lab results and doctor’s letters will live here. Add a PDF or a photo of the first one.',
  visits: 'No visits planned yet. Add your next appointment and keep your questions for it in one place.',
  medicines: 'No medicines listed. Add what you take, vitamins too, so the list is ready for your next visit.',
  chats: 'No conversations yet. Ask about a result, a symptom or this week of your cycle or pregnancy.',
  charts: 'A chart needs two results for the same test. Add an earlier report to see the line.',
  search: 'Nothing matches that. Try a shorter word, or the test name as it is written on your report.',
  offline: 'You are offline. Pages you have opened are still here; reconnect to upload or ask a question.',
};

function Scene({ name, title, className, children }: ArtProps & { name: string; children: (ids: ArtIds) => ReactNode }) {
  const ids = useArtIds();
  return (
    <ArtSvg w={W} h={H} title={title} className={className} name={name}>
      <ArtDefs ids={ids} shadow={5} />
      {children(ids)}
    </ArtSvg>
  );
}

/** Two sheets of lab paper, the top one with a range bar. */
export function EmptyDocuments({ title, className }: ArtProps) {
  return (
    <Scene name="empty-documents" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={102} cy={124} rx={46} />
          <g stroke={INK}>
            <path d="M60,30 L124,24 L132,114 L68,120 Z" fill={`url(#${ids.stone})`} strokeWidth="1.1" filter={`url(#${ids.shadow})`} />
            <g filter={`url(#${ids.shadow})`}>
              <path d="M76,22 L128,24 L142,38 L138,120 L72,118 Z" fill={STONE_HI} strokeWidth="1.2" />
            </g>
            <path d="M128,24 L127,38 L142,38" strokeWidth=".9" />
            <g strokeWidth=".7" opacity=".5">
              <path d="M84,40 h30 M84,48 h40 M84,56 h24" />
              <path d="M83,92 h44 M83,100 h34 M82,108 h40" />
            </g>
            <line x1="84" y1="74" x2="128" y2="75" stroke={RULE} strokeWidth="1" />
            <rect x="96" y="71" width="20" height="6" fill={STONE_LO} strokeWidth=".6" />
          </g>
          <circle cx="110" cy="74" r="2.4" fill={ACCENT} stroke="none" />
          <path d="M88,16 L88,30 C88,34 94,34 94,30 L94,20" stroke={PEN} strokeWidth="1" />
        </>
      )}
    </Scene>
  );
}

/** A calendar page with one day loosely circled. */
export function EmptyVisits({ title, className }: ArtProps) {
  return (
    <Scene name="empty-visits" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={100} cy={124} rx={46} />
          <g stroke={INK}>
            <g filter={`url(#${ids.shadow})`}>
              <path d="M58,30 L142,28 L144,116 L60,118 Z" fill={`url(#${ids.stone})`} strokeWidth="1.2" />
            </g>
            <path d="M58,44 L142,42" strokeWidth="1" />
            <path d="M78,22 v12 M122,21 v12" strokeWidth="1.6" />
            {Array.from({ length: 20 }, (_, i) => (
              <circle key={i} cx={70 + (i % 5) * 15} cy={56 + Math.floor(i / 5) * 15} r="1.3" fill={INK} stroke="none" opacity=".55" />
            ))}
          </g>
          <path d="M107,73 C99,72 97,64 104,60 C111,57 119,60 119,66 C119,72 113,74 106,72" stroke={ACCENT} strokeWidth="1.3" />
          <g stroke={INK}>
            <path d="M150,86 L170,118 L167,121 L147,89 Z" fill={STONE_HI} strokeWidth="1" />
            <path d="M170,118 L171,124 L167,121" strokeWidth="1" />
          </g>
        </>
      )}
    </Scene>
  );
}

/** A pill bottle with a capsule and a tablet beside it. */
export function EmptyMedicines({ title, className }: ArtProps) {
  return (
    <Scene name="empty-medicines" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={104} cy={122} rx={50} />
          <g stroke={INK}>
            <g filter={`url(#${ids.shadow})`}>
              <path d="M70,48 C70,44 72,42 76,42 L112,42 C116,42 118,44 118,48 L118,114 C118,118 116,120 112,120 L76,120 C72,120 70,118 70,114 Z" fill={`url(#${ids.stone})`} strokeWidth="1.2" />
              <rect x="66" y="24" width="56" height="19" rx="3" fill={STONE_LO} strokeWidth="1.2" />
            </g>
            <path d="M74,27 v13 M80,27 v13 M86,27 v13 M92,27 v13 M98,27 v13 M104,27 v13 M110,27 v13 M116,27 v13" strokeWidth=".6" opacity=".45" />
            <rect x="76" y="62" width="36" height="34" fill={STONE_HI} strokeWidth=".9" />
            <path d="M81,72 h22 M81,79 h16 M81,86 h20" strokeWidth=".6" opacity=".55" />
            <g transform="rotate(-24 146 112)">
              <path d="M134,107 L146,107 L146,117 L134,117 C131,117 129,115 129,112 C129,109 131,107 134,107 Z" fill={STONE_LO} strokeWidth="1" />
              <path d="M146,107 L158,107 C161,107 163,109 163,112 C163,115 161,117 158,117 L146,117 Z" fill={STONE_HI} strokeWidth="1" />
            </g>
            <ellipse cx="170" cy="120" rx="7" ry="3.6" fill={STONE_HI} strokeWidth="1" />
            <path d="M166,120 h8" strokeWidth=".6" opacity=".6" />
          </g>
          <circle cx="107" cy="72" r="1.8" fill={ACCENT} stroke="none" />
        </>
      )}
    </Scene>
  );
}

/** An empty speech mark, a leader line waiting for the first line of text. */
export function EmptyChats({ title, className }: ArtProps) {
  return (
    <Scene name="empty-chats" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={100} cy={124} rx={40} />
          <g stroke={INK}>
            <path d="M118,30 C138,29 154,34 154,52 C154,66 144,72 132,72" fill={STONE_HI} strokeWidth=".9" opacity=".7" />
            <g filter={`url(#${ids.shadow})`}>
              <path d="M54,46 C54,36 62,32 74,32 L122,31 C134,31 141,37 141,48 L142,82 C142,93 135,98 123,98 L88,99 L68,116 L72,99 C61,98 54,93 54,83 Z"
                fill={`url(#${ids.stone})`} strokeWidth="1.3" />
            </g>
          </g>
          <circle cx="74" cy="58" r="3" fill={ACCENT} stroke="none" />
          <line x1="80" y1="58" x2="122" y2="58" stroke={LINE} strokeWidth=".8" />
          <line x1="74" y1="74" x2="108" y2="74" stroke={LINE} strokeWidth=".8" strokeDasharray="1.5 4" />
        </>
      )}
    </Scene>
  );
}

/** Chart axes with a range band, one result, and an open circle for the next. */
export function EmptyCharts({ title, className }: ArtProps) {
  return (
    <Scene name="empty-charts" title={title} className={className}>
      {() => (
        <>
          <path d="M40,22 L40,112 L168,112" stroke={LINE} strokeWidth="1" />
          {[64, 96, 128, 160].map((x) => <line key={x} x1={x} y1="112" x2={x} y2="116" stroke={LINE} strokeWidth=".7" />)}
          <rect x="41" y="52" width="126" height="28" fill={STONE_LO} opacity=".55" stroke="none" />
          <path d="M41,52 h126 M41,80 h126" stroke={INK} strokeWidth=".6" opacity=".35" />
          <circle cx="68" cy="70" r="4.2" fill={PEN} stroke={PAPER} strokeWidth="1.2" />
          <path d="M73,68 C96,62 116,60 138,58" stroke={LINE} strokeWidth=".9" strokeDasharray="2 4" />
          <circle cx="146" cy="57" r="6" fill={PAPER} stroke={ACCENT} strokeWidth="1.3" />
        </>
      )}
    </Scene>
  );
}

/** A lens over a sheet: the lines under it are blank. */
export function EmptySearch({ title, className }: ArtProps) {
  return (
    <Scene name="empty-search" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={100} cy={124} rx={48} />
          <g stroke={INK}>
            <g filter={`url(#${ids.shadow})`}>
              <path d="M56,26 L130,24 L134,116 L60,118 Z" fill={STONE_HI} strokeWidth="1.2" />
            </g>
            <g strokeWidth=".7" opacity=".5">
              <path d="M66,38 h52 M66,46 h40 M66,98 h50 M67,106 h36" />
              <path d="M66,56 h8 M66,64 h6 M66,72 h8 M66,80 h6" />
            </g>
            <circle cx="104" cy="68" r="24" fill={`url(#${ids.stone})`} fillOpacity=".55" strokeWidth="1.3" />
            <circle cx="104" cy="68" r="19" strokeWidth=".6" opacity=".4" />
            <path d="M121,85 L146,110" stroke={PEN} strokeWidth="5" />
            <path d="M121,85 L146,110" stroke={STONE_LO} strokeWidth="2.4" />
          </g>
          <circle cx="96" cy="62" r="2.2" fill={ACCENT} stroke="none" />
        </>
      )}
    </Scene>
  );
}

/** A plug lying apart from its socket. */
export function EmptyOffline({ title, className }: ArtProps) {
  return (
    <Scene name="empty-offline" title={title} className={className}>
      {(ids) => (
        <>
          <Ground cx={104} cy={118} rx={64} />
          <path d="M12,108 C40,112 54,96 70,88 C78,84 82,82 86,80" stroke={PEN} strokeWidth="1.6" />
          <g stroke={INK} filter={`url(#${ids.shadow})`}>
            <path d="M84,70 L104,66 C108,65 110,68 110,72 L111,86 C111,90 109,92 105,92 L86,94 Z" fill={`url(#${ids.stone})`} strokeWidth="1.2" />
          </g>
          <path d="M110,74 L120,73 M111,84 L121,83" stroke={PEN} strokeWidth="1.6" />
          <line x1="126" y1="78" x2="140" y2="77" stroke={LINE} strokeWidth=".8" strokeDasharray="1.5 3.5" />
          <g stroke={INK} filter={`url(#${ids.shadow})`}>
            <path d="M146,52 L180,50 C183,50 185,52 185,55 L186,104 C186,107 184,109 181,109 L148,110 C145,110 143,108 143,105 L142,56 C142,53 143,52 146,52 Z" fill={STONE_HI} strokeWidth="1.2" />
          </g>
          <circle cx="164" cy="80" r="13" stroke={INK} strokeWidth=".9" />
          <circle cx="160" cy="80" r="1.8" fill={INK} stroke="none" />
          <circle cx="168" cy="80" r="1.8" fill={INK} stroke="none" />
          <circle cx="12" cy="108" r="2" fill={ACCENT} stroke="none" />
        </>
      )}
    </Scene>
  );
}

export const EMPTY_STATES: Record<EmptyStateKind, (p: ArtProps) => ReactElement> = {
  documents: EmptyDocuments,
  visits: EmptyVisits,
  medicines: EmptyMedicines,
  chats: EmptyChats,
  charts: EmptyCharts,
  search: EmptySearch,
  offline: EmptyOffline,
};
