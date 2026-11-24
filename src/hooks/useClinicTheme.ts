import { useLayoutEffect } from 'react';
import { applyClinicTheme } from '@/lib/stageTheme';

// Doctor pages wear the neutral "clinic" colours (doctors are not in a
// life stage). Layout effect so the first paint is already in clinic
// colours, and the previous stage comes back when the page unmounts.
export function useClinicTheme(): void {
  useLayoutEffect(() => applyClinicTheme(), []);
}
