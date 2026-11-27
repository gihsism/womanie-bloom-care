import { useEffect } from 'react';

const BASE_TITLE = 'Womanie';
// Same as <title> in index.html: the landing page (no usePageTitle) shows it after a page leaves.
const DEFAULT_TITLE = 'Womanie - Cycle, pregnancy, menopause and your lab results';

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
