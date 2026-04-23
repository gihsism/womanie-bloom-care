import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { checkAndConsume } from '../_lib/ratelimit.js';
import { withSentry } from '../_lib/sentry.js';

// On-demand narrative summary across the patient's documents.
//
// Per-doc analyses are great, but Alena asked specifically for the
// dashboard to reflect what the analyses *mean together*. This
// endpoint reads her profile + every analyzed document's summary and
// the last ~200 extracted values, then asks Claude for a 4-6
// paragraph human-readable health narrative: key patterns, changes
// over time, what to monitor, what looks good, what to discuss with
// a clinician.
//
// Runs Claude Sonnet 4 once per call and caches by a weekly bucket
// in llm_cache so repeated clicks within a week hit cache. The
// client gets back { summary, generatedAt, cached }.

export const config = { maxDuration: 120 };

async function hashRequest(data: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function isoWeekBucket(now: Date): string {
  // Compact weekly key — same across a calendar week so clicks cluster.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dayNum);
  return d.toISOString().split('T')[0];
}

const SYSTEM_PROMPT = `You are a women's health nurse-companion writing a friendly, personal, evidence-backed weekly health narrative for a patient based on the health documents she has uploaded to Womanie.

Write in plain language with warmth. Use "you", not "the patient". Address the patient directly. Never diagnose; frame everything as patterns and conversation starters for a real clinician. Skip disclaimers other than a single line at the end.

Structure the output as markdown with four short sections:
1. **Your big picture** — 2-3 sentences summarising what her results are showing overall right now, referring to trends across documents rather than single tests.
2. **What's going well** — bulleted, 2-4 points. Lean into normalised values, improvements, and healthy patterns.
3. **What to keep an eye on** — bulleted, 2-5 points. For each, explain the what, the why it matters (specific to women's health / her life stage where relevant), and a concrete next step.
4. **Good questions to bring to your doctor** — 2-4 specific questions tied to her actual data.

End with a one-line sign-off reminding her Womanie is not a replacement for a clinician.

Do not invent numbers. If something isn't in the data, don't mention it.`;

async function callClaude(apiKey: string, userContent: string): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userContent }],
      temperature: 0.4,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text: string | undefined = data.content?.[0]?.text;
  if (!text) throw new Error('Empty Claude response');
  return text;
}

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const force = req.body?.force === true;

  // Cache hits don't call Anthropic, so only charge the rate-limit
  // budget when we're actually about to do fresh work.
  if (force) {
    const rate = checkAndConsume('summary-generate-force', user.id, 10);
    if (!rate.ok) {
      return res.status(429).json({
        error: `Too many refreshes — try again in ${Math.ceil(rate.retryInSec / 60)} minutes.`,
        retryInSec: rate.retryInSec,
      });
    }
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const [profileRows, docRows, extractedRows] = await Promise.all([
      sql.query(
        'SELECT full_name, life_stage, pregnancy_due_date, ivf_phase FROM profiles WHERE id = $1',
        [user.id]
      ),
      sql.query(
        `SELECT ai_suggested_name, file_name, ai_suggested_category, ai_summary, uploaded_at
           FROM health_documents
          WHERE user_id = $1 AND ai_summary IS NOT NULL
          ORDER BY uploaded_at DESC
          LIMIT 20`,
        [user.id]
      ),
      sql.query(
        `SELECT title, value, unit, reference_range, status, data_type, date_recorded
           FROM current_extracted_data
          WHERE user_id = $1
          ORDER BY date_recorded DESC NULLS LAST
          LIMIT 200`,
        [user.id]
      ),
    ]) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>, Array<Record<string, unknown>>];

    if (docRows.length === 0) {
      return res.status(200).json({
        summary: null,
        empty: true,
        message: 'Upload at least one analyzed document to generate a summary.',
      });
    }

    // Build a compact, stable user-content block. Stable across the week
    // (only changes when the underlying analyses change) so cache keys
    // don't churn between clicks.
    const profile = profileRows[0] ?? {};
    const today = new Date();
    const weekBucket = isoWeekBucket(today);

    const parts: string[] = [];
    parts.push(`Today: ${today.toISOString().split('T')[0]} (week of ${weekBucket}).`);
    if (profile.life_stage) parts.push(`Life stage: ${profile.life_stage}.`);
    if (profile.pregnancy_due_date) parts.push(`Pregnancy due: ${profile.pregnancy_due_date}.`);
    if (profile.ivf_phase) parts.push(`IVF phase: ${profile.ivf_phase}.`);
    if (profile.full_name) parts.push(`Patient's preferred name: ${profile.full_name}.`);

    parts.push('', `## Recent documents (${docRows.length})`);
    for (const d of docRows) {
      const name = d.ai_suggested_name || d.file_name;
      const date = d.uploaded_at ? new Date(d.uploaded_at).toISOString().split('T')[0] : '';
      parts.push(`- ${name}${d.ai_suggested_category ? ` [${d.ai_suggested_category}]` : ''}${date ? ` · ${date}` : ''}`);
      if (d.ai_summary) {
        // First couple of sentences, aggressively trimmed, no markdown
        // decorations so the model doesn't echo them back.
        const summary = String(d.ai_summary).replace(/\s+/g, ' ').trim().slice(0, 400);
        parts.push(`  ${summary}`);
      }
    }

    if (extractedRows.length > 0) {
      // Prioritize flagged values but keep the count bounded.
      const flagged = extractedRows.filter(r => r.status === 'critical' || r.status === 'abnormal');
      const normal = extractedRows.filter(r => r.status === 'normal' || r.status === 'expected');
      const sample = [...flagged, ...normal].slice(0, 120);
      parts.push('', `## Extracted values (${sample.length} of ${extractedRows.length})`);
      for (const r of sample) {
        const val = r.value ?? '';
        const unit = r.unit ? ` ${r.unit}` : '';
        const ref = r.reference_range ? ` (ref ${r.reference_range})` : '';
        const date = r.date_recorded ? ` on ${r.date_recorded}` : '';
        const status = r.status ? ` [${r.status}]` : '';
        parts.push(`- ${r.title}: ${val}${unit}${ref}${status}${date}`);
      }
    }

    const userContent = parts.join('\n');
    const cacheKey = `summary_v1:${user.id}:${weekBucket}:${await hashRequest(userContent)}`;

    // Weekly cache unless force=true (user explicitly asks to regenerate).
    if (!force) {
      const cached = await sql.query(
        'SELECT response_text, created_at FROM llm_cache WHERE request_hash = $1',
        [cacheKey]
      ) as Array<{ response_text: string | null; created_at: string | null }>;
      if (cached.length > 0 && cached[0].response_text) {
        await sql.query(
          'UPDATE llm_cache SET hit_count = hit_count + 1, last_hit_at = now() WHERE request_hash = $1',
          [cacheKey]
        ).catch(() => {});
        return res.status(200).json({
          summary: cached[0].response_text,
          generatedAt: cached[0].created_at,
          cached: true,
          weekBucket,
        });
      }
    }

    const summary = await callClaude(apiKey, userContent);

    await sql.query(
      `INSERT INTO llm_cache (request_hash, response_text, model)
         VALUES ($1, $2, $3)
       ON CONFLICT (request_hash)
         DO UPDATE SET response_text = EXCLUDED.response_text, created_at = now()`,
      [cacheKey, summary, 'claude-sonnet-4-20250514']
    ).catch((e: unknown) => console.error('Summary cache store error:', e));

    return res.status(200).json({
      summary,
      generatedAt: new Date().toISOString(),
      cached: false,
      weekBucket,
    });
  } catch (error) {
    console.error('summary/generate error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate summary' });
  }
}

export default withSentry(handler);
