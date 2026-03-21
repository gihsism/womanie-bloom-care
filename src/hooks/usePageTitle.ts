import { useEffect } from 'react';

const BASE_TITLE = 'Womanie';

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = `${BASE_TITLE} — Your Complete Women's Health Companion`;
    };
  }, [title]);
}
