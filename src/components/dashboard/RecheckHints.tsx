import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { History } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { recheckHints, type RecheckRow } from '@/lib/labRecheck';

// Records: "last checked X months ago" for ferritin, haemoglobin, TSH and
// vitamin D when the last result was outside the range or borderline, TSH
// in pregnancy, and haemoglobin after week 28 (FIGO 2025, cited). Facts
// plus "ask your doctor" only (lib/labRecheck.ts). Hidden when there is
// nothing to say. Same card pattern as OverdueTests next to it.

export default function RecheckHints({ stage, dueDate }: { stage?: string | null; dueDate?: Date | null }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<RecheckRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('current_extracted_data')
      .select('title, value, status, date_recorded, data_type')
      .eq('user_id', user.id)
      .eq('data_type', 'lab_result');
    setRows((data ?? []) as RecheckRow[]);
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const hints = useMemo(() => recheckHints(rows, { stage, dueDate }), [rows, stage, dueDate]);
  if (hints.length === 0) return null;

  return (
    <Card className="p-4 mb-4" data-testid="recheck-hints">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center">
          <History className="h-4 w-4 text-secondary" />
        </div>
        <div>
          <p className="font-display text-base font-medium">When these were last checked</p>
          <p className="text-[11px] text-muted-foreground">From your uploaded results. Not a reminder schedule.</p>
        </div>
      </div>
      <ul className="space-y-1.5">
        {hints.map(h => (
          <li key={h.key} className="p-2 text-[13px] leading-snug">
            {h.text}
            {h.source && (
              <a
                className="ml-1 text-[11px] text-primary hover:underline"
                href={`https://pubmed.ncbi.nlm.nih.gov/${h.source.pmid}/`}
                target="_blank"
                rel="noreferrer"
              >
                Source: {h.source.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
