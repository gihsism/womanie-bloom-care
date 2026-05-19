import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { checkAndConsume } from '../_lib/ratelimit.js';
import { withSentry } from '../_lib/sentry.js';
import { callAnthropicWithRetry } from '../_lib/anthropic.js';

// Per-panel narrative summary.
//
// Sibling of /api/summary/generate, scoped to one panel rather than
// the whole patient record. The frontend's PanelDetail page calls
// this so the user gets a 4-paragraph plain-language read across
// just CBC, or just Thyroid, etc.
//
// Cached in llm_cache keyed on user + panel + content hash. `force`
// bumps a per-day rate-limit bucket and bypasses the cache.

export const config = { maxDuration: 60 };

async function hashRequest(data: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const SYSTEM_PROMPT = `You are a women's health nurse-companion writing a tight, friendly narrative about ONE panel of lab results for a patient.

Write directly to the patient using "you". Stay in plain language. Reference specific values + dates from her data; never invent numbers. Skip generic disclaimers other than a one-line sign-off at the end.

Output as markdown with three short sections:

1. **What this panel is for** — 1-2 sentences explaining what the panel measures and why it matters for women's health.
2. **What your readings show** — bulleted, 3-6 points. Each point names a specific value with date and unit, says whether it's in range, and notes the trend across her readings (rising / falling / steady) when there are 2+ readings of that test.
3. **What to discuss with your doctor** — 1-3 specific, data-grounded questions. Tie each to her actual numbers.

Close with the standard one-line note that Womanie isn't a replacement for clinical care.`;

async function callClaude(apiKey: string, userContent: string): Promise<string> {
  const resp = await callAnthropicWithRetry(apiKey, {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userContent }],
    temperature: 0.4,
  });
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

  const { panel, force } = (req.body ?? {}) as { panel?: string; force?: boolean };
  if (!panel || typeof panel !== 'string') {
    return res.status(400).json({ error: 'panel required' });
  }

  if (force === true) {
    const rate = checkAndConsume('panel-summary-force', user.id, 15);
    if (!rate.ok) {
      return res.status(429).json({
        error: `Too many refreshes — try again in ${Math.ceil(rate.retryInSec / 60)} minutes.`,
        retryInSec: rate.retryInSec,
      });
    }
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const profileRows = await sql.query(
      'SELECT life_stage, pregnancy_due_date, ivf_phase FROM profiles WHERE id = $1',
      [user.id]
    ) as Array<Record<string, unknown>>;
    const extractedRows = await sql.query(
      `SELECT title, value, unit, reference_range, status, date_recorded, raw_data
         FROM current_extracted_data
        WHERE user_id = $1 AND data_type = 'lab_result'
        ORDER BY date_recorded DESC NULLS LAST`,
      [user.id]
    ) as Array<Record<string, unknown>>;

    // Filter to just rows whose raw_data.panel matches the requested
    // panel. We do this server-side to keep the prompt tight + the
    // cache key meaningful.
    const panelLower = panel.toLowerCase();
    const matching = extractedRows.filter(r => {
      const raw = r.raw_data;
      let parsed: Record<string, unknown> | null = null;
      if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); } catch { return false; }
      } else if (raw && typeof raw === 'object') {
        parsed = raw as Record<string, unknown>;
      }
      const p = parsed?.panel;
      return typeof p === 'string' && p.toLowerCase() === panelLower;
    });

    if (matching.length === 0) {
      return res.status(200).json({
        summary: null,
        empty: true,
        message: `No readings found in the ${panel} panel.`,
      });
    }

    const profile = profileRows[0] ?? {};
    const lines: string[] = [];
    lines.push(`Panel: ${panel}.`);
    if (typeof profile.life_stage === 'string') lines.push(`Life stage: ${profile.life_stage}.`);
    if (typeof profile.pregnancy_due_date === 'string') lines.push(`Pregnant, due ${profile.pregnancy_due_date}.`);
    if (typeof profile.ivf_phase === 'string') lines.push(`IVF phase: ${profile.ivf_phase}.`);
    lines.push('', `## ${panel} readings (${matching.length})`);
    for (const r of matching.slice(0, 80)) {
      const val = r.value ?? '';
      const unit = typeof r.unit === 'string' ? ` ${r.unit}` : '';
      const ref = typeof r.reference_range === 'string' && r.reference_range
        ? ` (ref ${r.reference_range})`
        : '';
      const date = typeof r.date_recorded === 'string' ? ` on ${r.date_recorded}` : '';
      const status = typeof r.status === 'string' && r.status ? ` [${r.status}]` : '';
      lines.push(`- ${r.title}: ${val}${unit}${ref}${status}${date}`);
    }

    const userContent = lines.join('\n');
    const cacheKey = `panel_summary_v1:${user.id}:${panelLower}:${await hashRequest(userContent)}`;

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
    ).catch((e: unknown) => console.error('Panel summary cache store error:', e));

    return res.status(200).json({
      summary,
      generatedAt: new Date().toISOString(),
      cached: false,
    });
  } catch (error) {
    console.error('summary/panel error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate panel summary' });
  }
}

export default withSentry(handler);
