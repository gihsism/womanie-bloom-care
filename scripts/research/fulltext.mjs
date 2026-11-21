#!/usr/bin/env node
// Adds FULL TEXT of openly licensed articles to the Womanie research library.
//
//   node scripts/research/fulltext.mjs            (from the repo root, or
//   cd scripts/research && node fulltext.mjs)     no npm install needed)
//
// Output (both next to library.json, read by api/_lib/research/fulltext.ts):
//   api/_lib/research/fulltext-chunks.json  [{ id, pmid, pmcid, section, text, licence }]
//   api/_lib/research/fulltext-index.json   { ..., items: { pmid: { pmcid, licence, chunks, ... } } }
//
// Legal basis: we only keep articles that are in the PMC Open Access subset
// AND carry a licence that allows reuse inside an app: CC0, CC BY, CC BY-SA.
// Everything else (CC BY-NC*, CC BY-ND, publisher licences, author
// manuscripts released for text mining only = "TDM") is skipped and only
// counted in the report. Every kept article keeps its licence string, the
// authors/title credit and a link to the PMC article for attribution.
//
// Steps
//   1. MAP      PMID -> PMCID with the NCBI PMC ID Converter API (200 ids per
//               request, <= 3 req/s, or 10 req/s with NCBI_API_KEY).
//   2. CHECK    For each PMCID, the PMC Article Datasets on AWS
//               (s3://pmc-oa-opendata, anonymous HTTPS). This is NLM's
//               official replacement for the retired OA Web Service
//               (oa.fcgi was switched off in August 2026). The per-version
//               metadata JSON gives is_pmc_openaccess, is_retracted and
//               license_code; the article itself is the same JATS XML that
//               E-utilities efetch db=pmc returns.
//   3. FETCH    Download the JATS XML of the latest article version.
//   4. PARSE    JATS -> clean sections (Abstract, Plain language summary,
//               Introduction, Methods, Results, Discussion, Conclusions, ...);
//               references, figures, footnotes, back matter and raw table
//               markup are dropped; figure/table captions and the text of
//               small tables are kept.
//   5. CHUNK    ~800-1200 character passages on sentence boundaries, never
//               crossing a section.
//   6. WRITE    chunks + per-PMID index. If the chunks file would exceed
//               --max-mb (default 15), only the most useful sections are
//               kept (Abstract, Plain language summary, Results, Discussion,
//               Conclusions, Recommendations), then a per-article cap.
//
// Incremental: every network answer is cached in scripts/research/.cache/
// fulltext/ (git-ignored via scripts/research/.gitignore). A rerun only asks
// NCBI/AWS about PMIDs it has not seen yet; PMIDs that had no reusable full
// text are re-checked after --recheck-days (default 30), because articles
// enter PMC and the OA subset later. Parsing + chunking always reruns from the
// cached XML (fast), so parser changes apply to everything.
//
// Flags
//   --refresh            ignore the cached state (XML downloads are reused)
//   --offline            no network: build from the cache only
//   --limit N            only look at the first N library items (test run)
//   --recheck-days N     re-check "no full text" PMIDs older than N days (30)
//   --max-mb N           size budget for fulltext-chunks.json (15)
//
// Env (optional, never printed)
//   NCBI_API_KEY   raises the NCBI limit to 10 req/s
//   NCBI_EMAIL     contact e-mail sent with ID-converter requests, as NCBI asks

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const LIBRARY = path.join(repoRoot, 'api', '_lib', 'research', 'library.json');
const OUT_CHUNKS = path.join(repoRoot, 'api', '_lib', 'research', 'fulltext-chunks.json');
const OUT_INDEX = path.join(repoRoot, 'api', '_lib', 'research', 'fulltext-index.json');
const CACHE = path.join(here, '.cache', 'fulltext');
const STATE_FILE = path.join(CACHE, 'state.json');
const XML_DIR = path.join(CACHE, 'xml');
const META_DIR = path.join(CACHE, 'meta');

const S3 = 'https://pmc-oa-opendata.s3.amazonaws.com';
const IDCONV = 'https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/';

/** Licences that allow reuse (incl. excerpting/adapting) in an app. */
export const ALLOWED_LICENCES = ['CC0', 'CC BY', 'CC BY-SA'];
export const LICENCE_URLS = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
};
/** Sections kept when the size budget is exceeded, most useful first. */
export const PRIORITY_SECTIONS = [
  'Conclusions',
  'Recommendations',
  'Results',
  'Abstract',
  'Plain language summary',
  'Discussion',
];

