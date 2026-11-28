import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { checkAndConsume } from '../../_lib/ratelimit.js';
import { withSentry } from '../../_lib/sentry.js';
import { parseScaleRequest, readScalePhoto } from '../../_lib/scale-photo.js';

// POST /api/baby/scale-photo - read the weight on a photo of a baby scale.
//
// Body: { image: base64 (no data: prefix needed), mediaType: image/jpeg|png|webp }
// Reply: 200 { weight_kg: number | null, confidence: 0-1 }. weight_kg null
// means "could not read it" (the app asks her to type it in).
//
// Same Claude setup as document analysis (api/_lib/anthropic.ts: model,
// retries, thinking off). The photo is sent to Claude and not stored
// anywhere; nothing is written to the database here: the app pre-fills
// the number and saves only after she taps Save.

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = parseScaleRequest(req.body);
  if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });

  const rate = await checkAndConsume('baby-scale-photo', user.id, 30);
  if (!rate.ok) return res.status(429).json({ error: 'You have read many photos today. Type the weight in instead, or try again tomorrow.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('baby/scale-photo: ANTHROPIC_API_KEY not configured');
    return res.status(503).json({ error: 'Reading photos is not available right now. Type the weight in instead.' });
  }

  try {
    return res.status(200).json(await readScalePhoto(apiKey, parsed.image, parsed.mediaType));
  } catch (err) {
    console.error('baby/scale-photo failed:', (err as Error)?.message);
    return res.status(502).json({ error: 'The photo could not be read right now. Type the weight in instead.' });
  }
}

export default withSentry(handler);
