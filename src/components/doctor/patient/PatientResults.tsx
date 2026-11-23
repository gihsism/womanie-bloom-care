import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { flaggedResults } from '@/lib/doctorPatient';
import type { HealthDocument, MedicalDataRow, PeriodRecord } from './types';

// Results tab of the doctor's patient chart: search, flagged values
// (newest reading per test), then everything grouped by panel.

function statusBadgeClass(status: string | null): string {
  const s = (status || '').toLowerCase();
  if (s === 'critical') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
  if (s === 'high' || s === 'low' || s === 'abnormal') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
  if (s === 'borderline') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200';
  if (s === 'normal') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200';
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
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No results yet. They appear once the patient uploads a lab report.
          </p>
        </CardContent>
      </Card>
    );
  }

  const Row = ({ r }: { r: MedicalDataRow }) => {
    const phaseInfo = isCycleHormone(r.title) ? cyclePhaseForDate(r.date_recorded) : null;
    return (
    <div className="flex items-start gap-3 border rounded-lg p-3 bg-card">
      <Badge className={`text-[10px] capitalize shrink-0 ${statusBadgeClass(r.status)}`} variant="outline">
        {r.status || 'unknown'}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{r.title}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs">
          <span className="font-mono">{formatValue(r.value, r.unit)}</span>
          {phaseInfo && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
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
            <span className="text-muted-foreground truncate">· {docNameById.get(r.document_id)}</span>
          )}
        </div>
        {r.notes && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{r.notes}</p>
        )}
      </div>
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
        className="max-w-md"
      />

      <Card>
        <CardHeader>
          <CardTitle>Out of range</CardTitle>
          <CardDescription>
            {flagged.length === 0
              ? 'All latest results are in range.'
              : `Latest reading of each test, most urgent first.`}
          </CardDescription>
        </CardHeader>
        {flagged.length > 0 && (
          <CardContent className="space-y-2">
            {flagged.map(r => <Row key={r.id} r={r} />)}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All results by panel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              return <p className="text-muted-foreground text-center py-8">No results match the filter.</p>;
            }
            return sortedGroups.map(([panel, items]) => (
              <div key={panel}>
                <p className="text-sm font-semibold text-muted-foreground mb-1.5">
                  {panel} · {items.length}
                </p>
                <div className="space-y-2">
                  {items.slice(0, 30).map(r => <Row key={r.id} r={r} />)}
                  {items.length > 30 && (
                    <p className="text-[11px] text-muted-foreground text-center">
                      +{items.length - 30} more in {panel}. Use search to narrow.
                    </p>
                  )}
                </div>
              </div>
            ));
          })()}
        </CardContent>
      </Card>
    </div>
  );
};

export default LabResultsView;
