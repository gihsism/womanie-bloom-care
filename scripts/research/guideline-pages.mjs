#!/usr/bin/env node
// Guideline-page ingestion (DRY RUN ONLY): fetches authoritative public web
// pages, extracts and chunks the main text, summarises it and writes
// library-schema candidate items to a STAGING file. It never touches
// library.json: the founder decides which candidates go in.
//
//   node scripts/research/guideline-pages.mjs                 # all pages in guideline-pages.config.mjs
//   node scripts/research/guideline-pages.mjs --only <url>    # one page
//   options:
//     --summariser extractive|claude   default extractive (free, no model call)
//     --allow-paid                     required with --summariser claude (Anthropic API, costs money)
//     --no-embed                       skip the local embedding
//     --refetch                        ignore the local HTML cache
//     --max <n>                        pages fetched per run (default 5, hard cap 10)
//     --out <path>                     default api/_lib/research/staging/guideline-pages.json
//
// Politeness: only hosts listed in PUBLISHERS (guideline-page.ts) whose
// licence allows ingestion; robots.txt is checked for every URL (and the
// final URL after redirects); at least 3 s between requests to one host
// (more if Crawl-delay says so); fetched HTML is cached in
// scripts/research/.cache/guideline-pages/ so a re-run does not re-fetch.
//
// Embedding: same model and recipe as embed-library.mjs (embed.ts), stored
// per item in the staging file. Fully offline except the page fetches.
// Needs Node 22.18+ / 23.6+ (imports .ts via type stripping).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const research = join(root, 'api', '_lib', 'research');
const gp = await import(join(research, 'guideline-page.ts'));
const { PAGES } = await import(join(here, 'guideline-pages.config.mjs'));

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const summariserName = arg('summariser') ?? 'extractive';
const maxPages = Math.min(Number(arg('max') ?? 5), 10);
const out = arg('out') ?? join(research, 'staging', 'guideline-pages.json');
const cacheDir = join(here, '.cache', 'guideline-pages');
const only = arg('only');
const MIN_GAP_MS = 3000;

// ── Summarisers (pluggable) ─────────────────────────────────────────

async function claudeSummariser() {
  // Paid path, off by default. Mirrors build-library.mjs (model, JSON
  // schema output) but works from the page text instead of an abstract.
  if (!flag('allow-paid')) throw new Error('--summariser claude calls the paid Anthropic API: add --allow-paid to confirm.');
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');
  const { default: Anthropic } = await import(join(here, 'node_modules', '@anthropic-ai', 'sdk', 'index.mjs')).catch(() => {
    throw new Error('Run npm install in scripts/research first (the SDK is kept out of the app).');
  });
  const client = new Anthropic({ apiKey: key, timeout: 120_000, maxRetries: 2 });
  const model = process.env.RESEARCH_MODEL ?? 'claude-sonnet-5-5';
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'key_points', 'tags', 'keywords'],
    properties: {
      summary: { type: 'string' },
      key_points: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' } },
      keywords: { type: 'array', items: { type: 'string' } },
    },
  };
  const system =
    "You write entries for the research library of Womanie, a women's health app. Readers are patients. " +
    'You get ONE public guideline web page. Work only from its text; never add facts, numbers or doses it does not state. ' +
    '"summary": 2-4 plain sentences. "key_points": 2-6 findings or recommendations stated on the page, keeping numbers exactly. ' +
    '"tags": 2-6 lowercase topic tags. "keywords": 4-12 lowercase words a patient might type.';
  return async (page, ctx) => {
    const resp = await client.messages.create({
      model,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: `Publisher: ${ctx.publisher}\nURL: ${ctx.url}\nTitle: ${page.meta.title}\n\n${page.text.slice(0, 24_000)}` }],
      output_config: { format: { type: 'json_schema', schema } },
    });
    const j = JSON.parse(resp.content.find((b) => b.type === 'text').text);
    return { summary: j.summary, keyPoints: j.key_points, tags: j.tags, keywords: j.keywords };
  };
}

const summarisers = {
  extractive: async () => gp.extractiveSummariser,
  claude: claudeSummariser,
};
if (!summarisers[summariserName]) throw new Error(`Unknown --summariser ${summariserName} (extractive | claude)`);
const summarise = await summarisers[summariserName]();
const summariserId = summariserName === 'extractive' ? gp.EXTRACTIVE_SUMMARISER : `claude:${process.env.RESEARCH_MODEL ?? 'claude-sonnet-5-5'}`;

// ── Polite fetching ─────────────────────────────────────────────────

const lastHit = new Map();
const robotsCache = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function politeFetch(url, delaySec = 0) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + Math.max(MIN_GAP_MS, delaySec * 1000) - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  return fetch(url, { headers: { 'User-Agent': gp.USER_AGENT, Accept: 'text/html,application/xhtml+xml,text/plain' }, redirect: 'follow' });
}

async function robotsFor(url) {
  const origin = new URL(url).origin;
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  const res = await politeFetch(`${origin}/robots.txt`);
  let rules;
  if (res.ok) rules = gp.parseRobots(await res.text());
  else if (res.status >= 400 && res.status < 500) rules = gp.parseRobots(''); // RFC 9309: no robots file = allowed
  else rules = null; // 5xx / unreachable: treat as disallowed
  robotsCache.set(origin, rules);
  return rules;
}

async function checkRobots(url) {
  const rules = await robotsFor(url);
  if (!rules) return { allowed: false, rule: 'robots.txt unreachable (treated as disallow)', crawlDelay: null };
  return gp.robotsAllows(rules, url);
}

