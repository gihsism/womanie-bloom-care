// Guideline-page ingestion: authoritative public web pages (NHS, CDC,
// NLM LactMed, ...) turned into research-library candidates.
//
// Pure functions only (no fs, no network, no relative imports), so that
//   - scripts/research/guideline-pages.mjs can import this file directly
//     through Node's type stripping, and
//   - no serverless function ever pulls it in: nothing under api/ that a
//     Vercel function imports references this module or the staging file.
//
// Pipeline (driven by the script):
//   publisherFor(url) -> robots check -> fetch -> extractPage(html)
//   -> chunkBlocks() -> summariser (extractive by default, paid optional)
//   -> buildGuidelineItem() -> validateLibraryItem() -> staging file.
//
// Items keep the library.json schema (ResearchItem in library.ts) and add
// sourceType "guideline-page" plus a `page` block with publisher, licence,
// dates and robots provenance. They are candidates: the founder decides
// which ones go into library.json.

// Mirrors LIFE_STAGES in library.ts (kept local: no relative imports, see
// above). guideline-page.test.ts asserts the two lists are identical.
export const ITEM_LIFE_STAGES = [
  'menstrual-cycle',
  'conception',
  'pregnancy',
  'postpartum',
  'contraception',
  'ivf',
  'menopause',
  'post-menopause',
  'general',
] as const;

export const GUIDELINE_SOURCE_TYPE = 'guideline-page' as const;
export const EXTRACTIVE_SUMMARISER = 'extractive-v1';
export const USER_AGENT = 'WomanieResearchLibrarian/1.0 (+https://womanie.info; research-library curation, manual runs only)';
/** Robots group name we look for before falling back to "*". */
export const ROBOTS_AGENT = 'womanieresearchlibrarian';

// ── HTML parsing (small, tolerant, dependency-free) ──────────────────

export interface HtmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
}
export type HtmlNode = HtmlElement | string;

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'template', 'svg', 'math']);
/** Opening one of these closes an open <p> (HTML's implied end tags, simplified). */
const CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', hellip: '…', middot: '·', bull: '•', deg: '°', micro: 'µ', plusmn: '±', times: '×',
  le: '≤', ge: '≥', lt_: '<', pound: '£', euro: '€', copy: '©', reg: '®', trade: '™', frac12: '½', frac14: '¼',
  frac34: '¾', shy: '', zwnj: '', zwj: '', thinsp: ' ', ensp: ' ', emsp: ' ', minus: '−', rarr: '→', larr: '←',
  eacute: 'é', egrave: 'è', ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß', sup2: '²', sup3: '³', alpha: 'α', beta: 'β',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    const v = NAMED_ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

const TAG_RE = /<([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/y;
const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const CLOSE_RE = /<\/([a-zA-Z][\w:-]*)\s*>/y;

/** Parses HTML into a tree rooted at a synthetic "#document" element. */
export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = { tag: '#document', attrs: {}, children: [] };
  const stack: HtmlElement[] = [root];
  const top = () => stack[stack.length - 1];
  const popTo = (i: number) => {
    stack.length = i;
  };
  const indexOfOpen = (tag: string, stopAt: string[] = []): number => {
    for (let i = stack.length - 1; i > 0; i--) {
      if (stack[i].tag === tag) return i;
      if (stopAt.includes(stack[i].tag)) return -1;
    }
    return -1;
  };
  let i = 0;
  let text = '';
  const flushText = () => {
    if (text) top().children.push(decodeEntities(text));
    text = '';
  };
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      text += html.slice(i);
      break;
    }
    text += html.slice(i, lt);
    i = lt;
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[i + 1] === '!' || html[i + 1] === '?') {
      const end = html.indexOf('>', i);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    CLOSE_RE.lastIndex = i;
    const close = CLOSE_RE.exec(html);
    if (close) {
      flushText();
      const tag = close[1].toLowerCase();
      const at = indexOfOpen(tag);
      if (at > 0) popTo(at);
      i = CLOSE_RE.lastIndex;
      continue;
    }
    TAG_RE.lastIndex = i;
    const open = TAG_RE.exec(html);
    if (!open) {
      text += '<';
      i += 1;
      continue;
    }
    flushText();
    i = TAG_RE.lastIndex;
    const tag = open[1].toLowerCase();
    const attrs: Record<string, string> = {};
    ATTR_RE.lastIndex = 0;
    let a: RegExpExecArray | null;
    while ((a = ATTR_RE.exec(open[2]))) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
    // Implied end tags.
    if (CLOSES_P.has(tag) && top().tag === 'p') stack.pop();
    if (tag === 'li') {
      const at = indexOfOpen('li', ['ul', 'ol']);
      if (at > 0) popTo(at);
    }
    if (tag === 'dt' || tag === 'dd') {
      const at = Math.max(indexOfOpen('dt', ['dl']), indexOfOpen('dd', ['dl']));
      if (at > 0) popTo(at);
    }
    if (tag === 'tr') {
      const at = indexOfOpen('tr', ['table']);
      if (at > 0) popTo(at);
    }
    if (tag === 'td' || tag === 'th') {
      const at = Math.max(indexOfOpen('td', ['tr', 'table']), indexOfOpen('th', ['tr', 'table']));
      if (at > 0) popTo(at);
    }
    const el: HtmlElement = { tag, attrs, children: [] };
    top().children.push(el);
    if (RAW_TEXT_TAGS.has(tag) && !open[3]) {
      const endRe = new RegExp(`</${tag}\\s*>`, 'ig');
      endRe.lastIndex = i;
      const m = endRe.exec(html);
      const end = m ? m.index : html.length;
      const raw = html.slice(i, end);
      if (raw) el.children.push(tag === 'title' || tag === 'textarea' ? decodeEntities(raw) : raw);
      i = m ? endRe.lastIndex : html.length;
      continue;
    }
    if (!VOID_TAGS.has(tag) && !open[3]) stack.push(el);
  }
  flushText();
  return root;
}

