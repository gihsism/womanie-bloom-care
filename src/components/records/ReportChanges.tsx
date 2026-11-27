import { useMemo } from 'react';
import { History } from 'lucide-react';
import { changesSinceLastReport, type ReportChange } from '@/lib/reportChanges';
import { getFriendlyName } from '@/lib/medical-utils';
import type { ExtractedItem } from '@/lib/health-trends';

// On an analysed lab report in Records: what changed since her previous
// report (newly outside the range, back in range, steady rises or falls).
// Figures and dates only. Self-hides when nothing on the report has an
// earlier reading to compare with.

const Group = ({ label, items }: { label: string; items: ReportChange[] }) =>
  items.length === 0 ? null : (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <ul className="space-y-1">
        {items.map(c => (
          <li key={c.title} className="text-sm">
            <span className="font-medium">{c.title}</span> <span className="font-mono text-xs">{c.value}</span>
            <span className="block text-[12px] text-muted-foreground">{c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );

export default function ReportChanges({ documentId, rows }: { documentId: string; rows: ExtractedItem[] }) {
  const c = useMemo(() => changesSinceLastReport(documentId, rows, getFriendlyName), [documentId, rows]);
  if (!c) return null;
  const noted = c.newlyOut.length + c.backInRange.length + c.steady.length;
  return (
    <div className="bg-background rounded-xl p-4 border border-border/40 mb-3" data-testid="report-changes">
      <div className="flex items-center gap-2 mb-2">
        <History className="h-4 w-4 text-primary" aria-hidden="true" />
        <p className="label-mono">What changed since your last report</p>
      </div>
      {noted === 0 ? (
        <p className="text-sm text-muted-foreground">
          {c.compared} test{c.compared === 1 ? '' : 's'} compared with your earlier reports: none moved outside or back into the range, and none has gone the same way 3 tests running.
        </p>
      ) : (
        <div className="space-y-3">
          <Group label="Newly outside the range" items={c.newlyOut} />
          <Group label="Back in range" items={c.backInRange} />
          <Group label="Same direction 3+ tests running" items={c.steady} />
          <p className="text-[11px] text-muted-foreground">
            {c.compared} test{c.compared === 1 ? '' : 's'} on this report also appear on an earlier one.
          </p>
        </div>
      )}
    </div>
  );
}
