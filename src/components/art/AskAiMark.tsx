import { ACCENT, ArtSvg, INK, LINE, STONE_MID, type ArtProps } from './primitives';

// The Ask AI mark: a drawn speech mark with a leader-line dot inside, as if
// the assistant were annotating a plate. Replaces the stock robot / sparkles.
// 40 x 40 box; pass `size` for a fixed pixel size (defaults to 40), or
// `size={null}` to fill the container width.

export function AskAiMark({ title = 'Ask AI', className, size = 40 }: ArtProps & { size?: number | null }) {
  return (
    <ArtSvg w={40} h={40} title={title} className={className} name="ask-ai-mark" size={size ?? undefined}>
      <path
        d="M7,12 C7,7.5 10,5 15,5 L27,4.8 C31.6,4.8 34.4,7.6 34.4,12 L34.6,20.4 C34.6,24.8 31.8,27.4 27.2,27.4 L18,27.6 L10.6,34 L12,27.3 C8.8,26.6 7,24.4 7,21 Z"
        fill={STONE_MID}
        stroke={INK}
        strokeWidth="1.5"
      />
      <circle cx="14.2" cy="14.6" r="2.6" fill={ACCENT} stroke="none" />
      <path d="M17.4,14.6 L23,14.6 L26.6,11.4" stroke={INK} strokeWidth="1.1" />
      <path d="M14,20.6 L24,20.6" stroke={LINE} strokeWidth="1.1" />
    </ArtSvg>
  );
}
