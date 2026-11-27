#!/usr/bin/env node
// Builds the Womanie research library: api/_lib/research/library.json.
//
//   cd scripts/research && npm install && node build-library.mjs
//
// Steps
//   1. FETCH   For every topic in topics.mjs, search PubMed (NCBI
//              E-utilities) for clinical guidelines, Cochrane reviews and
//              other systematic reviews / meta-analyses (2015+, English,
//              with an abstract), plus a few landmark trials by title.
//              Records (incl. abstracts) are cached in .cache/records.json,
//              which is git-ignored: abstracts are never committed.
//   2. SUMMARISE  For each record, Claude writes a plain-English summary,
//              key points, life stages, tags and keywords FROM THE ABSTRACT
//              ONLY, and says whether the record is useful to patients.
//              Cached per PMID in .cache/summaries.json, so a monthly re-run
//              only pays for new records.
//   3. VALIDATE + WRITE  Rejects any item without a PMID/URL or with an
//              empty field, then writes library.json (sorted, stable).
//
// Flags
//   --skip-fetch     reuse .cache/records.json
//   --fetch-only     stop after step 1
//   --limit N        summarise at most N new records (for a test run)
//   --refresh        ignore both caches
//   --only a,b       search PubMed for these topic ids only (no landmarks)
//                    and merge the hits into the cached records, so new
//                    topics can be added without re-running every search
//
// Env
//   ANTHROPIC_API_KEY   read from the environment or from .env.local in
//                       the main repo (never printed)
//   RESEARCH_MODEL      default claude-sonnet-5-5
//   NCBI_API_KEY        optional; raises the E-utilities limit to 10 req/s

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { TOPICS, LANDMARKS, STAGES } from './topics.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const cacheDir = path.join(here, '.cache');
const outFile = path.join(repoRoot, 'api', '_lib', 'research', 'library.json');
const RECORDS = path.join(cacheDir, 'records.json');
const SUMMARIES = path.join(cacheDir, 'summaries.json');

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? new Set(String(args[onlyIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean)) : null;
const MODEL = process.env.RESEARCH_MODEL || 'claude-sonnet-5-5';
const MIN_YEAR = 2015;
// Multiplies every topic's `max` (TOPIC_SCALE=6 grows the library ~6x).
const SCALE = Number(process.env.TOPIC_SCALE || 1);
// Stop summarising once this run's estimated Claude spend reaches the cap.
const BUDGET_USD = Number(process.env.BUDGET_USD || 28);

fs.mkdirSync(cacheDir, { recursive: true });
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1));

// ── 1. FETCH ─────────────────────────────────────────────────────────

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const NCBI_KEY = process.env.NCBI_API_KEY;
const GAP_MS = NCBI_KEY ? 120 : 370; // stay under 3 req/s without a key
let lastCall = 0;

