// Reproductive signals the ovulation predictor cites as "key indicators".
//
// Matches what the logging UI actually stores in daily_health_signals:
// discharge uses the option values 'watery' and 'ewcm' (egg-white) for
// fertile-type mucus, and BBT / LH results have no columns of their own —
// DailyLogging folds them into `notes` as "BBT: 97.8°F" and
// "LH test: positive". The dedicated fields are still honoured if present.

export interface HealthSignal {
  signal_date: string;
  symptoms?: string[] | null;
  discharge?: string | null;
  basal_temp?: number | null;
  lh_test?: string | null;
  notes?: string | null;
  intercourse?: string | null;
  mood?: string[] | null;
}

const FERTILE_MUCUS = /^(ewcm|watery)$|egg-?white|stretchy|fertile/i;
const BBT_IN_NOTES = /BBT:\s*\d+(?:\.\d+)?/i;
const LH_POSITIVE_IN_NOTES = /LH test:\s*positive/i;

export function extractIndicators(signals: HealthSignal[]): string[] {
  const indicators: string[] = [];
  const notes = (s: HealthSignal) => (typeof s.notes === 'string' ? s.notes : '');

  const anyMucusPattern = signals.some(s =>
    typeof s.discharge === 'string' && FERTILE_MUCUS.test(s.discharge)
  );
  const anyBasalTemp = signals.some(s =>
    (typeof s.basal_temp === 'number' && s.basal_temp > 0) || BBT_IN_NOTES.test(notes(s))
  );
  const anyLh = signals.some(s =>
    (typeof s.lh_test === 'string' && /positive|peak|high/i.test(s.lh_test)) ||
    LH_POSITIVE_IN_NOTES.test(notes(s))
  );
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
