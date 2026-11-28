import { useEffect } from 'react';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_DESCRIPTION,
  DEFAULT_TITLE,
  PUBLIC_PAGE_META,
  canonicalUrl,
  describePage,
  type PublicPath,
} from '@/lib/publicPageMeta';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Tab title, meta description, canonical link and og:* for a public page
 * (texts in src/lib/publicPageMeta.ts). Replaces usePageTitle on those
 * pages; puts the home page's values back when the page leaves.
 */
export function usePublicPageMeta(path: PublicPath) {
  useEffect(() => {
    const { title } = PUBLIC_PAGE_META[path];
    const fullTitle = title ? `${title} — Womanie` : DEFAULT_TITLE;
    const description = describePage(path);
    const url = canonicalUrl(path);
    document.title = fullTitle;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setCanonical(url);
    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('name', 'description', DEFAULT_DESCRIPTION);
      setMeta('property', 'og:title', DEFAULT_TITLE);
      setMeta('property', 'og:description', DEFAULT_OG_DESCRIPTION);
      document.head.querySelector('meta[property="og:url"]')?.remove();
      setCanonical(null);
    };
  }, [path]);
}