async function eutils(endpoint, params) {
  const wait = lastCall + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const qs = new URLSearchParams({ ...params, tool: 'womanie', ...(NCBI_KEY ? { api_key: NCBI_KEY } : {}) });
  for (let attempt = 0; attempt < 4; attempt++) {
    let resp;
    try {
      resp = await fetch(`${EUTILS}/${endpoint}?${qs}`, { signal: AbortSignal.timeout(60_000) });
    } catch {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (resp.ok) return resp.text();
    if (resp.status === 429 || resp.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    throw new Error(`E-utilities ${endpoint} ${resp.status}`);
  }
  throw new Error(`E-utilities ${endpoint} kept failing`);
}

async function esearch(term, retmax) {
  const txt = await eutils('esearch.fcgi', { db: 'pubmed', term, retmax: String(retmax), sort: 'relevance', retmode: 'json' });
  return JSON.parse(txt).esearchresult?.idlist ?? [];
}

const BASE = `("${MIN_YEAR}"[dp] : "3000"[dp]) AND english[la] AND hasabstract[text] NOT (animals[mh] NOT humans[mh])`;
const PASSES = [
  { kind: 'guideline', filter: '(guideline[pt] OR "practice guideline"[pt] OR "consensus development conference"[pt])' },
  { kind: 'cochrane', filter: '"Cochrane Database Syst Rev"[ta]' },
  { kind: 'review', filter: '(systematic review[pt] OR meta-analysis[pt])' },
];

function decode(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
const first = (xml, re) => { const m = xml.match(re); return m ? decode(m[1]) : ''; };
const all = (xml, re) => [...xml.matchAll(re)].map((m) => m);

function parseArticle(xml) {
  const isBook = xml.startsWith('<PubmedBookArticle');
  const pmid = first(xml, /<PMID[^>]*>(\d+)<\/PMID>/);
  // A living database on the NCBI Bookshelf (LactMed: a <BeginningDate>,
  // one chapter per medicine) gets its book name after the bare chapter
  // title ("Ibuprofen") and the year the chapter was last revised, not the
  // year the database started (2006).
  const livingBook = isBook && /<BeginningDate>/.test(xml);
  const chapterTitle = first(xml, /<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/);
  const bookTitle = first(xml, /<BookTitle[^>]*>([\s\S]*?)<\/BookTitle>/);
  const title = livingBook && chapterTitle && bookTitle ? `${chapterTitle.replace(/\.$/, '')} — ${bookTitle}` : chapterTitle || bookTitle;
  const abstractParts = all(xml, /<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g).map((m) => {
    const label = (m[1].match(/Label="([^"]+)"/) || [])[1];
    const text = decode(m[2]);
    return label ? `${label}: ${text}` : text;
  });
  const journal = isBook
    ? first(xml, /<PublisherName>([\s\S]*?)<\/PublisherName>/) || 'NCBI Bookshelf'
    : first(xml, /<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/);
  const journalAbbrev = first(xml, /<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/) || first(xml, /<MedlineTA>([\s\S]*?)<\/MedlineTA>/);
  const pubDate = (xml.match(/<PubDate>([\s\S]*?)<\/PubDate>/) || [])[1] || '';
  const revised = livingBook ? first(xml, /<ContributionDate>\s*<Year>(\d{4})<\/Year>/) : '';
  const year = Number(revised || first(pubDate, /<Year>(\d{4})<\/Year>/) || (first(pubDate, /<MedlineDate>(\d{4})/)) || first(xml, /<ArticleDate[^>]*>\s*<Year>(\d{4})/) || 0);
  const doi = first(xml, /<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/) || first(xml, /<ELocationID EIdType="doi"[^>]*>([\s\S]*?)<\/ELocationID>/);
  const pubTypes = all(xml, /<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g).map((m) => decode(m[1]));
  const collective = all(xml, /<CollectiveName>([\s\S]*?)<\/CollectiveName>/g).map((m) => decode(m[1]));
  const retracted = pubTypes.some((t) => /retract/i.test(t));
  return { pmid, title, abstract: abstractParts.join('\n'), journal, journalAbbrev, year, doi, pubTypes, collective, retracted, isBook };
}

async function efetch(pmids) {
  const out = [];
  for (let i = 0; i < pmids.length; i += 150) {
    const chunk = pmids.slice(i, i + 150);
    const xml = await eutils('efetch.fcgi', { db: 'pubmed', id: chunk.join(','), retmode: 'xml' });
    for (const m of xml.matchAll(/<(PubmedArticle|PubmedBookArticle)>[\s\S]*?<\/\1>/g)) out.push(parseArticle(m[0]));
  }
  return out;
}

// Society documents PubMed does not tag as guidelines (NAMS position
// statements, some ACOG committee opinions, ASRM committee opinions, the
// CDC's US MEC) are still guidelines for the reader.
const GUIDELINE_TITLE = /\b(committee opinion|practice bulletin|clinical practice guideline|position statement|obstetric care consensus|medical eligibility criteria)\b/i;

function evidenceLevel(rec) {
  const t = rec.pubTypes.map((x) => x.toLowerCase());
  if (t.some((x) => x === 'guideline' || x === 'practice guideline' || x === 'consensus development conference')) return 'guideline';
  if (t.some((x) => x === 'systematic review' || x === 'meta-analysis' || x === 'network meta-analysis') || /cochrane database/i.test(rec.journal)) return 'systematic review';
  if (t.includes('consensus statement') || GUIDELINE_TITLE.test(rec.title)) return 'guideline';
  return 'study';
}

async function fetchAll(seed = null) {
  /** pmid -> { topics:Set, stages:Set, pass } */
  const assigned = new Map();
  // --only: records already cached count as "picked by an earlier topic",
  // exactly as in a full build (they gain the new topic but do not use
  // its quota).
  for (const rec of seed || []) assigned.set(rec.pmid, { topics: new Set(rec.topics), stages: new Set(rec.stages), pass: 'cached' });
  for (const topic of TOPICS) {
    if (ONLY && !ONLY.has(topic.id)) continue;
    const max = Math.max(1, Math.round((topic.max ?? 4) * SCALE));
    const quota = { guideline: Math.ceil(max / 3), cochrane: Math.ceil(max / 3) };
    const picked = [];
    for (const pass of PASSES) {
      const room = pass.kind === 'review' ? max - picked.length : Math.min(quota[pass.kind], max - picked.length);
      if (room <= 0) continue;
      const ids = await esearch(`(${topic.query}) AND ${pass.filter} AND ${BASE}`, room * 3);
      let added = 0;
      for (const id of ids) {
        if (added >= room) break;
        if (picked.includes(id)) continue;
        const prev = assigned.get(id);
        if (prev) { prev.topics.add(topic.id); topic.stages.forEach((s) => prev.stages.add(s)); continue; }
        picked.push(id);
        assigned.set(id, { topics: new Set([topic.id]), stages: new Set(topic.stages), pass: pass.kind });
        added++;
      }
    }
    console.log(`  ${topic.id.padEnd(34)} ${picked.length}`);
  }

  // Landmarks: fetch a few candidates per title search and keep the first
  // whose fetched title really is the named trial.
  const landmarkIds = new Map();
  for (const lm of ONLY ? [] : LANDMARKS) {
    const ids = await esearch(lm.query, 5);
    const cands = ids.length ? await efetch(ids) : [];
    const hit = cands.find((c) => c.title.toLowerCase().includes(lm.mustInclude));
    if (hit) landmarkIds.set(hit.pmid, lm);
    else console.warn(`  landmark ${lm.id}: not found, skipped`);
  }

  const seeded = new Map((seed || []).map((r) => [r.pmid, r]));
  const allIds = [...new Set([...assigned.keys(), ...landmarkIds.keys()])].filter((id) => !seeded.has(id));
  console.log(`Fetching ${allIds.length} PubMed records…`);
  const recs = await efetch(allIds);
  // Cached records keep their fields; only their topics/stages can grow.
  const records = [...seeded.values()].map((r) => {
    const a = assigned.get(r.pmid);
    return r.landmark || !a ? r : { ...r, topics: [...a.topics], stages: [...a.stages] };
  });
  for (const rec of recs) {
    const a = assigned.get(rec.pmid);
    const lm = landmarkIds.get(rec.pmid);
    if (lm) {
      records.push({ ...rec, topics: [lm.topic], stages: lm.stages, landmark: true });
    } else if (a) {
      records.push({ ...rec, topics: [...a.topics], stages: [...a.stages], landmark: false });
    }
  }
  return records;
}

// ── 2. SUMMARISE ─────────────────────────────────────────────────────

function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const candidates = [path.join(repoRoot, '.env.local'), path.join(os.homedir(), 'womanie-bloom-care', '.env.local')];
  for (const f of candidates) {
    try {
      const line = fs.readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith('ANTHROPIC_API_KEY='));
      if (line) return line.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
    } catch { /* try next */ }
  }
  throw new Error('ANTHROPIC_API_KEY not found (env or .env.local)');
}

const TOPIC_LABEL = Object.fromEntries(TOPICS.map((t) => [t.id, t.label]));

const SYSTEM = `You write entries for the research library of Womanie, a women's health app. Readers are patients, not clinicians.

You get ONE PubMed record: its title, journal, publication types and abstract. Work only from that text. Never add facts, numbers, doses or recommendations that the abstract does not state.

Decide "include": true only if the record gives a clear, patient-relevant finding or recommendation about women's or reproductive health, pregnancy, postpartum or infant care. Set false for: technical/surgical-procedure comparisons patients would not choose between, lab or methods papers, protocols without results, very narrow subgroups, non-human research, or abstracts that report no usable conclusion.

When included:
- "summary": 2-4 short sentences in plain English (reading age about 12). Say what was studied and what was found. If the abstract says the evidence is low quality, limited or uncertain, say so plainly. Calm, non-alarming tone; no "you should".
- "key_points": 2-4 short bullet sentences, each a finding or recommendation stated in the abstract.
- "certainty": the certainty the abstract itself reports ("high", "moderate", "low", "very low"), or "not stated".
- "life_stages": which of these the finding matters for: menstrual-cycle, conception, pregnancy, postpartum, contraception, ivf, menopause, post-menopause, general.
- "tags": 2-6 short lowercase topic tags (e.g. "caffeine", "gestational diabetes").
- "keywords": 4-12 lowercase search words a patient might type, including everyday synonyms (e.g. "coffee", "tea", "energy drinks").
- "organisation": the issuing body ONLY if the title or abstract names one (e.g. "NICE", "ACOG", "WHO", "Endocrine Society"); otherwise "".
When not included, still fill the fields briefly and give "exclude_reason".`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['include', 'exclude_reason', 'summary', 'key_points', 'certainty', 'life_stages', 'tags', 'keywords', 'organisation'],
  properties: {
    include: { type: 'boolean' },
    exclude_reason: { type: 'string' },
    summary: { type: 'string' },
    key_points: { type: 'array', items: { type: 'string' } },
    certainty: { type: 'string', enum: ['high', 'moderate', 'low', 'very low', 'not stated'] },
    life_stages: { type: 'array', items: { type: 'string', enum: STAGES } },
    tags: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    organisation: { type: 'string' },
  },
};

