// Reading a baby scale from a photo (POST /api/baby/scale-photo).
// Validation of the request and of the model's answer; the handler is in
// api/_routes/baby/scale-photo.ts. The photo is never stored: only the
// number goes back to the app, and she confirms it before anything is saved.

import { callAnthropicWithRetry, SONNET_MODEL, SONNET_NO_THINKING, replyText, type ClaudeReply } from './anthropic.js';

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

/**
 * The JSON shape the model must return (structured outputs). The model only
 * reads the display - the number and the unit it shows; the conversion to
 * kg is done here (toKg), never by the model.
 */
export const SCALE_UNITS = ['kg', 'g', 'lb', 'lb_oz'] as const;
export type ScaleUnit = typeof SCALE_UNITS[number];

export const SCALE_SCHEMA = {
  type: 'object',
  properties: {
    value: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    unit: { anyOf: [{ type: 'string', enum: [...SCALE_UNITS] }, { type: 'null' }] },
    ounces: { type: 'number' },
    confidence: { type: 'number' },
  },
  required: ['value', 'unit', 'confidence'],
  additionalProperties: false,
} as const;

export const SCALE_PROMPT = [
  'This photo should show the display of a scale with a baby (or a baby on a scale).',
  'Read the weight shown on the display exactly as shown. Do not convert it.',
  'Return value as the number on the display and unit as the unit the display shows:',
  '"kg" for kilograms, "g" for grams, "lb" for pounds shown as one number (10.2 lb),',
  'or "lb_oz" for pounds and ounces (10 lb 3 oz -> value 10, ounces 3).',
  'Include ounces only for "lb_oz".',
  'If the display shows no unit and you cannot tell the unit, return unit null.',
  'Return confidence from 0 to 1: how sure you are that the number is the weight on the display and that you read every digit correctly.',
  'If there is no scale display, the digits are not readable, or the number is not a weight, return value null, unit null and confidence 0.',
  'Do not guess digits you cannot see.',
].join(' ');

export interface ScaleReading {
  weight_kg: number | null;
  confidence: number;
  /** What the display showed, when it was not kg ("10.2 lb", "4620 g", "10 lb 3 oz"). */
  shown?: string;
}

const KG_PER_LB = 0.45359237;
const num = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;

/**
 * The model's display reading -> kg, in our code. Kilograms and grams keep
 * gram precision (4620 g -> 4.62); pounds round to 10 g (10.2 lb -> 4.63),
 * finer than any pound display shows.
 */
export function toKg(value: number, unit: ScaleUnit, ounces = 0): number {
  if (unit === 'kg') return Math.round(value * 1000) / 1000;
  if (unit === 'g') return Math.round(value) / 1000;
  return Math.round((value + (unit === 'lb_oz' ? ounces / 16 : 0)) * KG_PER_LB * 100) / 100;
}

/**
 * The model's text -> a reading the app can use. No unit, a weight outside
 * 0.5-25 kg after conversion, zero confidence, a non-number, or unparsable
 * text comes back as { weight_kg: null, confidence: 0 } ("could not read").
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
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return none;
  const o = obj as Record<string, unknown>;
  const value = num(o.value);
  let unit = (SCALE_UNITS as readonly unknown[]).includes(o.unit) ? (o.unit as ScaleUnit) : null;
  const hasOz = o.ounces !== undefined && o.ounces !== null;
  const ounces = hasOz ? num(o.ounces) : 0;
  if (unit === 'lb' && hasOz && ounces !== 0) unit = 'lb_oz';
  if (!unit || !Number.isFinite(value) || value < 0) return none;
  if (unit === 'lb_oz' && (!Number.isFinite(ounces) || ounces < 0 || ounces >= 16)) return none;
  const w = toKg(value, unit, ounces);
  if (!Number.isFinite(w) || w < MIN_KG || w > MAX_KG) return none;
  const c = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? Math.min(1, Math.max(0, o.confidence)) : 0;
  if (c === 0) return none;
  const reading: ScaleReading = { weight_kg: w, confidence: Math.round(c * 100) / 100 };
  if (unit === 'g') reading.shown = `${value} g`;
  else if (unit === 'lb') reading.shown = `${value} lb`;
  else if (unit === 'lb_oz') reading.shown = `${value} lb ${ounces} oz`;
  return reading;
}

/**
 * Send the photo to Claude and turn the answer into a reading (the model
 * call behind POST /api/baby/scale-photo). Throws when the API call fails.
 */
export async function readScalePhoto(apiKey: string, image: string, mediaType: ScaleMediaType): Promise<ScaleReading> {
  const resp = await callAnthropicWithRetry(apiKey, {
    model: SONNET_MODEL,
    max_tokens: 300,
    thinking: SONNET_NO_THINKING,
    output_config: { format: { type: 'json_schema', schema: SCALE_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: SCALE_PROMPT },
      ],
    }],
  });
  const data = (await resp.json()) as ClaudeReply & { stop_reason?: string };
  if (data.stop_reason === 'refusal') return { weight_kg: null, confidence: 0 };
  return parseScaleReply(replyText(data));
}