export function textContent(node: HtmlNode): string {
  if (typeof node === 'string') return node;
  if (RAW_TEXT_TAGS.has(node.tag) && node.tag !== 'title') return '';
  return node.children.map(textContent).join(node.tag === 'br' ? '\n' : '');
}

const clean = (s: string) => s.replace(/[ \s]+/g, ' ').trim();

function* walk(node: HtmlElement): Generator<HtmlElement> {
  yield node;
  for (const c of node.children) if (typeof c !== 'string') yield* walk(c);
}

function find(root: HtmlElement, pred: (el: HtmlElement) => boolean): HtmlElement | null {
  for (const el of walk(root)) if (pred(el)) return el;
  return null;
}

// ── Main-text extraction ─────────────────────────────────────────────

/** Tags whose whole subtree is never page content. */
const DROP_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'svg', 'math', 'nav', 'header', 'footer', 'aside', 'form', 'button',
  'iframe', 'object', 'canvas', 'select', 'input', 'textarea', 'dialog', 'img', 'picture', 'video', 'audio', 'head',
]);
/**
 * class / id / aria-label words marking page furniture: cookie banners,
 * breadcrumbs, share and feedback widgets, "on this page" lists, related
 * links, review-date footers (their dates are read from the whole page
 * before extraction).
 */
const NOISE_RE =
  /(^|[\s_-])(cookies?|cookie-banner|breadcrumbs?|skip-?link|share|sharing|social|feedback|newsletter|related|promo|print|back-to-top|review-date|sidebar|side-nav|navigation|navbar|pagination|banner|survey|toc|contents-list|on-this-page|in-this-guidance|page-nav|subnav|hidden|visually-hidden|sr-only|modal|popup|alert-banner|site-header|site-footer|global-header|global-footer)([\s_-]|$)/i;

function isNoise(el: HtmlElement): boolean {
  if (DROP_TAGS.has(el.tag)) return true;
  if ('hidden' in el.attrs || el.attrs['aria-hidden'] === 'true') return true;
  const role = el.attrs.role ?? '';
  if (/^(navigation|banner|contentinfo|search|complementary|dialog|alert)$/i.test(role)) return true;
  const marks = `${el.attrs.class ?? ''} ${el.attrs.id ?? ''} ${el.attrs['aria-label'] ?? ''}`;
  return NOISE_RE.test(marks);
}

export type PageBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'para'; text: string }
  | { type: 'item'; text: string }
  | { type: 'row'; text: string };

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'main', 'ul', 'ol', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'caption', 'details', 'summary', 'address', 'hr', 'body', 'html', 'center',
]);

/** The element holding the page's own content. */
export function mainRoot(doc: HtmlElement): HtmlElement {
  const main = find(doc, (el) => el.tag === 'main') ?? find(doc, (el) => el.attrs.role === 'main');
  if (main) return main;
  const articles = [...walk(doc)].filter((el) => el.tag === 'article');
  if (articles.length) return articles.sort((a, b) => textContent(b).length - textContent(a).length)[0];
  const byId = find(doc, (el) => /^(main-?content|maincontent|content|main)$/i.test(el.attrs.id ?? ''));
  return byId ?? find(doc, (el) => el.tag === 'body') ?? doc;
}

