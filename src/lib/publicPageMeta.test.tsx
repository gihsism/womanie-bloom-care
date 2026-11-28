import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import {
  PUBLIC_PAGE_META,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_DESCRIPTION,
  canonicalUrl,
  describePage,
  type PublicPath,
} from './publicPageMeta';
import { usePublicPageMeta } from '@/hooks/usePublicPageMeta';

const paths = Object.keys(PUBLIC_PAGE_META) as PublicPath[];

/** The words a page shows: tags and JSX spacing out, entities in, whitespace collapsed. */
function visibleText(src: string): string {
  return src
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{' '\}/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/’/g, "'");
}

describe('public page meta', () => {
  it('every description is the page’s own text (no new claims)', () => {
    for (const path of paths) {
      const { parts, source } = PUBLIC_PAGE_META[path];
      const raw = readFileSync(source, 'utf8');
      // index.html: the home text lives in its existing <meta name="description">.
      const text = source === 'index.html' ? raw : visibleText(raw);
      for (const part of parts) {
        // A headline gets a full stop to read as a sentence; the rest is verbatim.
        expect(text, `${path}: "${part}" not found in ${source}`).toContain(part.replace(/\.$/, ''));
      }
    }
  });

  it('each page has its own title and description, short enough for a search result', () => {
    const titles = paths.map(p => PUBLIC_PAGE_META[p].title);
    expect(new Set(titles).size).toBe(titles.length);
    const descs = paths.map(describePage);
    expect(new Set(descs).size).toBe(descs.length);
    for (const d of descs) expect(d.length).toBeLessThanOrEqual(170);
  });

  it('home defaults match index.html', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain(`<title>${DEFAULT_TITLE}</title>`);
    expect(html).toContain(`name="description" content="${DEFAULT_DESCRIPTION}"`);
    expect(html).toContain(`property="og:description" content="${DEFAULT_OG_DESCRIPTION}"`);
    // A canonical in index.html would be served on every route; the hook sets it per page.
    expect(html).not.toMatch(/rel="canonical"/);
  });

  it('every public route in App.tsx uses its entry', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    for (const path of paths) {
      expect(app, path).toContain(`path="${path}"`);
      const src = readFileSync(PUBLIC_PAGE_META[path].source === 'index.html' ? 'src/pages/Index.tsx' : PUBLIC_PAGE_META[path].source, 'utf8');
      expect(src, path).toContain(`usePublicPageMeta('${path}')`);
    }
  });

  it('canonical links are absolute on womanie.info', () => {
    expect(canonicalUrl('/')).toBe('https://womanie.info/');
    expect(canonicalUrl('/pricing')).toBe('https://womanie.info/pricing');
  });
});

function Page({ path }: { path: PublicPath }) {
  usePublicPageMeta(path);
  return null;
}

describe('usePublicPageMeta', () => {
  const head = () => ({
    title: document.title,
    description: document.head.querySelector('meta[name="description"]')?.getAttribute('content'),
    ogTitle: document.head.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    ogDescription: document.head.querySelector('meta[property="og:description"]')?.getAttribute('content'),
    ogUrl: document.head.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null,
    canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
  });

  it('sets the page’s title, description and canonical, and puts the home values back after', () => {
    const { unmount } = render(<Page path="/pricing" />);
    expect(head()).toEqual({
      title: 'Pricing — Womanie',
      description: describePage('/pricing'),
      ogTitle: 'Pricing — Womanie',
      ogDescription: describePage('/pricing'),
      ogUrl: 'https://womanie.info/pricing',
      canonical: 'https://womanie.info/pricing',
    });
    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    unmount();
    expect(head()).toEqual({
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      ogTitle: DEFAULT_TITLE,
      ogDescription: DEFAULT_OG_DESCRIPTION,
      ogUrl: null,
      canonical: null,
    });
  });

  it('the home page keeps its full title', () => {
    const { unmount } = render(<Page path="/" />);
    expect(document.title).toBe(DEFAULT_TITLE);
    expect(head().canonical).toBe('https://womanie.info/');
    unmount();
  });
});
