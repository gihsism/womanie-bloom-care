import type { ReactElement, ReactNode } from 'react';
import { ACCENT, ArtSvg, INK, STONE_LO, STONE_MID, type ArtProps } from './primitives';

// Drawn mood faces for the Log sheet, replacing the emoji. Each is the
// body-map head (with its bun) in a 32 x 32 box: small eyes, one line for
// the mouth, nothing cartoonish. Keyed by the exact mood values the app
// stores: DailyLogging.tsx uses happy, calm, neutral, sad, irritable,
// anxious, loving, tired; calendar/DailyLogSheet.tsx adds energetic.

export const MOOD_VALUES = [
  'happy', 'calm', 'neutral', 'sad', 'irritable', 'anxious', 'loving', 'tired', 'energetic',
] as const;
export type MoodValue = (typeof MOOD_VALUES)[number];

const MOOD_LABELS: Record<MoodValue, string> = {
  happy: 'Happy', calm: 'Calm', neutral: 'Neutral', sad: 'Sad', irritable: 'Irritable',
  anxious: 'Anxious', loving: 'Loving', tired: 'Tired', energetic: 'Energetic',
};

type FaceProps = ArtProps & { size?: number | null };

function Face({ mood, title, className, size = 32, children }: FaceProps & { mood: MoodValue; children: ReactNode }) {
  return (
    <ArtSvg
      w={32} h={32}
      title={title === undefined ? MOOD_LABELS[mood] : title}
      className={className}
      name={`mood-${mood}`}
      size={size ?? undefined}
    >
      <circle cx="7.6" cy="8.4" r="4.4" fill={STONE_LO} stroke={INK} strokeWidth="1.2" />
      <circle cx="16.4" cy="17.4" r="11.6" fill={STONE_MID} stroke={INK} strokeWidth="1.3" />
      <g stroke={INK} strokeWidth="1.3" fill="none">{children}</g>
    </ArtSvg>
  );
}

const dots = (
  <>
    <circle cx="12.8" cy="15.6" r=".95" fill={INK} stroke="none" />
    <circle cx="19.8" cy="15.6" r=".95" fill={INK} stroke="none" />
  </>
);
const smileEyes = <path d="M11.4,15.8 q1.5,-1.7 3,0 M18.4,15.8 q1.5,-1.7 3,0" />;
const closedEyes = <path d="M11.4,15.2 q1.5,1.5 3,0 M18.4,15.2 q1.5,1.5 3,0" />;
const worriedBrows = <path d="M10.8,13 L14.2,11.6 M22,13 L18.6,11.6" strokeWidth="1" />;

export const MoodHappy = (p: FaceProps) => (
  <Face mood="happy" {...p}>{smileEyes}<path d="M11.8,20.4 q4.6,4 9.2,0" /></Face>
);
export const MoodCalm = (p: FaceProps) => (
  <Face mood="calm" {...p}>{closedEyes}<path d="M13.4,21.6 q3,1.5 6,0" /></Face>
);
export const MoodNeutral = (p: FaceProps) => (
  <Face mood="neutral" {...p}>{dots}<path d="M12.8,21.6 L20,21.4" /></Face>
);
export const MoodSad = (p: FaceProps) => (
  <Face mood="sad" {...p}>{worriedBrows}{dots}<path d="M12.6,23 q3.8,-3 7.6,0" /></Face>
);
export const MoodIrritable = (p: FaceProps) => (
  <Face mood="irritable" {...p}>
    <path d="M10.8,11.6 L14.4,13.2 M22,11.6 L18.4,13.2" strokeWidth="1" />
    {dots}
    <path d="M12.4,22 l2,-1.2 l2,1.2 l2,-1.2 l2,1.2" strokeWidth="1.1" />
  </Face>
);
export const MoodAnxious = (p: FaceProps) => (
  <Face mood="anxious" {...p}>
    {worriedBrows}{dots}
    <path d="M12.4,22 q2,-1.6 4,0 t4,0" strokeWidth="1.1" />
    <path d="M26.2,8.6 q-2,3 0,4.2 q2,-1.2 0,-4.2" strokeWidth=".9" />
  </Face>
);
export const MoodLoving = (p: FaceProps) => (
  <Face mood="loving" {...p}>
    {smileEyes}
    <path d="M12.6,20.6 q3.8,3.4 7.6,0" />
    <circle cx="10.6" cy="19.6" r="1.5" fill={ACCENT} stroke="none" opacity=".75" />
    <circle cx="22.2" cy="19.6" r="1.5" fill={ACCENT} stroke="none" opacity=".75" />
  </Face>
);
export const MoodTired = (p: FaceProps) => (
  <Face mood="tired" {...p}>
    <path d="M11.4,16 L14.6,16 M18.4,16 L21.6,16" />
    <path d="M11.6,14.2 q1.6,-.8 3,0 M18.6,14.2 q1.6,-.8 3,0" strokeWidth=".8" opacity=".6" />
    <circle cx="16.4" cy="21.8" r="1.5" />
    <path d="M24.6,3.6 h3.4 l-3.4,3.8 h3.4" strokeWidth="1" />
  </Face>
);
export const MoodEnergetic = (p: FaceProps) => (
  <Face mood="energetic" {...p}>
    {dots}
    <path d="M11.6,19.8 q4.8,5 9.6,0" />
    <path d="M25.4,6.4 l2.2,-2.2 M27.4,10.2 l3,-.6 M22.6,3.8 l.6,-2.8" strokeWidth="1" />
  </Face>
);

/** Mood face component for each stored mood value. */
export const MOOD_FACES: Record<MoodValue, (p: FaceProps) => ReactElement> = {
  happy: MoodHappy,
  calm: MoodCalm,
  neutral: MoodNeutral,
  sad: MoodSad,
  irritable: MoodIrritable,
  anxious: MoodAnxious,
  loving: MoodLoving,
  tired: MoodTired,
  energetic: MoodEnergetic,
};

export function isMoodValue(v: string): v is MoodValue {
  return (MOOD_VALUES as readonly string[]).includes(v);
}