const MIN_CHUNK = 800;
const MAX_CHUNK = 1200;

// ---------------------------------------------------------------- CLI ----

function parseArgs(argv) {
  const a = { refresh: false, offline: false, limit: Infinity, recheckDays: 30, maxMb: 15 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--refresh') a.refresh = true;
    else if (k === '--offline') a.offline = true;
    else if (k === '--limit') a.limit = Number(argv[++i]);
    else if (k === '--recheck-days') a.recheckDays = Number(argv[++i]);
    else if (k === '--max-mb') a.maxMb = Number(argv[++i]);
    else throw new Error(`unknown flag ${k}`);
  }
  return a;
}

// ------------------------------------------------------------ network ----

const NCBI_KEY = process.env.NCBI_API_KEY || '';
const NCBI_EMAIL = process.env.NCBI_EMAIL || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function throttle(gapMs) {
  let next = 0;
  return async () => {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + gapMs;
    if (wait) await sleep(wait);
  };
}
const ncbiGate = throttle(NCBI_KEY ? 110 : 350); // <= 3 req/s without a key
const s3Gate = throttle(60); // AWS Open Data bucket: polite, not NCBI-limited

const stats = { requests: 0 };

async function get(url, gate, { allow404 = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    await gate();
    stats.requests++;
    let res;
    try {
      res = await fetch(url, {
        headers: { 'user-agent': 'womanie-research-fulltext/1.0 (+https://womanie.info)' },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      if (attempt >= 4) throw err;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res.text();
    if (allow404 && (res.status === 404 || res.status === 403)) return null;
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    // Never echo the URL when it may carry the API key.
    throw new Error(`HTTP ${res.status} for ${redact(url)}`);
  }
}

function redact(url) {
  return url.replace(/api_key=[^&]+/, 'api_key=***').replace(/email=[^&]+/, 'email=***');
}

/** PMID -> PMCID (or null) via the PMC ID Converter, 200 ids per request. */
async function mapPmids(pmids) {
  const out = {};
  for (let i = 0; i < pmids.length; i += 200) {
    const batch = pmids.slice(i, i + 200);
    const qs = new URLSearchParams({ ids: batch.join(','), idtype: 'pmid', format: 'json', tool: 'womanie' });
    if (NCBI_EMAIL) qs.set('email', NCBI_EMAIL);
    if (NCBI_KEY) qs.set('api_key', NCBI_KEY);
    const body = JSON.parse(await get(`${IDCONV}?${qs}`, ncbiGate));
    for (const p of batch) out[p] = null;
    for (const r of body.records || []) {
      const pmid = String(r.pmid ?? r['requested-id'] ?? '');
      if (pmid && r.pmcid && !r.errmsg) out[pmid] = r.pmcid;
    }
  }
  return out;
}

/** Latest article version in the PMC Article Datasets, or null if absent. */
async function latestVersion(pmcid) {
  const xml = await get(`${S3}/?list-type=2&prefix=${pmcid}.&delimiter=/`, s3Gate);
  const versions = [...xml.matchAll(/<Prefix>(PMC\d+)\.(\d+)\/<\/Prefix>/g)]
    .filter((m) => m[1] === pmcid)
    .map((m) => Number(m[2]));
  return versions.length ? Math.max(...versions) : null;
}

async function fetchMeta(pmcid, version) {
  const file = path.join(META_DIR, `${pmcid}.${version}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const body = await get(`${S3}/metadata/${pmcid}.${version}.json`, s3Gate, { allow404: true });
  if (!body) return null;
  fs.writeFileSync(file, body);
  return JSON.parse(body);
}

async function fetchXml(pmcid, version) {
  const file = path.join(XML_DIR, `${pmcid}.${version}.xml`);
  if (fs.existsSync(file)) return file;
  const body = await get(`${S3}/${pmcid}.${version}/${pmcid}.${version}.xml`, s3Gate, { allow404: true });
  if (!body) return null;
  fs.writeFileSync(file, body);
  return file;
}

// ------------------------------------------------------------ licence ----

/** "cc by", "CC-BY", "cc_by_4.0" -> "CC BY"; unknown codes pass through upper-cased. */
export function normaliseLicence(code) {
  if (!code) return 'UNKNOWN';
  let s = String(code).trim().toUpperCase().replace(/_/g, ' ');
  s = s.replace(/\s+\d+(\.\d+)?$/, ''); // drop version suffix
  if (/^CC\s*0$|^CC\s*ZERO$|^PUBLIC\s*DOMAIN$/.test(s)) return 'CC0';
  const m = s.match(/^CC[\s-]*(BY(?:[\s-]*(?:NC|ND|SA))*)$/);
  if (m) return 'CC ' + m[1].replace(/[\s-]+/g, '-');
  return s;
}

export function isReusable(licence) {
  return ALLOWED_LICENCES.includes(licence);
}

// --------------------------------------------------------- XML parser ----
// Minimal, dependency-free XML -> tree parser. Good enough for PMC JATS
// (well-formed, numeric entities); not a general-purpose parser.

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(cp);
      } catch {
        return '';
      }
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export function parseXml(src) {
  src = src
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/i, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|</g;
  let m;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      top.children.push(decode(m[5]));
    } else if (m[2] === undefined) {
      top.children.push('<');
    } else if (m[1]) {
      // closing tag: pop to the matching element (tolerates stray tags)
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === m[2]) {
          stack.length = i;
          break;
        }
      }
    } else {
      const attrs = {};
      for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
      }
      const node = { name: m[2], attrs, children: [] };
      top.children.push(node);
      if (!m[4]) stack.push(node);
    }
  }
  return root;
}

const kids = (n, name) => (n?.children || []).filter((c) => typeof c !== 'string' && (!name || c.name === name));
const kid = (n, name) => kids(n, name)[0];
function find(n, name) {
  if (!n || typeof n === 'string') return null;
  if (n.name === name) return n;
  for (const c of n.children) {
    const f = find(c, name);
    if (f) return f;
  }
  return null;
}

// -------------------------------------------------------- JATS -> text ----

// Elements whose content never belongs in running text.
const SKIP_INLINE = new Set([
  'fig', 'table-wrap', 'fn', 'label', 'graphic', 'inline-graphic', 'media',
  'supplementary-material', 'tex-math', 'alt-text', 'object-id', 'ref-list',
  'table-wrap-foot', 'attrib', 'permissions',
]);
// Elements that are blocks of their own when nested inside a <p>.
const BLOCKS_IN_P = new Set(['fig', 'table-wrap', 'list', 'disp-quote', 'boxed-text', 'table-wrap-group', 'fig-group']);

function inlineText(n) {
  if (typeof n === 'string') return n;
  if (SKIP_INLINE.has(n.name) || BLOCKS_IN_P.has(n.name)) return '';
  if (n.name === 'xref' && (n.attrs['ref-type'] === 'bibr' || n.attrs['ref-type'] === 'fn')) return '';
  if (n.name === 'break') return ' ';
  const inner = n.children.map(inlineText).join('');
  // superscripts that held only citation markers leave ",", "–" behind
  if (n.name === 'sup') return inner.replace(/[\s,;–—-]/g, '') ? '^' + inner : '';
  return inner;
}

export function cleanText(s) {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[\[(]\s*(?:[,;–—\-]\s*)*[\])]/g, '') // brackets left behind by removed citations
    .replace(/\^(?=[\s,;.)\]]|$)/g, '')
    .replace(/([.;:!?])(?:\s*[,–—])+(?=\s|$)/g, '$1') // "age.,–" left by removed citations
    .replace(/(?:\s*[,;])+(?=\s*[.;:])/g, '') // "common,." likewise
    .replace(/\s+([,.;:)\]])/g, '$1')
    .replace(/([(\[])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function tableText(tw) {
  const rows = [];
  const table = find(tw, 'table');
  if (!table) return '';
  const walk = (n) => {
    for (const c of kids(n)) {
      if (c.name === 'tr') {
        const cells = kids(c).filter((x) => x.name === 'td' || x.name === 'th').map((x) => cleanText(inlineText(x)));
        if (cells.some(Boolean)) rows.push(cells.join(' | '));
      } else walk(c);
    }
  };
  walk(table);
  const text = rows.join('\n');
  // Keep only "simple" tables; big ones (e.g. Cochrane summary-of-findings
  // grids) are noisy as text and blow the size budget.
  return rows.length <= 25 && text.length <= 1800 ? text : '';
}

function captionText(n) {
  const label = cleanText(inlineText({ name: 'x', children: kid(n, 'label')?.children || [] }));
  const cap = kid(n, 'caption');
  const parts = cap ? kids(cap).map((c) => cleanText(inlineText(c))).filter(Boolean) : [];
  const capText = parts.join(' ');
  if (!capText && !label) return '';
  return [label, capText].filter(Boolean).join('. ').replace(/\.\./g, '.');
}

const DROP_TITLE =
  /^(references?|bibliography|acknowledg|funding|financial (support|disclosure)|grant|conflicts? of interest|competing interests?|declarations?( of interest)?|disclosures?|author(s'|s)? contributions?|contributions of authors|credit author|data (availability|sharing)|availability of data|supplementa|supporting information|abbreviations|ethics|ethical (approval|statement)|consent for publication|informed consent statement|institutional review|appendi|characteristics of|data and analyses|what's new|history$|sources of support|differences between protocol|index terms|notes?$|footnotes|additional (information|files)|publisher'?s note|orcid|electronic supplementary|figures? and tables?|glossary|disclaimer)/i;
const DROP_SEC_TYPE = /supplementary|coi|conflict|data-availability|ethics|author-contrib|funding|acknowledg|display-objects/i;

/** Map a section title to a canonical name, or null if it is not one. */
export function canonicalSection(title) {
  const t = title.toLowerCase().replace(/^[\d.\s]+/, '').trim();
  if (/^(background|introduction|rationale|context)\b/.test(t)) return 'Introduction';
  if (/^(objectives?|aims?|purpose)\b/.test(t)) return 'Objectives';
  if (/^(methods?|methodology|materials|patients and methods|subjects and methods|study design|search methods|selection criteria|data collection|statistical)/.test(t)) return 'Methods';
  if (/^(results?|findings|main results|description of studies|effects of interventions)\b/.test(t)) return 'Results';
  if (/^(discussion|limitations|strengths and limitations|comment)\b/.test(t)) return 'Discussion';
  if (/^(conclusions?|authors'? conclusions|implications|summary and conclusions?|concluding remarks|take-home|key messages)\b/.test(t)) return 'Conclusions';
  if (/^(recommendations?|guideline recommendations|summary of recommendations)\b/.test(t)) return 'Recommendations';
  if (/^plain language summary/.test(t)) return 'Plain language summary';
  return null;
}

/** Free-text heading -> short label: sentence case if SHOUTED, <= 100 chars on a word boundary. */
export function headingLabel(t) {
  let s = t.replace(/\s+/g, ' ').trim();
  if (s.length > 3 && s === s.toUpperCase()) s = s.charAt(0) + s.slice(1).toLowerCase();
  if (s.length > 100) s = s.slice(0, s.lastIndexOf(' ', 100) > 50 ? s.lastIndexOf(' ', 100) : 100) + '…';
  return s;
}

function titleOf(sec) {
  return cleanText(inlineText({ name: 'x', children: kid(sec, 'title')?.children || [] }));
}

/**
 * Walks block content, emitting { section, paragraph } items.
 * prefix: abstract sub-headings are written in front of their paragraph.
 */
function walkBlocks(node, section, out, { prefixTitles = false } = {}) {
  for (const c of kids(node)) {
    switch (c.name) {
      case 'title':
      case 'label':
      case 'ref-list':
      case 'fn-group':
      case 'ack':
      case 'supplementary-material':
      case 'sec-meta':
        break;
      case 'sec': {
        const t = titleOf(c);
        if ((t && DROP_TITLE.test(t)) || DROP_SEC_TYPE.test(c.attrs['sec-type'] || '')) break;
        if (prefixTitles && t) {
          const before = out.length;
          walkBlocks(c, section, out, { prefixTitles });
          if (out.length > before && !/[:.]$/.test(t)) out[before].text = `${t}: ${out[before].text}`;
        } else walkBlocks(c, section, out, { prefixTitles });
        break;
      }
      case 'p': {
        const text = cleanText(inlineText(c));
        if (text) out.push({ section, text, para: true });
        // blocks nested inside the paragraph
        walkBlocks({ children: kids(c).filter((x) => BLOCKS_IN_P.has(x.name)) }, section, out, { prefixTitles });
        break;
      }
      case 'list':
        for (const li of kids(c, 'list-item')) {
          const text = cleanText(kids(li).map(inlineText).join(' '));
          if (text) out.push({ section, text: `• ${text}`, para: true });
          for (const sub of kids(li, 'list')) walkBlocks({ children: [sub] }, section, out, { prefixTitles });
        }
        break;
      case 'fig': {
        const cap = captionText(c);
        if (cap) out.push({ section, text: cap, para: true });
        break;
      }
      case 'table-wrap': {
        const cap = captionText(c);
        const body = tableText(c);
        const text = [cap, body].filter(Boolean).join('\n');
        if (text) out.push({ section, text, para: true });
        break;
      }
      case 'fig-group':
      case 'table-wrap-group':
      case 'boxed-text':
      case 'disp-quote':
      case 'statement':
      case 'def-list':
        walkBlocks(c, section, out, { prefixTitles });
        break;
      case 'def-item': {
        const text = cleanText(kids(c).map(inlineText).join(': '));
        if (text) out.push({ section, text, para: true });
        break;
      }
      case 'disp-formula': {
        const text = cleanText(inlineText(c));
        if (text) out.push({ section, text, para: true });
        break;
      }
      default:
        break;
    }
  }
}

/**
 * JATS XML string -> { title, credit, licenceUrl, paragraphs: [{section, text}] }.
 * Back matter, references, figures' images and raw table markup are dropped.
 */
export function parseJats(xml) {
  const root = parseXml(xml);
  const article = find(root, 'article');
  const meta = find(article, 'article-meta');
  const title = cleanText(inlineText(find(meta, 'article-title') || { name: 'x', children: [] }));

  // Credit line for CC BY attribution: "Surname AB, Surname CD, et al."
  const authors = [];
  for (const g of kids(meta, 'contrib-group')) {
    for (const c of kids(g, 'contrib')) {
      if (c.attrs['contrib-type'] && c.attrs['contrib-type'] !== 'author') continue;
      const n = kid(c, 'name');
      const collab = kid(c, 'collab');
      if (n) {
        const sur = cleanText(inlineText(kid(n, 'surname') || { name: 'x', children: [] }));
        const given = cleanText(inlineText(kid(n, 'given-names') || { name: 'x', children: [] }));
        const initials = given.split(/[\s-]+/).filter(Boolean).map((w) => w[0]).join('');
        if (sur) authors.push(`${sur} ${initials}`.trim());
      } else if (collab) authors.push(cleanText(inlineText(collab)));
    }
  }
  const credit = authors.length > 3 ? `${authors.slice(0, 3).join(', ')}, et al.` : authors.join(', ');

  const lic = find(meta, 'license');
  const licenceUrl =
    lic?.attrs['xlink:href'] ||
    find(lic, 'ali:license_ref')?.children.filter((x) => typeof x === 'string').join('').trim() ||
    null;

  const paras = [];
  for (const abs of kids(meta, 'abstract')) {
    const type = (abs.attrs['abstract-type'] || '').toLowerCase();
    let section = 'Abstract';
    if (/plain|lay|summary|author-summary/.test(type)) section = 'Plain language summary';
    else if (type && !/structured|abstract|normal|precis|executive/.test(type)) continue; // graphical, teaser, toc...
    const t = titleOf(abs);
    if (t && /plain language/i.test(t)) section = 'Plain language summary';
    walkBlocks(abs, section, paras, { prefixTitles: true });
  }
  for (const tr of kids(meta, 'trans-abstract')) void tr; // translated abstracts: skipped

  const body = kid(article, 'body');
  if (body) {
    for (const c of kids(body)) {
      if (c.name === 'sec') {
        const t = titleOf(c);
        if ((t && DROP_TITLE.test(t)) || DROP_SEC_TYPE.test(c.attrs['sec-type'] || '')) continue;
        const section =
          canonicalSection(t) ||
          canonicalSection(c.attrs['sec-type'] || '') ||
          (t ? headingLabel(t) : 'Main text');
        walkBlocks(c, section, paras);
      } else {
        walkBlocks({ children: [c] }, 'Main text', paras);
      }
    }
  }
  return { title, credit, licenceUrl, hasBody: Boolean(body), paragraphs: paras };
}

// ----------------------------------------------------------- chunking ----

const ABBREV =
  /\b(e\.g|i\.e|et al|vs|Fig|Figs|No|Nos|approx|ca|cf|Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|St|Jr|Sr|resp|incl|etc|Ref|Refs|Eq|Tab|Suppl|Vol|pp|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|U\.S|U\.K)\./g;

export function splitSentences(text) {
  const guarded = text.replace(ABBREV, (m) => m.replace(/\./g, '\u0000'));
  return guarded
    .split(/(?<=[.!?])\s+(?=["“(\[]?[A-Z0-9•])|\n+/)
    .map((s) => s.replace(/\u0000/g, '.').trim())
    .filter(Boolean);
}

function hardSplit(s, max) {
  const out = [];
  let rest = s;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Packs paragraphs (all of one section) into ~800-1200 char passages on
 * sentence boundaries. Prefers to end a passage at a paragraph end once it
 * has reached 800 characters.
 */
export function chunkParagraphs(paragraphs, { min = MIN_CHUNK, max = MAX_CHUNK } = {}) {
  const chunks = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = '';
  };
  for (const p of paragraphs) {
    const sentences = splitSentences(p).flatMap((s) => (s.length > max ? hardSplit(s, max) : [s]));
    sentences.forEach((s, i) => {
      const sep = cur ? (i === 0 ? '\n' : ' ') : '';
      if (cur.length + sep.length + s.length > max && cur.length >= min * 0.5) {
        flush();
        cur = s;
      } else cur += sep + s;
    });
    if (cur.length >= min) flush();
  }
  flush();
  // Fold a short tail into the previous passage when it still fits.
  if (chunks.length > 1 && chunks[chunks.length - 1].length < 300) {
    const tail = chunks.pop();
    const prev = chunks.pop();
    if (prev.length + tail.length + 1 <= max * 1.25) chunks.push(`${prev}\n${tail}`);
    else chunks.push(prev, tail);
  }
  return chunks;
}

/** Parsed article -> [{ section, text }] passages in reading order. */
export function chunkArticle(parsed) {
  const groups = [];
  for (const p of parsed.paragraphs) {
    const last = groups[groups.length - 1];
    if (last && last.section === p.section) last.paras.push(p.text);
    else groups.push({ section: p.section, paras: [p.text] });
  }
  const out = [];
  for (const g of groups) for (const text of chunkParagraphs(g.paras)) out.push({ section: g.section, text });
  return out;
}

// ---------------------------------------------------------- size cap ----

/** Canonical priority sections, plus free headings that are clearly recommendations/conclusions (guidelines). */
export function isPrioritySection(section) {
  return PRIORITY_SECTIONS.includes(section) || /recommend|conclusion|key (points|messages)|summary/i.test(section);
}

function sizeOf(chunks) {
  return Buffer.byteLength(JSON.stringify(chunks));
}

/** Applies the size budget; returns { chunks, pruned: description|null }. */
export function applyBudget(chunks, maxBytes) {
  if (sizeOf(chunks) <= maxBytes) return { chunks, pruned: null };
  let kept = chunks.filter((c) => isPrioritySection(c.section));
  if (sizeOf(kept) <= maxBytes) return { chunks: kept, pruned: `kept only ${PRIORITY_SECTIONS.join(', ')} (+ recommendation headings)` };
  // Still too big: cap passages per article, most useful sections first.
  const rank = (c) => (PRIORITY_SECTIONS.includes(c.section) ? PRIORITY_SECTIONS.indexOf(c.section) : 1.5);
  const byPmid = new Map();
  for (const c of kept) (byPmid.get(c.pmid) || byPmid.set(c.pmid, []).get(c.pmid)).push(c);
  for (let cap = 40; cap >= 2; cap = Math.floor(cap * 0.8)) {
    const out = [];
    for (const list of byPmid.values()) {
      const chosen = new Set(
        [...list]
          .map((c, i) => ({ c, i }))
          .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
          .slice(0, cap)
          .map((x) => x.c),
      );
      out.push(...list.filter((c) => chosen.has(c)));
    }
    if (sizeOf(out) <= maxBytes) return { chunks: out, pruned: `kept only ${PRIORITY_SECTIONS.join(', ')}, max ${cap} passages per article` };
    kept = out;
  }
  return { chunks: kept, pruned: 'priority sections, max 2 passages per article (still over budget)' };
}

// --------------------------------------------------------------- main ----

async function main() {
  const t0 = Date.now();
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(XML_DIR, { recursive: true });
  fs.mkdirSync(META_DIR, { recursive: true });

  const library = JSON.parse(fs.readFileSync(LIBRARY, 'utf8'));
  const items = (Array.isArray(library) ? library : library.items).slice(0, args.limit);
  const pmids = [...new Set(items.map((i) => String(i.pmid)).filter((p) => /^\d+$/.test(p)))];

  const state = !args.refresh && fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
  const saveState = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  const now = new Date();
  const stale = (s) =>
    !s ||
    s.status === 'error' ||
    (s.status !== 'ok' && s.status !== 'licence-excluded' &&
      (now - new Date(s.checkedAt)) / 86_400_000 > args.recheckDays);
  const todo = pmids.filter((p) => stale(state[p]));
  console.log(`library: ${items.length} items, ${pmids.length} PMIDs; to check: ${todo.length}${args.offline ? ' (offline: skipped)' : ''}`);

  if (!args.offline && todo.length) {
    // 1. PMID -> PMCID
    const map = await mapPmids(todo);
    const withPmc = todo.filter((p) => map[p]);
    console.log(`  ID converter: ${withPmc.length}/${todo.length} have a PMCID`);
    for (const p of todo) if (!map[p]) state[p] = { status: 'no-pmcid', checkedAt: now.toISOString() };
    saveState();

    // 2-3. dataset metadata + XML, a small pool of workers
    let done = 0;
    const queue = [...withPmc];
    const worker = async () => {
      while (queue.length) {
        const pmid = queue.shift();
        const pmcid = map[pmid];
        const rec = { pmcid, checkedAt: now.toISOString() };
        try {
          const version = await latestVersion(pmcid);
          if (!version) rec.status = 'not-in-dataset';
          else {
            const meta = await fetchMeta(pmcid, version);
            rec.version = version;
            if (!meta) rec.status = 'not-in-dataset';
            else {
              rec.licenceCode = meta.license_code ?? null;
              rec.licence = normaliseLicence(meta.license_code);
              rec.openAccess = Boolean(meta.is_pmc_openaccess);
              if (meta.is_retracted) rec.status = 'retracted';
              else if (!rec.openAccess || !isReusable(rec.licence)) rec.status = 'licence-excluded';
              else rec.status = (await fetchXml(pmcid, version)) ? 'ok' : 'xml-missing';
            }
          }
        } catch (err) {
          rec.status = 'error';
          rec.error = String(err.message || err).slice(0, 200);
        }
        state[pmid] = rec;
        if (++done % 25 === 0) {
          console.log(`  checked ${done}/${withPmc.length}`);
          saveState();
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    saveState();
  }

  // 4-5. parse + chunk every reusable article from the cache
  const titleByPmid = new Map(items.map((i) => [String(i.pmid), i.title]));
  let chunks = [];
  const index = {};
  const parseFailures = [];
  for (const pmid of pmids) {
    const s = state[pmid];
    if (!s || s.status !== 'ok' || !isReusable(s.licence)) continue;
    const file = path.join(XML_DIR, `${s.pmcid}.${s.version}.xml`);
    if (!fs.existsSync(file)) continue;
    let parsed;
    try {
      parsed = parseJats(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      parseFailures.push(`${pmid}: ${err.message}`);
      continue;
    }
    const passages = chunkArticle(parsed);
    if (!passages.length) {
      parseFailures.push(`${pmid}: no text`);
      continue;
    }
    passages.forEach((p, i) =>
      chunks.push({ id: `${pmid}#${i + 1}`, pmid, pmcid: s.pmcid, section: p.section, text: p.text, licence: s.licence }),
    );
    index[pmid] = {
      pmcid: s.pmcid,
      version: s.version,
      licence: s.licence,
      licenceUrl: parsed.licenceUrl && /creativecommons\.org/.test(parsed.licenceUrl) ? parsed.licenceUrl : LICENCE_URLS[s.licence],
      pmcUrl: `https://pmc.ncbi.nlm.nih.gov/articles/${s.pmcid}/`,
      title: parsed.title || titleByPmid.get(pmid) || '',
      credit: parsed.credit,
      label: `Full text · ${s.licence}`,
      hasBody: parsed.hasBody,
      chunks: 0,
      sections: [],
    };
  }

  // 6. size budget, then the index counts from what is actually kept
  const maxBytes = args.maxMb * 1024 * 1024;
  const before = sizeOf(chunks);
  const { chunks: kept, pruned } = applyBudget(chunks, maxBytes);
  chunks = kept;
  const perPmid = new Map();
  for (const c of chunks) {
    const e = perPmid.get(c.pmid) || { n: 0, sections: [] };
    // renumber so ids stay pmid#1..n after pruning
    c.id = `${c.pmid}#${++e.n}`;
    if (!e.sections.includes(c.section)) e.sections.push(c.section);
    perPmid.set(c.pmid, e);
  }
  for (const pmid of Object.keys(index)) {
    const e = perPmid.get(pmid);
    if (!e) delete index[pmid];
    else Object.assign(index[pmid], { chunks: e.n, sections: e.sections });
  }

  const chunksJson = JSON.stringify(chunks);
  const prevChunks = fs.existsSync(OUT_CHUNKS) ? fs.readFileSync(OUT_CHUNKS, 'utf8') : '';
  let generatedAt = now.toISOString();
  if (prevChunks === chunksJson && fs.existsSync(OUT_INDEX)) {
    try {
      generatedAt = JSON.parse(fs.readFileSync(OUT_INDEX, 'utf8')).generatedAt || generatedAt; // stable diffs
    } catch { /* rewrite */ }
  }
  const indexDoc = {
    version: 1,
    generatedAt,
    source:
      'PMC Article Datasets (NIH/NLM PubMed Central, Open Access subset), retrieved from https://registry.opendata.aws/ncbi-pmc. Articles are provided by their publishers/authors under the licence shown per item.',
    acknowledgement: 'Full text courtesy of the U.S. National Library of Medicine (PubMed Central). Not endorsed by NLM.',
    licencesAllowed: ALLOWED_LICENCES,
    pruned,
    items: index,
  };
  fs.writeFileSync(OUT_CHUNKS, chunksJson);
  fs.writeFileSync(OUT_INDEX, JSON.stringify(indexDoc, null, 1) + '\n');

  // ------------------------------------------------------------ report ----
  const counts = {};
  const licences = {};
  const excluded = {};
  for (const p of pmids) {
    const s = state[p] || { status: 'unchecked' };
    counts[s.status] = (counts[s.status] || 0) + 1;
    if (s.licence && s.status === 'licence-excluded') {
      const k = s.openAccess ? s.licence : `${s.licence} (not OA subset)`;
      excluded[k] = (excluded[k] || 0) + 1;
    }
  }
  for (const e of Object.values(index)) licences[e.licence] = (licences[e.licence] || 0) + 1;
  const mb = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
  const sections = {};
  for (const c of chunks) sections[c.section] = (sections[c.section] || 0) + 1;
  const topSections = Object.entries(sections).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('\n=== full-text report ===');
  console.log(`PMIDs in library:           ${pmids.length}`);
  console.log(`status:                     ${JSON.stringify(counts)}`);
  console.log(`with reusable full text:    ${Object.keys(index).length} (${((100 * Object.keys(index).length) / pmids.length).toFixed(1)}%)`);
  console.log(`licences kept:              ${JSON.stringify(licences)}`);
  console.log(`licences excluded:          ${JSON.stringify(excluded)}`);
  console.log(`chunks:                     ${chunks.length} (avg ${Math.round(chunksJson.length / Math.max(1, chunks.length))} bytes)`);
  console.log(`top sections:               ${topSections.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`fulltext-chunks.json:       ${mb(Buffer.byteLength(chunksJson))}${pruned ? ` (before budget ${mb(before)}; ${pruned})` : ''}`);
  console.log(`fulltext-index.json:        ${mb(fs.statSync(OUT_INDEX).size)}`);
  if (parseFailures.length) console.log(`parse problems:             ${parseFailures.join('; ')}`);
  const errors = pmids.filter((p) => state[p]?.status === 'error');
  if (errors.length) console.log(`errors (retried next run):  ${errors.length}, e.g. ${state[errors[0]].error}`);
  console.log(`network requests:           ${stats.requests}`);
  console.log(`runtime:                    ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
