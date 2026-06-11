import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Stethoscope } from 'lucide-react';
import { format } from 'date-fns';

// Patient-facing chart access history (Settings). Every time a doctor
// opens this patient's chart, /api/doctors/patient writes an audit row;
// this card lets the patient review those accesses. Transparency
// feature approved by Alena 2026-06-11.

interface AccessRow {
  id: number;
  viewed_at: string;
  surface: string;
  doctor_name: string | null;
  doctor_specialty: string | null;
  doctor_avatar_url: string | null;
}

const INITIAL_VISIBLE = 5;

export default function ChartAccessLog() {
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/me/chart-access');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const payload = await resp.json();
        if (!cancelled) setRows((payload.accesses ?? []) as AccessRow[]);
      } catch (e) {
        console.error('Failed to load chart access log:', e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = showAll ? rows : rows.slice(0, INITIAL_VISIBLE);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Chart Access History
        </CardTitle>
        <CardDescription>
          Every time a connected doctor opens your health record, it's logged here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No doctor has viewed your chart yet.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {visible.map((row) => (
                <li key={row.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/20">
                  {row.doctor_avatar_url ? (
                    <img src={row.doctor_avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Stethoscope className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {row.doctor_name || 'A connected doctor'}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {row.doctor_specialty ? `${row.doctor_specialty} · ` : ''}
                      viewed your record
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {format(new Date(row.viewed_at), 'MMM d, p')}
                  </span>
                </li>
              ))}
            </ul>
            {rows.length > INITIAL_VISIBLE && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 h-7 text-xs"
                onClick={() => setShowAll(v => !v)}
              >
                {showAll ? 'Show fewer' : `Show all ${rows.length}`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