const usage = { input: 0, output: 0 };
const PRICE = MODEL.includes('haiku') ? [0.1, 0.5] : MODEL.includes('opus') ? [4, 20] : [2, 10];
const spend = () => (usage.input * PRICE[0] + usage.output * PRICE[1]) / 1e6;

async function summarise(client, rec) {
  const user = [
    `Library topic: ${rec.topics.map((t) => TOPIC_LABEL[t] || t).join('; ')}`,
    `Title: ${rec.title}`,
    `Journal: ${rec.journal} (${rec.year})`,
    `Publication types: ${rec.pubTypes.join(', ')}`,
    rec.collective.length ? `Group authors: ${rec.collective.join('; ')}` : '',
    '',
    'Abstract:',
    rec.abstract,
  ].filter((l) => l !== '').join('\n');

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        thinking: { type: 'between_tools' },
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      });
      usage.input += resp.usage.input_tokens;
      usage.output += resp.usage.output_tokens;
      if (resp.stop_reason === 'refusal') return null;
      const text = resp.content.find((b) => b.type === 'text')?.text;
      return JSON.parse(text);
    } catch (err) {
      if (attempt === 2) { console.warn(`  ${rec.pmid}: ${err.message}`); return null; }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return null;
}

async function summariseAll(records, cache) {
  const todo = records.filter((r) => !cache[r.pmid] && !r.retracted && r.abstract.length > 200).slice(0, LIMIT);
  if (todo.length === 0) return;
  console.log(`Summarising ${todo.length} records with ${MODEL}…`);
  const client = new Anthropic({ apiKey: loadApiKey(), timeout: 120_000, maxRetries: 2 });
  let done = 0;
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      if (spend() >= BUDGET_USD) {
        if (queue.length) console.warn(`  budget $${BUDGET_USD} reached; ${queue.length} records left unsummarised`);
        queue.length = 0;
        break;
      }
      const rec = queue.shift();
      const s = await summarise(client, rec);
      if (s) cache[rec.pmid] = { ...s, model: MODEL };
      if (++done % 20 === 0) { console.log(`  ${done}/${todo.length}  ~$${spend().toFixed(2)}`); writeJson(SUMMARIES, cache); }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  writeJson(SUMMARIES, cache);
}