/** Headings, paragraphs, list items and table rows of the main content, in reading order. */
export function extractBlocks(root: HtmlElement): PageBlock[] {
  const blocks: PageBlock[] = [];
  let buf = '';
  let inItem = 0;
  const flush = () => {
    const t = clean(buf);
    buf = '';
    if (t) blocks.push({ type: inItem > 0 ? 'item' : 'para', text: t });
  };
  const visit = (node: HtmlNode) => {
    if (typeof node === 'string') {
      buf += node;
      return;
    }
    if (node !== root && isNoise(node)) return;
    const h = /^h([1-6])$/.exec(node.tag);
    if (h) {
      flush();
      const t = clean(textContent(node));
      if (t) blocks.push({ type: 'heading', level: Number(h[1]), text: t });
      return;
    }
    if (node.tag === 'tr') {
      flush();
      const cells = node.children
        .filter((c): c is HtmlElement => typeof c !== 'string' && (c.tag === 'td' || c.tag === 'th') && !isNoise(c))
        .map((c) => clean(textContent(c)))
        .filter(Boolean);
      if (cells.length) blocks.push({ type: 'row', text: cells.join(' | ') });
      return;
    }
    if (node.tag === 'br') {
      buf += ' ';
      return;
    }
    if (node.tag === 'li') {
      flush();
      inItem++;
      node.children.forEach(visit);
      flush();
      inItem--;
      return;
    }
    const block = BLOCK_TAGS.has(node.tag);
    if (block) flush();
    node.children.forEach(visit);
    if (block) flush();
  };
  visit(root);
  flush();
  // Drop exact repeats (sticky "Contents" boxes, duplicated mobile blocks).
  const seen = new Set<string>();
  return blocks.filter((b) => {
    const k = `${b.type}:${b.text}`;
    if (b.type !== 'heading' && seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── Page metadata (dates, title, copyright) ──────────────────────────

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DATE_SRC =
  String.raw`(\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?|\d{1,2}(?:st|nd|rd|th)? [A-Z][a-z]+,? \d{4}|[A-Z][a-z]+\.? \d{1,2}(?:st|nd|rd|th)?,? \d{4}|[A-Z][a-z]+ \d{4}|\d{1,2}/\d{1,2}/\d{4})`;

/** "14 August 2025", "August 15, 2025", "Aug 2025", "2025-08-14" -> "2025-08-14" / "2025-08"; null if unreadable. */
export function normaliseDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const month = (name: string) => {
    const n = name.toLowerCase().replace(/\.$/, '');
    const i = MONTHS.findIndex((x) => x === n || (n.length >= 3 && x.startsWith(n)));
    return i < 0 ? null : String(i + 1).padStart(2, '0');
  };
  m = /^(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]+),? (\d{4})$/.exec(t);
  if (m && month(m[2])) return `${m[3]}-${month(m[2])}-${m[1].padStart(2, '0')}`;
  m = /^([A-Za-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/.exec(t);
  if (m && month(m[1])) return `${m[3]}-${month(m[1])}-${m[2].padStart(2, '0')}`;
  m = /^([A-Za-z]+) (\d{4})$/.exec(t);
  if (m && month(m[1])) return `${m[2]}-${month(m[1])}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); // US style, as on CDC pages
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

export interface PageMeta {
  title: string;
  description: string | null;
  siteName: string | null;
  published: string | null;
  lastUpdated: string | null;
  lastReviewed: string | null;
  nextReview: string | null;
  copyright: string | null;
  language: string | null;
}

function metaContent(doc: HtmlElement, ...names: string[]): string | null {
  for (const n of names) {
    const el = find(doc, (e) => e.tag === 'meta' && ((e.attrs.name ?? e.attrs.property ?? '').toLowerCase() === n.toLowerCase()));
    const v = el?.attrs.content?.trim();
    if (v) return v;
  }
  return null;
}

function labelledDate(text: string, label: string): string | null {
  const m = new RegExp(`${label}\\s*:?\\s*(?:on\\s+)?${DATE_SRC}`, 'i').exec(text);
  return m ? normaliseDate(m[1]) : null;
}

export function extractMeta(doc: HtmlElement): PageMeta {
  const visible = clean(textContent(find(doc, (e) => e.tag === 'body') ?? doc));
  const titleEl = find(doc, (e) => e.tag === 'title');
  const h1 = find(mainRoot(doc), (e) => e.tag === 'h1') ?? find(doc, (e) => e.tag === 'h1');
  // og:title before the h1: NHS h1s carry a nested "Other brands: ..." caption.
  const rawTitle =
    metaContent(doc, 'citation_title', 'DC.title', 'dcterms.title', 'og:title') ??
    (h1 ? clean(textContent(h1)) : null) ??
    (titleEl ? clean(textContent(titleEl)) : '');
  const html = find(doc, (e) => e.tag === 'html');
  const copyright = /(©|\(c\)|Copyright)\s*[^.|\n]{2,120}/i.exec(visible)?.[0] ?? (/Crown copyright/i.test(visible) ? 'Crown copyright' : null);
  return {
    title: clean(rawTitle ?? ''),
    description: metaContent(doc, 'description', 'og:description', 'DC.description'),
    siteName: metaContent(doc, 'og:site_name', 'DC.publisher', 'citation_publisher'),
    published:
      normaliseDate(metaContent(doc, 'article:published_time', 'citation_publication_date', 'citation_date', 'DC.date.issued', 'dcterms.issued')) ??
      labelledDate(visible, '(?:first\\s+)?published'),
    lastUpdated:
      normaliseDate(metaContent(doc, 'article:modified_time', 'dcterms.modified', 'DC.date.modified', 'cdc:last_updated')) ??
      labelledDate(visible, 'last\\s+(?:updated|revised|revision|modified)') ??
      labelledDate(visible, '(?:updated|revised)'),
    lastReviewed: normaliseDate(metaContent(doc, 'cdc:last_reviewed', 'last-reviewed', 'DC.date.reviewed')) ?? labelledDate(visible, '(?:page\\s+)?last\\s+reviewed'),
    nextReview: labelledDate(visible, 'next\\s+review\\s+(?:due|date)'),
    copyright: copyright ? clean(copyright) : null,
    language: html?.attrs.lang ?? null,
  };
}

export interface ExtractedPage {
  meta: PageMeta;
  blocks: PageBlock[];
  /** All main-text characters, for size checks and the content hash. */
  text: string;
}

export function extractPage(html: string): ExtractedPage {
  const doc = parseHtml(html);
  const meta = extractMeta(doc);
  let blocks = extractBlocks(mainRoot(doc));
  // A leading h1 is the page title (kept in meta.title), not a section.
  if (blocks[0]?.type === 'heading' && blocks[0].level === 1) blocks = blocks.slice(1);
  return { meta, blocks, text: blocks.map((b) => b.text).join('\n') };
}

// ── Sentences and chunks ─────────────────────────────────────────────

const ABBREV = /(?:\b(?:e\.g|i\.e|etc|vs|approx|Dr|Mr|Mrs|Ms|No|Fig|al|St|incl|min|max|mg|ml|kg)|\bU\.S|\bU\.K)\.$/i;

/** Splits on sentence ends, keeping abbreviations ("e.g.") and decimals intact. */
export function splitSentences(text: string): string[] {
  const parts = clean(text).split(/(?<=[.!?…])\s+(?=["“‘(]?[A-Z0-9])/);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out.filter(Boolean);
}

export interface PageChunk {
  /** `${itemId}#${n}`, n = 1.. in reading order */
  id: string;
  n: number;
  /** Heading path, e.g. "Breastfeeding > How much passes into milk" ("" before the first heading). */
  section: string;
  text: string;
}

export interface ChunkOptions {
  /** Hard ceiling per chunk (characters). */
  maxChars?: number;
  /** A chunk is closed once it reaches this size at a block boundary. */
  targetChars?: number;
}

/**
 * Groups blocks into passages of about targetChars (800-1200 by default,
 * like the PMC full-text passages). A new heading always starts a new
 * chunk; a block longer than maxChars is split at sentence ends; a
 * sentence longer than maxChars is cut at a word boundary.
 */
export function chunkBlocks(itemId: string, blocks: PageBlock[], opts: ChunkOptions = {}): PageChunk[] {
  const maxChars = opts.maxChars ?? 1200;
  const targetChars = Math.min(opts.targetChars ?? 800, maxChars);
  const chunks: PageChunk[] = [];
  const path: string[] = [];
  let cur: string[] = [];
  let curLen = 0;
  let section = '';
  const close = () => {
    if (cur.length) chunks.push({ id: `${itemId}#${chunks.length + 1}`, n: chunks.length + 1, section, text: cur.join('\n') });
    cur = [];
    curLen = 0;
  };
  const add = (piece: string) => {
    if (curLen && curLen + 1 + piece.length > maxChars) close();
    cur.push(piece);
    curLen += (curLen ? 1 : 0) + piece.length;
    if (curLen >= targetChars) close();
  };
  for (const b of blocks) {
    if (b.type === 'heading') {
      close();
      // h1 is the page title; sections hang off h2..h6.
      const depth = Math.max(0, b.level - 2);
      path.length = Math.min(path.length, depth);
      if (b.level >= 2) path[depth] = b.text;
      section = path.filter(Boolean).join(' > ');
      continue;
    }
    const text = b.type === 'item' ? `- ${b.text}` : b.text;
    if (text.length <= maxChars) {
      add(text);
      continue;
    }
    for (const s of splitSentences(text)) {
      if (s.length <= maxChars) {
        add(s);
        continue;
      }
      let rest = s;
      while (rest.length > maxChars) {
        const cut = rest.lastIndexOf(' ', maxChars);
        const at = cut > maxChars / 2 ? cut : maxChars;
        add(rest.slice(0, at));
        rest = rest.slice(at).trim();
      }
      if (rest) add(rest);
    }
  }
  close();
  return chunks;
}

// ── Summarisers ──────────────────────────────────────────────────────

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  /** Optional extras a model-based summariser may return. */
  tags?: string[];
  keywords?: string[];
  certainty?: ResearchItemLike['certainty'];
}

/** A summariser turns an extracted page into summary + key points. `focus` = curated tags. */
export type Summariser = (page: ExtractedPage, ctx: { url: string; publisher: string; focus?: string[] }) => Promise<SummaryResult>;

const MAX_SUMMARY_CHARS = 450;
const MAX_KEY_POINTS = 6;

const cap = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n - 1))}…`);

/** A date line, byline or other scrap that is not a sentence of content. */
const isScrap = (t: string) => t.length < 40 && !/[.!?:]$/.test(t);

/** Text blocks under each h2/h3, in order (lead text before the first one has heading ""). */
function sections(blocks: PageBlock[]): { heading: string; texts: string[]; items: boolean[] }[] {
  const out: { heading: string; texts: string[]; items: boolean[] }[] = [{ heading: '', texts: [], items: [] }];
  for (const b of blocks) {
    if (b.type === 'heading') {
      if (b.level <= 3) out.push({ heading: b.text, texts: [], items: [] });
      continue;
    }
    const s = out[out.length - 1];
    if (!s.texts.length && b.type === 'para' && isScrap(b.text)) continue;
    s.texts.push(b.text);
    s.items.push(b.type === 'item');
  }
  return out.filter((s) => s.texts.length);
}

/**
 * First sentence of a section; a sentence that introduces a list
 * ("Fertility treatments include:") takes the first list items with it.
 */
function firstPoint(s: { texts: string[]; items: boolean[] }): string | null {
  const sentence = splitSentences(s.texts[0])[0];
  if (!sentence) return null;
  if (!sentence.endsWith(':')) return sentence;
  const items: string[] = [];
  for (let i = 1; i < s.texts.length && s.items[i] && items.length < 3; i++) items.push(s.texts[i].replace(/[.;]$/, ''));
  return items.length ? `${sentence} ${items.join('; ')}.` : null;
}

/**
 * Default, free summariser: the page's first sentences plus its headings.
 * No model call, nothing invented: every word comes from the page.
 *   summary   = first 2 sentences of the lead (or first section), capped,
 *               plus "Covers: <h2/h3 headings>."
 *   keyPoints = "<heading>: <first sentence of that section>", up to 6.
 */
export function extractiveSummary(page: ExtractedPage, focus: string[] = []): SummaryResult {
  const secs = sections(page.blocks);
  const first = secs[0];
  const lead = first ? splitSentences(first.texts.join(' ')).slice(0, 2).join(' ') : '';
  // "Covers" lists the top-level (h2) headings; h3s only if there are no h2s.
  const top = page.blocks.filter((b): b is Extract<PageBlock, { type: 'heading' }> => b.type === 'heading' && b.level >= 2 && b.level <= 3);
  const minLevel = Math.min(...top.map((b) => b.level));
  const headings = [...new Set(top.filter((b) => b.level === minLevel).map((b) => b.text))];
  const covers = headings.length ? ` Covers: ${headings.slice(0, 8).join('; ')}.` : '';
  const summary = `${cap(lead || page.meta.description || page.meta.title, MAX_SUMMARY_CHARS)}${covers}`.trim();

  // Sections about the curated focus terms (e.g. "breastfeeding" on a
  // whole-medicine page) go first; otherwise reading order.
  // Terms already in the page title (the page's own subject) say nothing
  // about which section matters, so they do not count.
  const titleLower = page.meta.title.toLowerCase();
  const terms = focus.map((f) => f.toLowerCase()).filter((f) => f.length > 2 && !titleLower.includes(f));
  const hits = (sec: { heading: string; texts: string[] }) => terms.filter((t) => `${sec.heading} ${sec.texts[0]}`.toLowerCase().includes(t)).length;
  const ordered = secs.map((sec, i) => ({ sec, i, h: hits(sec) })).sort((a, b) => b.h - a.h || a.i - b.i).map((x) => x.sec);

  const keyPoints: string[] = [];
  for (const s of ordered) {
    if (keyPoints.length >= MAX_KEY_POINTS) break;
    const sentence = firstPoint(s);
    if (!sentence || (s === first && !s.heading && lead.startsWith(sentence))) continue;
    keyPoints.push(cap(s.heading ? `${s.heading}: ${sentence}` : sentence, 300));
  }
  // Short pages: fill up from the next sentences so there are at least two.
  if (keyPoints.length < 2) {
    const sentences = page.blocks.filter((b) => b.type !== 'heading').flatMap((b) => splitSentences(b.text));
    for (const s of sentences) {
      if (keyPoints.length >= 2) break;
      if (!lead.includes(s) && !keyPoints.some((k) => k.includes(s))) keyPoints.push(cap(s, 300));
    }
  }
  return { summary, keyPoints };
}

export const extractiveSummariser: Summariser = async (page, ctx) => extractiveSummary(page, ctx.focus ?? []);

// ── Publishers, licences, robots ─────────────────────────────────────

export interface PublisherPolicy {
  /** Display name, used as item.source / organisation. */
  publisher: string;
  hosts: string[];
  /**
   * allowed = may be fetched and staged; licence-required = never fetched by this script;
   * summary-only = never fetched or stored: the library item is a summary written by hand
   * in our own words from the official page, with its link (no text copied).
   */
  ingest: 'allowed' | 'licence-required' | 'summary-only';
  licence: { name: string; url: string | null; termsUrl: string; notes: string };
  evidenceLevel: 'guideline' | 'systematic review' | 'study';
  publicationType: string;
  /** Page must contain this (case-insensitive) to be accepted, e.g. LactMed among other Bookshelf books. */
  requireText?: string;
  /** Terms ask copies to be refreshed (or dated) at least this often. */
  refreshDays?: number;
  /** Text the app must display next to the content. */
  attribution?: string;
}

/**
 * Licence and reuse terms, read from each publisher's terms page on
 * 2026-11-26. Only hosts listed here are ever fetched.
 */
export const PUBLISHERS: PublisherPolicy[] = [
  {
    publisher: 'NHS',
    hosts: ['www.nhs.uk'],
    ingest: 'allowed',
    licence: {
      name: 'Open Government Licence v3.0',
      url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      termsUrl: 'https://www.nhs.uk/our-policies/terms-and-conditions/',
      notes:
        'NHS website content is released under the OGL v3.0, commercial use included (terms 3.3-3.4). ' +
        'Must show "Information from the NHS website is licensed under the Open Government Licence v3.0" with a link. ' +
        'Unchanged copies must show the date copied or be refreshed at least every 7 days (terms 3.6). ' +
        'Excluded from the OGL: logos, images with people, third-party content, medical devices (terms 3.5).',
    },
    evidenceLevel: 'guideline',
    publicationType: 'Patient information page',
    refreshDays: 7,
    attribution: 'Information from the NHS website is licensed under the Open Government Licence v3.0.',
  },
  {
    publisher: 'NLM LactMed (NIH)',
    hosts: ['www.ncbi.nlm.nih.gov'],
    ingest: 'allowed',
    licence: {
      name: 'Public domain (US Government work)',
      url: 'https://www.nlm.nih.gov/web_policies.html',
      termsUrl: 'https://www.ncbi.nlm.nih.gov/home/about/policies/',
      notes:
        'LactMed (Drugs and Lactation Database) is produced by the US National Library of Medicine; US Government works carry no US copyright. ' +
        'Cite NLM as the source and do not imply NIH endorsement. Other NCBI Bookshelf books can be copyrighted: only LactMed pages are accepted. ' +
        'NCBI asks automated access to stay under 3 requests per second.',
    },
    evidenceLevel: 'guideline',
    publicationType: 'Drug database monograph (LactMed)',
    requireText: 'Drugs and Lactation Database',
    attribution: 'Source: Drugs and Lactation Database (LactMed®), National Library of Medicine (US).',
  },
  {
    publisher: 'CDC',
    hosts: ['www.cdc.gov'],
    ingest: 'allowed',
    licence: {
      name: 'Public domain (US Government work)',
      url: 'https://www.cdc.gov/other/agencymaterials.html',
      termsUrl: 'https://www.cdc.gov/other/agencymaterials.html',
      notes:
        'Most CDC web content is in the public domain and may be reused without permission; credit CDC, do not imply endorsement, ' +
        'and do not reuse CDC logos or third-party images marked as copyrighted.',
    },
    evidenceLevel: 'guideline',
    publicationType: 'Public health guidance page',
    attribution: 'Source: Centers for Disease Control and Prevention (CDC).',
  },
  {
    publisher: 'NICE',
    hosts: ['www.nice.org.uk', 'cks.nice.org.uk'],
    ingest: 'licence-required',
    licence: {
      name: '© NICE, all rights reserved (NICE UK Open Content Licence: UK only)',
      url: null,
      termsUrl: 'https://www.nice.org.uk/terms-and-conditions',
      notes:
        'NICE terms 18.2: outside the UK, NICE content may not be "used in any information or retrieval system" without NICE\'s prior written agreement (licence and fee possible). ' +
        'Terms 18.3: any use for artificial-intelligence purposes needs approval, a licence and (internationally) a fee. Womanie serves users outside the UK, so NICE pages are not fetched until NICE grants a licence.',
    },
    evidenceLevel: 'guideline',
    publicationType: 'Clinical guideline page',
  },
  {
    publisher: 'WHO',
    hosts: ['www.who.int', 'cdn.who.int', 'iris.who.int'],
    ingest: 'licence-required',
    licence: {
      name: 'CC BY-NC-SA 3.0 IGO (most WHO publications)',
      url: 'https://creativecommons.org/licenses/by-nc-sa/3.0/igo/',
      termsUrl: 'https://www.who.int/about/policies/publishing/copyright',
      notes: 'Non-commercial licence: reuse in a commercial app needs WHO permission. Not fetched until permission is recorded.',
    },
    evidenceLevel: 'guideline',
    publicationType: 'Guideline',
  },
];

/**
 * Official Swiss sources the app already cites (round 4, 2026-11-27).
 * admin.ch terms require written consent to reproduce content, and the
 * SGGG expert letters are copyrighted journal articles, so nothing is
 * fetched or stored: each library item is a hand-written summary of the
 * facts with a link. (Federal ordinances such as the KLV are not
 * protected by copyright, URG Art. 5.)
 */
const SWISS_SUMMARY_ONLY = 'Summary-only: the library item is a hand-written summary in our own words, with a link to the official page. No page text is copied, fetched or stored.';

PUBLISHERS.push(
  {
    publisher: 'BAG',
    hosts: ['www.bag.admin.ch'],
    ingest: 'summary-only',
    licence: {
      name: 'Copyright, Swiss federal authorities (reproduction needs written consent)',
      url: null,
      termsUrl: 'https://www.admin.ch/gov/de/start/rechtliches.html',
      notes: SWISS_SUMMARY_ONLY,
    },
    evidenceLevel: 'guideline',
    publicationType: 'Swiss federal health guidance (BAG)',
    attribution: 'Source: Swiss Federal Office of Public Health (BAG).',
  },
  {
    publisher: 'BLV',
    hosts: ['www.blv.admin.ch', 'kwk.blv.admin.ch'],
    ingest: 'summary-only',
    licence: {
      name: 'Copyright, Swiss federal authorities (reproduction needs written consent)',
      url: null,
      termsUrl: 'https://www.admin.ch/gov/de/start/rechtliches.html',
      notes: SWISS_SUMMARY_ONLY,
    },
    evidenceLevel: 'guideline',
    publicationType: 'Swiss federal nutrition guidance (BLV)',
    attribution: 'Source: Swiss Federal Food Safety and Veterinary Office (BLV).',
  },
  {
    publisher: 'SGGG',
    hosts: ['www.sggg.ch', 'www.rosenfluh.ch'],
    ingest: 'summary-only',
    licence: {
      name: '© SGGG / Rosenfluh Publikationen (journal GYNÄKOLOGIE)',
      url: null,
      termsUrl: 'https://www.sggg.ch/',
      notes: SWISS_SUMMARY_ONLY,
    },
    evidenceLevel: 'guideline',
    publicationType: 'Swiss society guideline (SGGG expert letter)',
    attribution: 'Source: Swiss Society of Gynaecology and Obstetrics (SGGG).',
  },
);

export const HAND_WRITTEN_SUMMARISER = 'hand-written';

export function publisherFor(url: string): PublisherPolicy | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return PUBLISHERS.find((p) => p.hosts.includes(host)) ?? null;
}

export interface RobotsRules {
  groups: { agents: string[]; rules: { allow: boolean; path: string }[]; crawlDelay: number | null }[];
}

/** RFC 9309 robots.txt parser (groups of user-agent lines, allow/disallow, crawl-delay). */
export function parseRobots(txt: string): RobotsRules {
  const groups: RobotsRules['groups'] = [];
  let current: RobotsRules['groups'][number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    } else if (key === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n)) current.crawlDelay = n;
    }
  }
  return { groups };
}

function robotsPatternMatch(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
}

/**
 * Whether `agent` may fetch `url`: the group naming the agent (else "*"),
 * longest matching rule wins, allow wins a tie. Matching is case-sensitive,
 * as RFC 9309 says.
 */
export function robotsAllows(rules: RobotsRules, url: string, agent = ROBOTS_AGENT): { allowed: boolean; crawlDelay: number | null; rule: string | null } {
  const u = new URL(url);
  const path = `${u.pathname}${u.search}`;
  const named = rules.groups.filter((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)));
  const groups = named.length ? named : rules.groups.filter((g) => g.agents.includes('*'));
  let best: { allow: boolean; path: string } | null = null;
  for (const r of groups.flatMap((g) => g.rules)) {
    if (!robotsPatternMatch(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  const crawlDelay = groups.map((g) => g.crawlDelay).find((d) => d !== null) ?? null;
  return { allowed: best ? best.allow : true, crawlDelay, rule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` : null };
}

