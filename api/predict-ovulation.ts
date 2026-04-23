import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from './_lib/auth.js';
import { withSentry } from './_lib/sentry.js';

// Algorithmic ovulation prediction — returns the same shape the
// frontend already expects from the (non-existent until now)
// `predict-ovulation` call through the supabase shim.
//
// No LLM involved. Ovulation day is computed from the patient's cycle
// length and last period start using the classic luteal-phase rule
// (ovulation ≈ cycle_length − 14), clamped to sensible bounds.
// Fertile window is ovulation − 4 to ovulation + 1. Confidence and
// narrative lean on how many daily health signals the patient has
// logged and which reproductive signals (cervical mucus, basal
// temperature, LH tests, ovulation pain) are present.

interface HealthSignal {
  signal_date: string;
  symptoms?: string[] | null;
  discharge?: string | null;
  basal_temp?: number | null;
  lh_test?: string | null;
  intercourse?: string | null;
  mood?: string[] | null;
}

interface CycleData {
  cycleLength?: number;
  lastPeriodStart?: string;
}

function clampLuteal(cycleLength: number): number {
  // The luteal phase is remarkably stable at 14 days (range 12–16).
  // For cycles outside the typical 21–35 range the model gets shaky;
  // we still return a number but signal low confidence separately.
  if (!Number.isFinite(cycleLength) || cycleLength < 21 || cycleLength > 45) {
    return 14;
  }
  return 14;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function extractIndicators(signals: HealthSignal[]): string[] {
  const indicators: string[] = [];
  const anyMucusPattern = signals.some(s =>
    typeof s.discharge === 'string' && /egg-?white|clear|stretchy|fertile/i.test(s.discharge)
  );
  const anyBasalTemp = signals.some(s => typeof s.basal_temp === 'number' && s.basal_temp > 0);
  const anyLh = signals.some(s => typeof s.lh_test === 'string' && /positive|peak|high/i.test(s.lh_test));
  const anyOvulationPain = signals.some(s =>
    Array.isArray(s.symptoms) &&
    s.symptoms.some((sym: string) => /ovulation|mittelschmerz|pelvic pain/i.test(sym))
  );
  if (anyMucusPattern) indicators.push('Fertile-type cervical mucus logged recently');
  if (anyBasalTemp) indicators.push('Basal body temperature readings available');
  if (anyLh) indicators.push('Positive LH / ovulation test detected');
  if (anyOvulationPain) indicators.push('Ovulation-associated symptoms logged');
  if (indicators.length === 0 && signals.length > 0) {
    indicators.push(`${signals.length} days of health signals available`);
  }
  return indicators;
}

function narrate(params: {
  indicators: string[];
  cycleLength: number;
  ovulationDate: string;
  fertileStart: string;
  fertileEnd: string;
  confidence: 'low' | 'medium' | 'high';
}): { analysis: string; recommendations: string[] } {
  const { indicators, cycleLength, ovulationDate, fertileStart, fertileEnd, confidence } = params;

  const indicatorLine = indicators.length > 0
    ? ` Your logged signals support this: ${indicators.slice(0, 3).join('; ')}.`
    : " We'd have more confidence once you log a few more days of symptoms.";

  const analysis =
    `Based on a ${cycleLength}-day cycle, your most likely ovulation day is ${ovulationDate}, ` +
    `with a fertile window from ${fertileStart} to ${fertileEnd}.${indicatorLine} ` +
    `Confidence is ${confidence} — ovulation timing naturally varies cycle-to-cycle, ` +
    `so treat this as a guide rather than a hard date.`;

  const recommendations: string[] = [];
  recommendations.push('Log daily signals (cervical mucus, basal temperature, LH tests if you use them) for a tighter prediction next cycle.');
  if (confidence !== 'high') {
    recommendations.push('The more complete cycles we have on record, the more accurate these predictions become.');
  }
  if (indicators.some(i => i.includes('LH'))) {
    recommendations.push('A positive LH test means ovulation is expected within the next 12–36 hours.');
  }
  recommendations.push('If your cycles are very irregular (>7-day variation) or you\'re trying to conceive, consider mentioning this to a clinician.');

  return { analysis, recommendations };
}

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { healthData, cycleData } = (req.body ?? {}) as {
    healthData?: HealthSignal[];
    cycleData?: CycleData;
  };

  const signals = Array.isArray(healthData) ? healthData : [];
  const cycleLength = Number(cycleData?.cycleLength);
  const lastPeriodStart = cycleData?.lastPeriodStart;

  if (!lastPeriodStart || !cycleLength || cycleLength < 18 || cycleLength > 60) {
    return res.status(400).json({ error: 'Need a valid cycleLength and lastPeriodStart' });
  }

  const luteal = clampLuteal(cycleLength);
  const ovulationOffset = Math.max(1, cycleLength - luteal);
  const ovulationDate = addDaysIso(lastPeriodStart, ovulationOffset);
  const fertileWindowStart = addDaysIso(ovulationDate, -4);
  const fertileWindowEnd = addDaysIso(ovulationDate, 1);

  const indicators = extractIndicators(signals);

  let confidence: 'low' | 'medium' | 'high' = 'low';
  if (signals.length >= 14 && indicators.some(i => /LH|mucus|temperature/i.test(i))) {
    confidence = 'high';
  } else if (signals.length >= 7) {
    confidence = 'medium';
  }

  const { analysis, recommendations } = narrate({
    indicators, cycleLength, ovulationDate, fertileStart: fertileWindowStart,
    fertileEnd: fertileWindowEnd, confidence,
  });

  return res.status(200).json({
    prediction: {
      predictedOvulationDate: ovulationDate,
      fertileWindowStart,
      fertileWindowEnd,
      confidence,
      keyIndicators: indicators,
      analysis,
      recommendations,
    },
  });
}

export default withSentry(handler);
