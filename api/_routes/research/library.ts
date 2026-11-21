import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withSentry } from '../../_lib/sentry.js';
import { browseItems, getLibrary, normalizeLifeStage, RESEARCH_DISCLAIMER } from '../../_lib/research/library.js';
import { evidenceNotes } from '../../_lib/research/evidence-notes.js';

// GET /api/research/library?stage=pregnancy&topic=caffeine-pregnancy&q=coffee
//
// Browse the research library (the /library page). Public content: every
// item is a published guideline or review with our own short summary, so
// no auth and no user data. `stage` filters to one life stage (plus the
// 'general' items); omit it or pass 'all' for everything.
//
// GET /api/research/library?notes=iron-pregnancy,pre-eclampsia
//
// "What the research says" notes for the cards next to the user's own
// data: 1-2 hand-picked items per note id with a one-line takeaway
// (api/_lib/research/evidence-notes.ts). Small and cacheable, so a screen
// asks once for all its notes instead of loading the library.

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (typeof req.query.notes === 'string') {
    const ids = req.query.notes.slice(0, 400).split(',');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).json({
      version: getLibrary().version,
      disclaimer: RESEARCH_DISCLAIMER,
      notes: evidenceNotes(ids),
    });
  }

  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : '';
  const stageParam = typeof req.query.stage === 'string' ? req.query.stage : '';
  const stage = stageParam === 'all' ? null : normalizeLifeStage(stageParam);
  const topicParam = typeof req.query.topic === 'string' ? req.query.topic : '';

  const lib = getLibrary();
  const topic = lib.topics.some((t) => t.id === topicParam) ? topicParam : null;

  // Topic chips: counts for the chosen stage (before the topic/text filter).
  const inStage = browseItems({ lifeStage: stage });
  const counts = new Map<string, number>();
  for (const it of inStage) for (const t of it.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  // The stage's own topics first (in plan order), then general ones.
  const own = (t: (typeof lib.topics)[number]) => (stage ? t.stages.includes(stage) : true);
  const topics = lib.topics
    .filter((t) => counts.has(t.id) && (own(t) || t.stages.includes('general')))
    .sort((a, b) => Number(own(b)) - Number(own(a)))
    .map((t) => ({ id: t.id, label: t.label, count: counts.get(t.id) ?? 0 }));

  const items = browseItems({ lifeStage: stage, topic, q }).map((it) => ({
    id: it.id,
    pmid: it.pmid,
    title: it.title,
    source: it.source,
    year: it.year,
    evidenceLevel: it.evidenceLevel,
    certainty: it.certainty,
    landmark: it.landmark ?? false,
    url: it.url,
    summary: it.summary,
    keyPoints: it.keyPoints,
    lifeStages: it.lifeStages,
    topics: it.topics,
    tags: it.tags,
  }));

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  return res.status(200).json({
    version: lib.version,
    disclaimer: RESEARCH_DISCLAIMER,
    stage: stage ?? 'all',
    topic,
    total: lib.items.length,
    topics,
    items,
  });
}

export default withSentry(handler);