// ── Library items ────────────────────────────────────────────────────

/** The library.json item shape (ResearchItem in library.ts), restated so this file has no relative imports. */
export interface ResearchItemLike {
  id: string;
  pmid: string;
  doi: string | null;
  title: string;
  source: string;
  journal: string;
  organisation: string | null;
  year: number;
  publicationTypes: string[];
  evidenceLevel: 'guideline' | 'systematic review' | 'study';
  landmark?: boolean;
  url: string;
  summary: string;
  keyPoints: string[];
  certainty: 'high' | 'moderate' | 'low' | 'very low' | 'not stated';
  lifeStages: string[];
  topics: string[];
  tags: string[];
  keywords: string[];
}

export interface GuidelinePageMeta {
  publisher: string;
  url: string;
  /** Set when the requested URL redirected to `url`. */
  requestedUrl?: string;
  fetchedAt: string;
  published: string | null;
  lastUpdated: string | null;
  lastReviewed: string | null;
  nextReview: string | null;
  licence: { name: string; url: string | null; termsUrl: string; notes: string; pageCopyright: string | null };
  attribution: string | null;
  refreshDays: number | null;
  robots: { allowed: true; rule: string | null; checkedAt: string };
  /** FNV-1a of the extracted main text: a later re-fetch shows whether the page changed. */
  contentHash: string;
  summariser: string;
  chunks: number;
}

