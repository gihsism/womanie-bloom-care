import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { flaggedResults, isFlagged } from '@/lib/doctorPatient';
import type { HealthDocument, MedicalDataRow, PeriodRecord } from './types';

// Results tab of the doctor's patient chart: search, flagged values
// (newest reading per test), then everything grouped by panel.
// Idea 4: rows in hairline groups; out of range in the app's one warning
// colour (never the stage colour), in range quiet.

function statusBadgeClass(status: string | null): string {
  const s = (status || '').toLowerCase();
  if (s === 'critical') return 'bg-destructive text-destructive-foreground';
  if (s === 'high' || s === 'low' || s === 'abnormal') return 'bg-destructive/10 text-destructive';
  if (s === 'borderline') return 'bg-muted text-foreground';
  if (s === 'normal') return 'bg-stage-tint text-stage-accent';
  return 'bg-muted text-muted-foreground';
}

function formatValue(v: string | number | null, unit: string | null): string {
  if (v === null || v === undefined || v === '') return '—';
  const base = typeof v === 'number' ? String(v) : v;
  return unit ? `${base} ${unit}` : base;
}

const LabResultsView = ({
  medicalData,
  documents,
  periodRecords,
}: {
  medicalData: MedicalDataRow[];
  documents: HealthDocument[];
  periodRecords: PeriodRecord[];
}) => {
  const [query, setQuery] = useState('');
  const docNameById = new Map(documents.map(d => [d.id, d.ai_suggested_name || d.file_name]));

  // Same phase-mapping the patient sees on PanelDetail (commit 1d8cd86).
  // Doctor scanning a follicular-phase FSH 4 now sees "day 5 ·
  // follicular" alongside the value instead of having to mentally
  // overlay the patient's cycle on the lab dates.
  const cyclePhaseForDate = (dateRecorded: string | null): { cycleDay: number; phase: 'follicular' | 'midcycle' | 'luteal' } | null => {
    if (!dateRecorded || periodRecords.length === 0) return null;
    const draw = new Date(dateRecorded);
    if (Number.isNaN(draw.getTime())) return null;
    let cycleStart: Date | null = null;
    let cycleLen = 28;
    for (let i = periodRecords.length - 1; i >= 0; i--) {
      const ps = new Date(periodRecords[i].period_start_date);
      if (Number.isNaN(ps.getTime())) continue;
      if (ps.getTime() <= draw.getTime()) {
        cycleStart = ps;
        cycleLen = periodRecords[i].cycle_length || 28;
        if (i + 1 < periodRecords.length) {
          const next = new Date(periodRecords[i + 1].period_start_date);
          if (!Number.isNaN(next.getTime()) && next.getTime() <= draw.getTime()) continue;
        }
        break;
      }
    }
    if (!cycleStart) return null;
    const days = Math.floor((draw.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24));
    const cycleDay = days + 1;
    if (cycleDay < 1 || cycleDay > cycleLen + 7) return null;
    const ovulation = cycleLen - 14;
    let phase: 'follicular' | 'midcycle' | 'luteal';
    if (Math.abs(cycleDay - ovulation) <= 2) phase = 'midcycle';
    else if (cycleDay < ovulation) phase = 'follicular';
    else phase = 'luteal';
    return { cycleDay, phase };
  };

  // Identify cycle-hormone rows by title to keep the chip out of CBC,
  // lipids, etc. Same regex as hormone-reference.ts but inlined to
  // avoid pulling that module into the doctor page.
  const isCycleHormone = (title: string): boolean => /^fsh$|^lh$|^estradiol$|^e2$|^progesterone$/i.test(title.trim());

  const filtered = medicalData.filter(r => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (r.title || '').toLowerCase().includes(q) || (r.notes || '').toLowerCase().includes(q);
  });

  // Latest reading of each test only, same list as the Summary tab.
  // Older readings stay visible in the panel groups below.
  const flagged = flaggedResults(filtered);

  const allRecent = [...filtered].sort((a, b) => {
    const ad = a.date_recorded ? new Date(a.date_recorded).getTime() : 0;
    const bd = b.date_recorded ? new Date(b.date_recorded).getTime() : 0;
    return bd - ad;
  });

  if (medicalData.length === 0) {
    return (
      <p className="row-group px-4 py-6 text-center text-[15px] text-muted-foreground">
        No results yet. They appear once the patient uploads a lab report.
      </p>
    );
  }

  const Row = ({ r }: { r: MedicalDataRow }) => {
    const phaseInfo = isCycleHormone(r.title) ? cyclePhaseForDate(r.date_recorded) : null;
    return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-[17px] font-medium truncate">{r.title}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[14px]">
          <span className={`font-semibold tabular-nums ${isFlagged(r.status) ? 'text-destructive' : ''}`}>
            {formatValue(r.value, r.unit)}
          </span>
          {phaseInfo && (
            <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-stage-tint text-stage-accent">
              day {phaseInfo.cycleDay} · {phaseInfo.phase}
            </span>
          )}
          {r.reference_range && (
            <span className="text-muted-foreground">ref {r.reference_range}</span>
          )}
          {r.date_recorded && (
            <span className="text-muted-foreground">{new Date(r.date_recorded).toLocaleDateString()}</span>
          )}
          {docNameById.has(r.document_id) && (
            <span className="text-muted-foreground truncate">{docNameById.get(r.document_id)}</span>
          )}
        </div>
        {r.notes && (
          <p className="text-[13px] text-muted-foreground mt-1 line-clamp-2">{r.notes}</p>
        )}
      </div>
      <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize ${statusBadgeClass(r.status)}`}>
        {r.status || 'unknown'}
      </span>
    </div>
    );
  };

  return (
    <div className="space-y-6">
      <Input
        placeholder="Search tests"
        aria-label="Search tests"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="h-12 rounded-full px-4 text-[16px] max-w-md"
      />

      <section aria-labelledby="results-flagged-heading" className="space-y-2">
        <div>
          <h2 id="results-flagged-heading" className="section-title">Out of range</h2>
          <p className="page-sub mt-0.5">
            {flagged.length === 0
              ? 'All latest results are in range.'
              : `Latest reading of each test, most urgent first.`}
          </p>
        </div>
        {flagged.length > 0 && (
          <div className="row-group">
            {flagged.map(r => <Row key={r.id} r={r} />)}
          </div>
        )}
      </section>

      <section aria-labelledby="results-all-heading" className="space-y-4">
        <h2 id="results-all-heading" className="section-title">All results by panel</h2>
          {(() => {
            const groups = new Map<string, MedicalDataRow[]>();
            for (const r of allRecent) {
              const panel = r.raw_data?.panel?.trim() || 'Other';
              const arr = groups.get(panel) ?? [];
              arr.push(r);
              groups.set(panel, arr);
            }
            const sortedGroups = [...groups.entries()].sort((a, b) => {
              if (a[0] === 'Other') return 1;
              if (b[0] === 'Other') return -1;
              return b[1].length - a[1].length;
            });
            if (sortedGroups.length === 0) {
              return <p className="row-group px-4 py-6 text-center text-[15px] text-muted-foreground">No results match the filter.</p>;
            }
            return sortedGroups.map(([panel, items]) => (
              <div key={panel}>
                <p className="text-[15px] font-semibold text-muted-foreground mb-2 ml-1">
                  {panel} · {items.length}
                </p>
                <div className="row-group">
                  {items.slice(0, 30).map(r => <Row key={r.id} r={r} />)}
                  {items.length > 30 && (
                    <p className="px-4 py-3 text-[13px] text-muted-foreground text-center">
                      +{items.length - 30} more in {panel}. Use search to narrow.
                    </p>
                  )}
                </div>
              </div>
            ));
          })()}
      </section>
    </div>
  );
};

export default LabResultsView;
