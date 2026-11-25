// Pure helpers for the doctor's patient chart (PatientDetails).
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { LIFE_STAGES, LIFE_STAGE_ALIASES } from './lifeStage';

/**
 * The patient's stage as a colour-set key (for the stage chip on her chart),
 * aliases included. Unknown or empty values give null: no chip, rather than
 * a made-up stage colour.
 */
export function patientStageKey(raw: string | null | undefined): LifeStage | null {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if ((LIFE_STAGES as readonly string[]).includes(v)) return v as LifeStage;
  return LIFE_STAGE_ALIASES[v] ?? null;
}

export interface LabRow {
  id: string;
  title: string;
  status: string | null;
  date_recorded: string | null;
}

export interface VisitRow {
  id: string;
  scheduled_at: string;
  status: string | null;
}

// Severity rank: lower = more urgent. "abnormal", "high" and "low" share a
// tier because extraction does not always normalise to one word.
export function statusRank(status: string | null): number {
  const s = (status || '').toLowerCase();
  if (s === 'critical') return 0;
  if (s === 'high' || s === 'low' || s === 'abnormal') return 1;
  if (s === 'borderline' || s === 'informational') return 2;
  return 3;
}

export function isFlagged(status: string | null): boolean {
  return statusRank(status) <= 1;
}

const dateOf = (d: string | null) => (d ? Date.parse(d) || 0 : 0);

// Flagged results, most urgent first, newest first within a tier. Only
// the newest reading per test title counts, so a high TSH that was
// re-tested normal does not keep shouting from the summary.
export function flaggedResults<T extends LabRow>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const r of rows) {
    const key = (r.title || '').trim().toLowerCase();
    const prev = latest.get(key);
    if (!prev || dateOf(r.date_recorded) > dateOf(prev.date_recorded)) latest.set(key, r);
  }
  return [...latest.values()]
    .filter(r => isFlagged(r.status))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || dateOf(b.date_recorded) - dateOf(a.date_recorded));
}

// Pregnancy week from the due date (40 weeks = 280 days), clamped 0-42.
export function pregnancyWeek(dueDate: string | null, now: number): { week: number; daysToDue: number } | null {
  if (!dueDate) return null;
  const due = Date.parse(dueDate);
  if (!Number.isFinite(due)) return null;
  const daysToDue = Math.round((due - now) / 86_400_000);
  const week = Math.max(0, Math.min(42, Math.floor((280 - daysToDue) / 7)));
  return { week, daysToDue };
}

// Last visit that happened (not cancelled / no-show) and the next booked one.
export function visitSummary<T extends VisitRow>(visits: T[], now: number): { last: T | null; next: T | null } {
  let last: T | null = null;
  let next: T | null = null;
  for (const v of visits) {
    const s = (v.status || '').toLowerCase();
    if (s === 'cancelled') continue;
    const t = Date.parse(v.scheduled_at);
    if (!Number.isFinite(t)) continue;
    if (t <= now) {
      if (s === 'no_show') continue;
      if (!last || t > Date.parse(last.scheduled_at)) last = v;
    } else if (!next || t < Date.parse(next.scheduled_at)) {
      next = v;
    }
  }
  return { last, next };
}

export type PatientTab = 'summary' | 'trends' | 'results' | 'documents' | 'notes' | 'visits';
export const PATIENT_TABS: readonly PatientTab[] = ['summary', 'trends', 'results', 'documents', 'notes', 'visits'];

// ?tab= deep links. Old names keep working: overview/health -> summary,
// labs -> results.
export function normalizePatientTab(raw: string | null): PatientTab | null {
  const v = (raw || '').trim().toLowerCase();
  if ((PATIENT_TABS as readonly string[]).includes(v)) return v as PatientTab;
  if (v === 'overview' || v === 'health') return 'summary';
  if (v === 'labs') return 'results';
  if (v === 'appointments') return 'visits';
  if (v === 'charts' || v === 'trend') return 'trends';
  return null;
}

// ---- "Before the visit" brief (top of the Summary tab) ----

// Stages where a cycle day means something to a gynaecologist.
const CYCLE_STAGES = new Set(['menstrual-cycle', 'contraception', 'conception', 'ivf', 'pre-menstrual']);

/**
 * Day of her current cycle (day 1 = first day of the latest logged period),
 * or null when the stage has no cycle, nothing is logged, or the latest
 * period is more than 60 days old (then "cycle day 74" would mislead).
 */
export function cycleDay(
  periods: Array<{ period_start_date: string }>,
  lifeStage: string | null,
  now: number,
): number | null {
  if (lifeStage && !CYCLE_STAGES.has(lifeStage)) return null;
  let latest = -Infinity;
  for (const p of periods) {
    const t = Date.parse(p.period_start_date);
    if (Number.isFinite(t) && t <= now && t > latest) latest = t;
  }
  if (!Number.isFinite(latest)) return null;
  const day = Math.floor((now - latest) / 86_400_000) + 1;
  return day >= 1 && day <= 60 ? day : null;
}

// Moods the patient can log that a clinician would want to notice.
export const LOW_MOODS: Readonly<Record<string, string>> = { sad: 'Sad', anxious: 'Anxious', irritable: 'Irritable' };
/** Days with a low mood (in the last 30) at which the brief marks the row. */
export const LOW_MOOD_ATTENTION_DAYS = 5;

export interface MoodSummary {
  /** Days she logged any mood. */
  loggedDays: number;
  /** Days with at least one low mood. */
  lowDays: number;
  /** Low moods by count, most frequent first. */
  low: Array<{ key: string; label: string; days: number }>;
  needsAttention: boolean;
}

export function moodSummary(signals: Array<{ mood: string[] | null }>): MoodSummary {
  let loggedDays = 0;
  let lowDays = 0;
  const counts: Record<string, number> = {};
  for (const s of signals) {
    const moods = Array.isArray(s.mood) ? [...new Set(s.mood)] : [];
    if (moods.length === 0) continue;
    loggedDays++;
    const lows = moods.filter(m => m in LOW_MOODS);
    if (lows.length) lowDays++;
    for (const m of lows) counts[m] = (counts[m] ?? 0) + 1;
  }
  const low = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, days]) => ({ key, label: LOW_MOODS[key], days }));
  return { loggedDays, lowDays, low, needsAttention: lowDays >= LOW_MOOD_ATTENTION_DAYS };
}

export interface MedicineRow {
  name: string;
  dose: string | null;
  times_per_day: number | null;
}

/** "Iron 50 mg, 2× a day" - name, then dose and frequency when known. */
export function medicineLine(m: MedicineRow): string {
  const parts = [m.name.trim(), m.dose?.trim() || null].filter(Boolean).join(' ');
  const freq = m.times_per_day && m.times_per_day > 0 ? `${m.times_per_day}× a day` : null;
  return freq ? `${parts}, ${freq}` : parts;
}
