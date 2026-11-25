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

export type PatientTab = 'summary' | 'results' | 'documents' | 'notes' | 'visits';
export const PATIENT_TABS: readonly PatientTab[] = ['summary', 'results', 'documents', 'notes', 'visits'];

// ?tab= deep links. Old names keep working: overview/health -> summary,
// labs -> results.
export function normalizePatientTab(raw: string | null): PatientTab | null {
  const v = (raw || '').trim().toLowerCase();
  if ((PATIENT_TABS as readonly string[]).includes(v)) return v as PatientTab;
  if (v === 'overview' || v === 'health') return 'summary';
  if (v === 'labs') return 'results';
  if (v === 'appointments') return 'visits';
  return null;
}