export interface GuidelinePageItem extends ResearchItemLike {
  sourceType: typeof GUIDELINE_SOURCE_TYPE;
  page: GuidelinePageMeta;
}

/** Curation hints for one URL (the extractive summariser cannot infer stages or topics). */
export interface PageCuration {
  url: string;
  lifeStages: string[];
  topics: string[];
  tags: string[];
  keywords: string[];
}

export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Stable id: "gp-<publisher>-<last path segment>-<hash of the URL>". */
export function guidelineItemId(url: string, publisher: string): string {
  const u = new URL(url);
  const seg = u.pathname.split('/').filter(Boolean).pop() ?? u.hostname;
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `gp-${slug(publisher).split('-')[0]}-${slug(seg).slice(0, 40).replace(/-$/, '')}-${fnv1a(u.href).slice(0, 6)}`;
}

const uniqLower = (arr: string[]) => [...new Set(arr.map((x) => clean(x).toLowerCase()).filter(Boolean))];

export function buildGuidelineItem(args: {
  page: ExtractedPage;
  policy: PublisherPolicy;
  curation: PageCuration;
  summary: SummaryResult;
  summariser: string;
  fetchedAt: string;
  robotsRule: string | null;
  chunkCount: number;
}): GuidelinePageItem {
  const { page, policy, curation, summary } = args;
  const url = new URL(curation.url).href;
  const dated = page.meta.lastUpdated ?? page.meta.lastReviewed ?? page.meta.published ?? args.fetchedAt;
  // Page titles often carry the site name: "Ibuprofen - NHS" -> "Ibuprofen".
  const title = page.meta.title.replace(/\s+[-|–]\s+(NHS|CDC|NCBI Bookshelf|NICE)$/i, '');
  return {
    id: guidelineItemId(url, policy.publisher),
    pmid: '',
    doi: null,
    title,
    source: policy.publisher,
    journal: policy.publisher,
    organisation: policy.publisher,
    year: Number(dated.slice(0, 4)),
    publicationTypes: [policy.publicationType],
    evidenceLevel: policy.evidenceLevel,
    url,
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    certainty: summary.certainty ?? 'not stated',
    lifeStages: [...curation.lifeStages],
    topics: [...curation.topics],
    tags: uniqLower([...curation.tags, ...(summary.tags ?? [])]),
    keywords: uniqLower([...curation.keywords, ...(summary.keywords ?? [])]),
    sourceType: GUIDELINE_SOURCE_TYPE,
    page: {
      publisher: policy.publisher,
      url,
      fetchedAt: args.fetchedAt,
      published: page.meta.published,
      lastUpdated: page.meta.lastUpdated,
      lastReviewed: page.meta.lastReviewed,
      nextReview: page.meta.nextReview,
      licence: { ...policy.licence, pageCopyright: page.meta.copyright },
      attribution: policy.attribution ?? null,
      refreshDays: policy.refreshDays ?? null,
      robots: { allowed: true, rule: args.robotsRule, checkedAt: args.fetchedAt },
      contentHash: fnv1a(page.text),
      summariser: args.summariser,
      chunks: args.chunkCount,
    },
  };
}

