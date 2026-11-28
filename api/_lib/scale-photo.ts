// Reading a baby scale from a photo (POST /api/baby/scale-photo).
// Validation of the request and of the model's answer; the handler is in
// api/_routes/baby/scale-photo.ts. The photo is never stored: only the
// number goes back to the app, and she confirms it before anything is saved.

export const SCALE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ScaleMediaType = typeof SCALE_MEDIA_TYPES[number];

// The app shrinks the photo to <= 1600 px JPEG first (~150-600 KB);
// 4 MB of base64 (~3 MB image) keeps the request under Vercel's 4.5 MB body cap.
export const MAX_IMAGE_BASE64 = 4_000_000;

export const MIN_KG = 0.5;
export const MAX_KG = 25;

export function parseScaleRequest(body: unknown):
  | { ok: true; image: string; mediaType: ScaleMediaType }
  | { ok: false; status: number; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const image = typeof b.image === 'string' ? b.image.replace(/^data:[^,]*,/, '') : '';
  const mediaType = b.mediaType;
  if (!image) return { ok: false, status: 400, error: 'No photo was sent.' };
  if (typeof mediaType !== 'string' || !(SCALE_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    return { ok: false, status: 400, error: 'This photo type cannot be read. Try a JPEG or PNG.' };
  }
  if (image.length > MAX_IMAGE_BASE64) return { ok: false, status: 413, error: 'The photo is too large.' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return { ok: false, status: 400, error: 'The photo could not be read.' };
  return { ok: true, image, mediaType: mediaType as ScaleMediaType };
}

/** The JSON shape the model must return (structured outputs). */
export const SCALE_SCHEMA = {
  type: 'object',
  properties: {
    weight_kg: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    confidence: { type: 'number' },
  },
  required: ['weight_kg', 'confidence'],
  additionalProperties: false,
} as const;

export const SCALE_PROMPT = [
  'This photo should show the display of a scale with a baby (or a baby on a scale).',
  'Read the weight shown on the display.',
  'Return weight_kg as the weight in kilograms: convert grams (4620 g -> 4.62), pounds and ounces (10 lb 3 oz -> 4.621) if the display uses them.',
  'Return confidence from 0 to 1: how sure you are that the number is the weight on the display and that you read every digit correctly.',
  'If there is no scale display, the digits are not readable, or the number is not a weight, return weight_kg null and confidence 0.',
  'Do not guess digits you cannot see.',
].join(' ');

export interface ScaleReading { weight_kg: number | null; confidence: number }

/**
 * The model's text -> a reading the app can use. A weight outside
 * 0.5-25 kg, a non-number, or unparsable text comes back as
 * { weight_kg: null, confidence: 0 } ("could not read").
 */
export function parseScaleReply(text: string | undefined | null): ScaleReading {
  const none: ScaleReading = { weight_kg: null, confidence: 0 };
  if (!text) return none;
  let obj: unknown;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { obj = JSON.parse(cleaned); } catch {
    const s = cleaned.indexOf('{'); const e = cleaned.lastIndexOf('}');
    if (s < 0 || e <= s) return none;
    try { obj = JSON.parse(cleaned.slice(s, e + 1)); } catch { return none; }
  }
  if (!obj || typeof obj !== 'object') return none;
  const o = obj as Record<string, unknown>;
  const w = typeof o.weight_kg === 'number' ? o.weight_kg : typeof o.weight_kg === 'string' ? Number(o.weight_kg.replace(',', '.')) : NaN;
  if (!Number.isFinite(w) || w < MIN_KG || w > MAX_KG) return none;
  const c = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? Math.min(1, Math.max(0, o.confidence)) : 0;
  if (c === 0) return none;
  return { weight_kg: Math.round(w * 1000) / 1000, confidence: Math.round(c * 100) / 100 };
}
