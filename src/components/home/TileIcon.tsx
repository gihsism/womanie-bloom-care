import type { ReactNode } from 'react';
import type { IconKey } from '@/lib/quickLog/tiles';

// Large line icons for Home's tiles and Today rows (idea 4 sprite, 24px
// grid, round caps). Colour comes from `currentColor` (the stage accent).

const P: Record<IconKey, ReactNode> = {
  drop: <path d="M12 3c3.5 4.2 6 7.6 6 10.8A6 6 0 0 1 6 13.8C6 10.6 8.5 7.2 12 3z" />,
  spot: <><circle cx="8" cy="9" r="2" /><circle cx="16" cy="8" r="1.4" /><circle cx="14" cy="15.5" r="2.4" /><circle cx="7.5" cy="16.5" r="1.2" /></>,
  cramp: <><path d="M4 13c2-3 3.5 3 5.5 0s3.5 3 5.5 0 3.5 3 5 0" /><path d="M6 19h12" /><path d="M8 7h8" /></>,
  head: <><path d="M7 20v-3.2A6.5 6.5 0 1 1 17.6 13l1.4 2.6h-2V18a2 2 0 0 1-2 2h-1" /><path d="M10.5 6.5 12 9l-2 1.5 1.5 2.5" /></>,
  moodlow: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 16.2c2-1.8 5-1.8 7 0" /><path d="M9 10h.01M15 10h.01" /></>,
  anxious: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 16c1-.8 2-.8 3 0s2 .8 3 0" /><path d="M8.5 9.5 10 10.5M15.5 9.5 14 10.5" /></>,
  heart: <path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" />,
  note: <><path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.5 18.5z" /><path d="M13.5 7.5l3 3" /></>,
  foot: <><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0z" /><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0z" /><path d="M16 17h4M4 13h4" /></>,
  wave: <path d="M3 12h3l2-5 3.5 11L14 9l2 3h5" />,
  nausea: <><circle cx="12" cy="12" r="8.5" /><path d="M8 15.5c1-1 2-1 3 0s2 1 3 0 2-1 2 0" /><path d="M8.5 9.5l1.5 1M15.5 9.5l-1.5 1" /></>,
  back: <><path d="M12 3v18" /><path d="M9 6h6M8.5 10h7M9 14h6M9.5 18h5" /></>,
  scale: <><rect x="3.5" y="4" width="17" height="16" rx="4" /><path d="M7.8 11a5.2 5.2 0 0 1 8.4 0" /><path d="M12 11.5l1.6-2.4" /></>,
  bottle: <><path d="M10 2.8h4M10.5 2.8v2.5L8 8v11.5a1.7 1.7 0 0 0 1.7 1.7h4.6a1.7 1.7 0 0 0 1.7-1.7V8l-2.5-2.7V2.8" /><path d="M8 12h3M8 15.5h3" /></>,
  dirty: <><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="3" /></>,
  wet: <><path d="M12 4c2.6 3.2 4.5 5.8 4.5 8.3a4.5 4.5 0 0 1-9 0C7.5 9.8 9.4 7.2 12 4z" /><path d="M4 20h16" /></>,
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  pill: <><rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" /><path d="M9.6 8.6l4.8 6.8" /></>,
  pillx: <><rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" /><path d="M16 18l4 4M20 18l-4 4" /></>,
  flame: <path d="M12 21a6 6 0 0 0 6-6c0-3.5-2.5-5.5-3.5-8.5-1.5 2-2 3.5-2.5 5-1-1-1.5-2.5-1.5-4C8 9.5 6 12 6 15a6 6 0 0 0 6 6z" />,
  joint: <><circle cx="12" cy="12" r="3" /><path d="M10 10 5 5M14 14l5 5" /><path d="M4 7l3-3M17 20l3-3" /></>,
  tired: <><circle cx="12" cy="12" r="8.5" /><path d="M8 10.5h2.5M13.5 10.5H16" /><path d="M9.5 15.5h5" /></>,
  breastL: <><circle cx="12" cy="12" r="7.5" /><path d="M12 4.5v15" /><path d="M12 4.5a7.5 7.5 0 0 0 0 15z" fill="currentColor" /></>,
  breastR: <><circle cx="12" cy="12" r="7.5" /><path d="M12 4.5v15" /><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" /></>,
  syringe: <><path d="M18 3l3 3M19.5 4.5 16 8" /><path d="M16.5 5.5l2 2-9 9-3.5.5.5-3.5z" /><path d="M10.5 9.5l2 2M8.5 11.5l2 2" /><path d="M6 18l-3 3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  cal: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  steth: <><path d="M6 3.5v5a4 4 0 0 0 8 0v-5" /><path d="M10 12.5v2a5 5 0 0 0 10 0v-1.5" /><circle cx="20" cy="11" r="2" /></>,
  flask: <><path d="M9.5 3.5h5M10.5 3.5v6L5.2 18.4a1.4 1.4 0 0 0 1.2 2.1h11.2a1.4 1.4 0 0 0 1.2-2.1L13.5 9.5v-6" /><path d="M7.5 15h9" /></>,
  acne: <><circle cx="12" cy="12" r="8.5" /><circle cx="9" cy="10" r="1" /><circle cx="14.5" cy="14" r="1.2" /><circle cx="15" cy="9" r=".8" /></>,
  bloat: <><circle cx="12" cy="12" r="8.5" /><path d="M7 12h10" /><path d="M9 8.5c1.8 1 4.2 1 6 0M9 15.5c1.8-1 4.2-1 6 0" /></>,
  lh: <><rect x="9" y="3" width="6" height="18" rx="2" /><path d="M9 9h6M11 13h2M11 16h2" /></>,
};

export default function TileIcon({ name, className = 'h-6 w-6', strokeWidth = 1.8 }: { name: IconKey; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