// ── Schema validation ────────────────────────────────────────────────

const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const ISO_DAY = /^\d{4}-\d{2}(-\d{2})?$/;

/**
 * Checks an item against the library.json schema; for sourceType
 * "guideline-page" also the page block (licence, robots, dates, URL host
 * matching a known publisher). Returns the problems found (empty = valid).
 * `topicIds`, when given, must contain every item topic.
 */
export function validateLibraryItem(item: unknown, topicIds?: Set<string>): string[] {
  const errs: string[] = [];
  if (!item || typeof item !== 'object') return ['not an object'];
  const it = item as Record<string, unknown>;
  for (const f of ['id', 'title', 'source', 'journal', 'url', 'summary']) if (!isStr(it[f]) || !clean(it[f] as string)) errs.push(`${f}: missing`);
  if (!isStr(it.pmid)) errs.push('pmid: not a string');
  if (!(it.doi === null || isStr(it.doi))) errs.push('doi: not string|null');
  if (!(it.organisation === null || isStr(it.organisation))) errs.push('organisation: not string|null');
  const year = it.year as number;
  if (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1) errs.push('year: out of range');
  if (!isStrArr(it.publicationTypes)) errs.push('publicationTypes: not string[]');
  if (!['guideline', 'systematic review', 'study'].includes(it.evidenceLevel as string)) errs.push('evidenceLevel: invalid');
  if (!['high', 'moderate', 'low', 'very low', 'not stated'].includes(it.certainty as string)) errs.push('certainty: invalid');
  if (!isStrArr(it.keyPoints) || it.keyPoints.length < 2 || it.keyPoints.some((k) => !clean(k))) errs.push('keyPoints: need 2+ non-empty');
  if (!isStrArr(it.lifeStages) || it.lifeStages.length === 0 || it.lifeStages.some((s) => !(ITEM_LIFE_STAGES as readonly string[]).includes(s)))
    errs.push('lifeStages: invalid');
  if (!isStrArr(it.topics) || it.topics.length === 0) errs.push('topics: need 1+');
  else if (topicIds) for (const t of it.topics) if (!topicIds.has(t)) errs.push(`topics: unknown "${t}"`);
  if (!isStrArr(it.tags) || it.tags.length === 0) errs.push('tags: need 1+');
  if (!isStrArr(it.keywords) || it.keywords.length === 0) errs.push('keywords: need 1+');

  if (it.sourceType === undefined) {
    if (!/^\d+$/.test((it.pmid as string) ?? '')) errs.push('pmid: PubMed item needs digits');
    if (!/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/.test((it.url as string) ?? '')) errs.push('url: PubMed item needs a PubMed URL');
    return errs;
  }
  if (it.sourceType !== GUIDELINE_SOURCE_TYPE) return [...errs, `sourceType: unknown "${String(it.sourceType)}"`];

  if (it.pmid !== '') errs.push('pmid: must be "" for a guideline page');
  if (!/^gp-[a-z0-9-]+$/.test((it.id as string) ?? '')) errs.push('id: must start with gp-');
  const policy = isStr(it.url) ? publisherFor(it.url) : null;
  if (!isStr(it.url) || !it.url.startsWith('https://')) errs.push('url: must be https');
  else if (!policy) errs.push('url: host is not a known publisher');
  else if (policy.ingest === 'licence-required') errs.push(`url: ${policy.publisher} content needs a licence first`);
  const page = it.page as Record<string, unknown> | undefined;
  if (!page || typeof page !== 'object') return [...errs, 'page: missing'];
  if (page.url !== it.url) errs.push('page.url: differs from url');
  if (!isStr(page.publisher) || (policy && page.publisher !== policy.publisher)) errs.push('page.publisher: does not match the URL host');
  if (!isStr(page.fetchedAt) || Number.isNaN(Date.parse(page.fetchedAt))) errs.push('page.fetchedAt: not a date');
  for (const d of ['published', 'lastUpdated', 'lastReviewed', 'nextReview'])
    if (!(page[d] === null || (isStr(page[d]) && ISO_DAY.test(page[d] as string)))) errs.push(`page.${d}: not YYYY-MM(-DD) or null`);
  const lic = page.licence as Record<string, unknown> | undefined;
  if (!lic || !isStr(lic.name) || !clean(lic.name) || !isStr(lic.termsUrl) || !isStr(lic.notes)) errs.push('page.licence: name, termsUrl and notes required');
  const robots = page.robots as Record<string, unknown> | undefined;
  if (!robots || robots.allowed !== true) errs.push('page.robots: must record an allowed robots check');
  if (!isStr(page.contentHash) || !/^[0-9a-f]{8}$/.test(page.contentHash)) errs.push('page.contentHash: invalid');
  if (!isStr(page.summariser) || !page.summariser) errs.push('page.summariser: missing');
  const handWritten = page.summariser === HAND_WRITTEN_SUMMARISER;
  if (policy?.ingest === 'summary-only' && !handWritten) errs.push(`page.summariser: ${policy.publisher} items must be hand-written summaries`);
  if (!Number.isInteger(page.chunks) || (page.chunks as number) < (handWritten ? 0 : 1)) errs.push('page.chunks: need 1+');
  return errs;
}