// ── 3. VALIDATE + WRITE ──────────────────────────────────────────────

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const uniqLower = (arr) => [...new Set(arr.map((x) => clean(x).toLowerCase()).filter(Boolean))];

export function validateItem(item) {
  const errs = [];
  if (!/^\d+$/.test(item.pmid || '')) errs.push('pmid');
  if (!/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/.test(item.url || '')) errs.push('url');
  for (const f of ['title', 'source', 'summary']) if (!clean(item[f])) errs.push(f);
  if (!(item.year >= 1950 && item.year <= new Date().getFullYear() + 1)) errs.push('year');
  if (!['guideline', 'systematic review', 'study'].includes(item.evidenceLevel)) errs.push('evidenceLevel');
  if (!Array.isArray(item.keyPoints) || item.keyPoints.length < 2 || item.keyPoints.some((k) => !clean(k))) errs.push('keyPoints');
  if (!Array.isArray(item.lifeStages) || item.lifeStages.length === 0 || item.lifeStages.some((s) => !STAGES.includes(s))) errs.push('lifeStages');
  if (!Array.isArray(item.topics) || item.topics.length === 0) errs.push('topics');
  if (!Array.isArray(item.tags) || item.tags.length === 0) errs.push('tags');
  if (!Array.isArray(item.keywords) || item.keywords.length === 0) errs.push('keywords');
  return errs;
}