async function getHtml(url, id, crawlDelay) {
  const file = join(cacheDir, `${id}.html`);
  if (!flag('refetch') && existsSync(file)) {
    const cached = JSON.parse(readFileSync(`${file}.json`, 'utf8'));
    return { html: readFileSync(file, 'utf8'), fetchedAt: cached.fetchedAt, finalUrl: cached.finalUrl, fromCache: true };
  }
  const res = await politeFetch(url, crawlDelay ?? 0);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!/html/i.test(type)) throw new Error(`not HTML (${type})`);
  const html = await res.text();
  // Bot walls (reCAPTCHA, Cloudflare) are respected, never worked around,
  // and never cached as if they were the page.
  if (/<title>[^<]*(captcha|checking your browser|just a moment|access denied)/i.test(html)) throw new Error('site served a bot challenge; not bypassed');
  const fetchedAt = new Date().toISOString();
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, html);
  writeFileSync(`${file}.json`, JSON.stringify({ url, finalUrl: res.url, fetchedAt, status: res.status }));
  return { html, fetchedAt, finalUrl: res.url, fromCache: false };
}

// ── Run ─────────────────────────────────────────────────────────────

const lib = JSON.parse(readFileSync(join(research, 'library.json'), 'utf8'));
const topicIds = new Set(lib.topics.map((t) => t.id));
const existingUrls = new Set(lib.items.map((i) => i.url));

const items = [];
const chunks = {};
const skipped = [];
let fetched = 0;

for (const cur of PAGES.filter((p) => !only || p.url === only)) {
  const url = cur.url;
  const policy = gp.publisherFor(url);
  if (cur.hold) {
    skipped.push({ url, reason: `on hold: ${cur.hold}` });
    continue;
  }
  if (!policy) {
    skipped.push({ url, reason: 'host not in PUBLISHERS (no licence review yet)' });
    continue;
  }
  if (policy.ingest !== 'allowed') {
    skipped.push({ url, reason: `licence: ${policy.licence.name}. ${policy.licence.notes}` });
    continue;
  }
  if (existingUrls.has(url)) {
    skipped.push({ url, reason: 'already in library.json' });
    continue;
  }
  if (fetched >= maxPages) {
    skipped.push({ url, reason: `--max ${maxPages} pages reached` });
    continue;
  }
  const id = gp.guidelineItemId(url, policy.publisher);
  try {
    const robots = await checkRobots(url);
    if (!robots.allowed) {
      skipped.push({ url, reason: `robots.txt: ${robots.rule}` });
      continue;
    }
    const { html, fetchedAt, finalUrl, fromCache } = await getHtml(url, id, robots.crawlDelay);
    if (!fromCache) fetched++;
    if (gp.publisherFor(finalUrl)?.publisher !== policy.publisher) throw new Error(`redirected off-publisher to ${finalUrl}`);
    if (finalUrl !== url && !(await checkRobots(finalUrl)).allowed) throw new Error(`robots.txt disallows redirect target ${finalUrl}`);
    const page = gp.extractPage(html);
    if (policy.requireText && !page.text.toLowerCase().includes(policy.requireText.toLowerCase()) && !html.includes(policy.requireText))
      throw new Error(`page lacks "${policy.requireText}" (licence scope)`);
    if (page.text.length < 300) throw new Error(`too little main text (${page.text.length} chars): extraction failed?`);
    const pageChunks = gp.chunkBlocks(id, page.blocks);
    const summary = await summarise(page, { url, publisher: policy.publisher, focus: cur.tags });
    // A redirect (NHS folds sub-pages into the main medicine page) makes
    // the final URL the one that holds this text: cite that one.
    const item = gp.buildGuidelineItem({ page, policy, curation: { ...cur, url: finalUrl }, summary, summariser: summariserId, fetchedAt, robotsRule: robots.rule, chunkCount: pageChunks.length });
    const errs = gp.validateLibraryItem(item, topicIds);
    if (errs.length) throw new Error(`schema: ${errs.join('; ')}`);
    if (finalUrl !== url) item.page.requestedUrl = url;
    items.push(item);
    chunks[item.id] = pageChunks;
    console.log(`  ok  ${item.id}  ${page.text.length} chars, ${pageChunks.length} chunks${fromCache ? ' (cached HTML)' : ''}`);
  } catch (err) {
    skipped.push({ url, reason: `error: ${err.message}` });
  }
}

let embedding = null;
const embeddings = {};
if (!flag('no-embed') && items.length) {
  const { DEFAULT_EMBEDDING_MODEL, DOC_TEXT_RECIPE, documentText, encodeVector, getEmbedder, textHash } = await import(join(research, 'embed.ts'));
  const libEmb = JSON.parse(readFileSync(join(research, 'library-embeddings.json'), 'utf8'));
  const model = libEmb.model ?? DEFAULT_EMBEDDING_MODEL; // must match the library's vectors
  const embedder = await getEmbedder(model);
  const texts = items.map(documentText);
  const vectors = await embedder.embed(texts, 'document');
  items.forEach((it, i) => (embeddings[it.id] = { h: textHash(texts[i]), ...encodeVector(vectors[i]) }));
  embedding = { model, modelId: embedder.spec.id, dims: embedder.spec.dims, recipe: DOC_TEXT_RECIPE };
}

const staging = {
  version: 1,
  generatedAt: new Date().toISOString(),
  dryRun: true,
  note: 'CANDIDATES ONLY. Not in library.json and not used by the app. Adding any of them needs the founder\'s approval.',
  sourceType: gp.GUIDELINE_SOURCE_TYPE,
  summariser: summariserId,
  embedding,
  items,
  chunks,
  embeddings,
  skipped,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(staging, null, 2) + '\n');
console.log(`Staged ${items.length} item(s), skipped ${skipped.length}, ${fetched} page fetch(es) this run -> ${out}`);
for (const s of skipped) console.log(`  skip ${s.url}\n       ${s.reason.slice(0, 200)}`);