// PubMed journal titles -> readable names: "The New England journal of
// medicine" -> "New England Journal of Medicine", drops subtitles.
const SMALL = new Set(['of', 'and', 'the', 'in', 'for', 'on', 'de', 'et', 'la', 'a', 'an']);
function displayJournal(title) {
  if (/cochrane database/i.test(title)) return 'Cochrane Database of Systematic Reviews';
  let t = title.replace(/\s*\([^)]*\)/g, '').split(' : ')[0].split(': ')[0].replace(/^The /i, '').replace(/\.$/, '').trim();
  t = t.split(' ').map((w, i) => (w === w.toLowerCase() && (i === 0 || !SMALL.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
  return t || title;
}

// Items whose subject is the baby itself (a newborn/infant treatment or
// supplement) with no pregnancy/mother/birth wording in the title. A topic
// adds its stages to every record its search returned, so e.g. a review of
// paracetamol for a preterm baby's heart duct, found by the "paracetamol in
// pregnancy" search, got the 'pregnancy' stage and topped pregnancy
// questions. For these items the stages Claude read from the abstract are
// used alone; the topic's stages are not merged in.
const INFANT_TITLE = /\b(newborns?|neonat\w*|preterm (infants?|babies|neonates)|low[- ]birth[- ]weight (infants?|babies)|infants?|babies|baby)\b/i;
const MATERNAL_TITLE = /\b(pregnan\w*|prenatal|antenatal|maternal|mothers?|women|woman|gestation\w*|gravidarum|obstetric\w*|labou?r|birth(?![- ]?weight)|childbirth|deliver\w*|caesarean|cesarean|breast[- ]?fe\w*|breast ?milk|human milk|lactat\w*|in utero|fetal|foetal|fetus|perinatal|intrapartum|embryo\w*|ivf|twins?|parents?|outcomes?)\b/i;
export function isInfantOnlyTitle(title) {
  return INFANT_TITLE.test(title) && !MATERNAL_TITLE.test(title);
}

/**
 * The stages Claude read from the abstract, plus the stages of the topics
 * whose searches found the record (topics add recall). Two exceptions:
 *  - an item about the baby only keeps the abstract's stages alone;
 *  - 'pregnancy' is a safety claim, so a topic does not add it when the
 *    abstract's stages share none with the topic's (the search caught an
 *    item from another stage: coffee after a caesarean found by "caffeine
 *    in pregnancy", NSAIDs for UTIs found by "NSAIDs in pregnancy").
 */
export function mergeStages(title, summaryStages, topicStages) {
  const own = (summaryStages || []).filter((x) => STAGES.includes(x));
  let topic = topicStages || [];
  if (own.length > 0 && isInfantOnlyTitle(title)) topic = [];
  else if (own.length > 0 && !topic.some((x) => own.includes(x))) topic = topic.filter((x) => x !== 'pregnancy');
  const merged = [...own, ...topic];
  return STAGES.filter((x) => merged.includes(x));
}

function assemble(records, cache) {
  const items = [];
  const rejected = { excluded: 0, invalid: 0, missing: 0 };
  for (const rec of records) {
    const s = cache[rec.pmid];
    if (!s) { rejected.missing++; continue; }
    if (!s.include) { rejected.excluded++; continue; }
    // A paper retracted after its summary was cached must still drop out
    // (pmid 37311484, tranexamic acid at caesarean, retracted Dec 2026).
    if (rec.retracted) { rejected.excluded++; continue; }
    if (/^withdrawn\b/i.test(rec.title)) { rejected.excluded++; continue; }
    const level = evidenceLevel(rec);
    // An organisation is shown as the source only for guidelines, and only
    // if it is literally named in the record's title or group authors (a
    // review that merely mentions a body is not issued by it).
    const haystack = `${rec.title} ${rec.collective.join(' ')}`.toLowerCase();
    const org = clean(s.organisation);
    const organisation = level === 'guideline' && org && haystack.includes(org.toLowerCase()) ? org : '';
    const journal = displayJournal(rec.journal);
    const lifeStages = mergeStages(rec.title, s.life_stages, rec.stages);
    const item = {
      id: `pmid-${rec.pmid}`,
      pmid: rec.pmid,
      doi: rec.doi || null,
      title: rec.title.replace(/\.$/, ''),
      source: organisation || journal,
      journal,
      organisation: organisation || null,
      year: rec.year,
      publicationTypes: rec.pubTypes.filter((t) => t !== 'Journal Article' && !/^Research Support/.test(t)),
      evidenceLevel: level,
      landmark: rec.landmark || undefined,
      url: `https://pubmed.ncbi.nlm.nih.gov/${rec.pmid}/`,
      summary: clean(s.summary),
      keyPoints: (s.key_points || []).map(clean).filter(Boolean).slice(0, 4),
      certainty: s.certainty,
      lifeStages: STAGES.filter((x) => lifeStages.includes(x)),
      topics: rec.topics,
      tags: uniqLower(s.tags || []).slice(0, 6),
      keywords: uniqLower(s.keywords || []).slice(0, 12),
    };
    if (!item.landmark) delete item.landmark;
    const errs = validateItem(item);
    if (errs.length) { rejected.invalid++; console.warn(`  rejected ${rec.pmid}: ${errs.join(', ')}`); continue; }
    items.push(item);
  }
  // Updated reviews (e.g. Cochrane re-publishing under the same title):
  // keep only the newest version, merging its topics and stages.
  const byTitle = new Map();
  for (const it of items.sort((a, b) => b.year - a.year || b.pmid.localeCompare(a.pmid))) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const kept = byTitle.get(key);
    if (!kept) { byTitle.set(key, it); continue; }
    kept.topics = [...new Set([...kept.topics, ...it.topics])];
    kept.lifeStages = STAGES.filter((s) => kept.lifeStages.includes(s) || it.lifeStages.includes(s));
    rejected.superseded = (rejected.superseded || 0) + 1;
  }
  items.length = 0;
  const byDoi = new Map();
  for (const it of byTitle.values()) {
    const doi = (it.doi || '').toLowerCase();
    const kept = doi && byDoi.get(doi);
    if (!kept) { items.push(it); if (doi) byDoi.set(doi, it); continue; }
    kept.topics = [...new Set([...kept.topics, ...it.topics])];
    kept.lifeStages = STAGES.filter((s) => kept.lifeStages.includes(s) || it.lifeStages.includes(s));
    rejected.superseded = (rejected.superseded || 0) + 1;
  }
  items.sort((a, b) => a.topics[0].localeCompare(b.topics[0]) || b.year - a.year || a.pmid.localeCompare(b.pmid));
  return { items, rejected };
}

async function main() {
  let records = flag('--refresh') ? null : readJson(RECORDS, null);
  if (ONLY) {
    const unknown = [...ONLY].filter((id) => !TOPICS.some((t) => t.id === id));
    if (unknown.length) throw new Error(`--only: unknown topic ids ${unknown.join(', ')}`);
    if (!records) throw new Error('--only needs .cache/records.json from a full build');
    console.log(`Searching PubMed for ${[...ONLY].join(', ')} only…`);
    records = await fetchAll(records);
    writeJson(RECORDS, records);
  } else if (!records || !flag('--skip-fetch')) {
    console.log('Searching PubMed…');
    records = await fetchAll();
    writeJson(RECORDS, records);
  }
  // Keep every item already in the library: fetch any record the new
  // searches did not return, and reuse its existing summary (never pay twice).
  const previous = readJson(outFile, { items: [] }).items || [];
  const have = new Set(records.map((r) => r.pmid));
  const missing = previous.filter((it) => !have.has(it.pmid));
  if (missing.length) {
    console.log(`Re-fetching ${missing.length} existing library records…`);
    const byPmid = new Map(missing.map((it) => [it.pmid, it]));
    for (const rec of await efetch([...byPmid.keys()])) {
      const it = byPmid.get(rec.pmid);
      if (it) records.push({ ...rec, topics: it.topics, stages: it.lifeStages, landmark: Boolean(it.landmark) });
    }
    writeJson(RECORDS, records);
  }
  console.log(`${records.length} records`);
  if (flag('--fetch-only')) return;

  const cache = flag('--refresh') ? {} : readJson(SUMMARIES, {});
  for (const it of previous) {
    if (cache[it.pmid]) continue;
    cache[it.pmid] = {
      include: true, exclude_reason: '', summary: it.summary, key_points: it.keyPoints,
      certainty: it.certainty, life_stages: it.lifeStages, tags: it.tags, keywords: it.keywords,
      organisation: it.organisation || '', model: 'seeded-from-library',
    };
  }
  await summariseAll(records, cache);

  const { items, rejected } = assemble(records, cache);
  const usedTopics = new Set(items.flatMap((i) => i.topics));
  const library = {
    version: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    source: 'PubMed (NCBI E-utilities). Summaries written from abstracts only.',
    disclaimer: 'General information from published research, not medical advice. Talk to your doctor or midwife about your situation.',
    topics: TOPICS.filter((t) => usedTopics.has(t.id)).map(({ id, label, stages }) => ({ id, label, stages })),
    items,
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(library, null, 1) + '\n');

  const byStage = Object.fromEntries(STAGES.map((s) => [s, items.filter((i) => i.lifeStages.includes(s)).length]));
  const byLevel = items.reduce((m, i) => ((m[i.evidenceLevel] = (m[i.evidenceLevel] || 0) + 1), m), {});
  console.log(`\nWrote ${items.length} items (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB) to ${path.relative(repoRoot, outFile)}`);
  console.log('Rejected:', rejected);
  console.log('By life stage:', byStage);
  console.log('By evidence level:', byLevel);
  if (usage.input) {
    console.log(`Claude usage this run: ${usage.input} in / ${usage.output} out tokens ~$${spend().toFixed(2)}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
