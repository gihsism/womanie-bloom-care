import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { differenceInDays, differenceInMonths, format, parseISO, subDays } from 'date-fns';
import { getFriendlyName } from '@/lib/medical-utils';

// Bring-to-the-doctor printout — everything Womanie has on the patient
// in one paper-friendly, A4-shaped layout.
//
// Sibling of PrintDoc (single document). This one is for prep before
// an appointment: front page summary (counts + flagged findings),
// then every analyzed document grouped by panel, then a footer with
// disclaimer + the patient's contact email so a doctor receiving the
// printout can correlate.
//
// Same printability decisions as PrintDoc: white background, black
// text, no toner-burning fills, status colours kept high contrast.

interface Profile {
  full_name: string | null;
  life_stage: string | null;
  pregnancy_due_date: string | null;
  ivf_phase: string | null;
}

interface Doc {
  id: string;
  file_name: string;
  ai_suggested_name: string | null;
  ai_suggested_category: string | null;
  ai_summary: string | null;
  uploaded_at: string | null;
}

interface Item {
  id: string;
  document_id: string | null;
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  data_type: string | null;
  date_recorded: string | null;
  notes: string | null;
  raw_data: Record<string, unknown> | string | null;
}

interface DoctorNote {
  id: string;
  title: string;
  content: string;
  note_type: string | null;
  created_at: string;
  doctor_name: string | null;
  doctor_title: string | null;
  doctor_specialties: string[] | null;
}

interface PeriodRow {
  period_start_date: string;
  period_end_date: string | null;
  cycle_length: number | null;
}

interface SignalRow {
  signal_date: string;
  symptoms: string[] | null;
  mood: string[] | null;
  notes: string | null;
}

const SYMPTOM_LABEL: Record<string, string> = {
  cramps: 'Cramps',
  headache: 'Headache',
  bloating: 'Bloating',
  tender_breasts: 'Tender breasts',
  back_pain: 'Back pain',
  nausea: 'Nausea',
  fatigue: 'Fatigue',
  acne: 'Acne',
  hot_flashes: 'Hot flashes',
  night_sweats: 'Night sweats',
  insomnia: 'Insomnia',
};

const STATUS_LABEL: Record<string, string> = {
  critical: 'Critical',
  abnormal: 'Abnormal',
  normal: 'Normal',
  expected: 'Expected for life stage',
  informational: 'Informational',
};

function panelOf(item: Item): string {
  const raw = item.raw_data;
  if (!raw) return 'Other';
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return 'Other'; }
  } else if (typeof raw === 'object') {
    parsed = raw as Record<string, unknown>;
  }
  return parsed && typeof parsed.panel === 'string' ? parsed.panel : 'Other';
}

export default function PrintHealthRecord() {
  usePageTitle('Health record · print');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [doctorNotes, setDoctorNotes] = useState<DoctorNote[]>([]);
  const [periodRows, setPeriodRows] = useState<PeriodRow[]>([]);
  const [signalRows, setSignalRows] = useState<SignalRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [profileRes, docsRes, itemsRes, notesResp, periodRes, signalRes] = await Promise.all([
      db.from('profiles')
        .select('full_name, life_stage, pregnancy_due_date, ivf_phase')
        .eq('id', user.id)
        .maybeSingle(),
      db.from('health_documents')
        .select('id, file_name, ai_suggested_name, ai_suggested_category, ai_summary, uploaded_at')
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false }),
      db.from('current_extracted_data')
        .select('id, document_id, title, value, unit, reference_range, status, data_type, date_recorded, notes, raw_data')
        .eq('user_id', user.id),
      fetch('/api/me/doctor-notes').then(r => (r.ok ? r.json() : { notes: [] })),
      db.from('period_tracking')
        .select('period_start_date, period_end_date, cycle_length')
        .eq('user_id', user.id)
        .order('period_start_date', { ascending: false }),
      db.from('daily_health_signals')
        .select('signal_date, symptoms, mood, notes')
        .eq('user_id', user.id)
        .gte('signal_date', format(subDays(new Date(), 90), 'yyyy-MM-dd')),
    ]);
    setProfile((profileRes.data ?? null) as Profile | null);
    setDocs((docsRes.data ?? []) as Doc[]);
    setItems((itemsRes.data ?? []) as Item[]);
    setDoctorNotes((notesResp?.notes ?? []) as DoctorNote[]);
    setPeriodRows((periodRes.data ?? []) as PeriodRow[]);
    setSignalRows((signalRes.data ?? []) as SignalRow[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Cycle context: derive cycle-length stats from consecutive period
  // starts (the stored cycle_length can be stale). Take the most
  // recent 6 cycles.
  const cycleStats = useMemo(() => {
    if (periodRows.length === 0) return null;
    const sorted = [...periodRows].sort(
      (a, b) => Date.parse(b.period_start_date) - Date.parse(a.period_start_date)
    );
    const recent = sorted.slice(0, 7); // 7 starts → 6 cycle gaps
    const gaps: number[] = [];
    for (let i = 0; i < recent.length - 1; i++) {
      const g = differenceInDays(parseISO(recent[i].period_start_date), parseISO(recent[i + 1].period_start_date));
      if (g >= 18 && g <= 90) gaps.push(g);
    }
    const lastPeriod = sorted[0];
    const lastPeriodDate = parseISO(lastPeriod.period_start_date);
    const monthsSinceLast = differenceInMonths(new Date(), lastPeriodDate);
    const daysSinceLast = differenceInDays(new Date(), lastPeriodDate);
    if (gaps.length === 0) {
      return {
        recent: sorted.slice(0, 6),
        mean: null,
        sd: null,
        lastPeriodDate,
        monthsSinceLast,
        daysSinceLast,
      };
    }
    const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
    const sd = Math.sqrt(gaps.map(v => (v - mean) ** 2).reduce((s, v) => s + v, 0) / gaps.length);
    return {
      recent: sorted.slice(0, 6),
      mean,
      sd,
      lastPeriodDate,
      monthsSinceLast,
      daysSinceLast,
    };
  }, [periodRows]);

  // Symptom counts across the last 90 days of signals — gives the
  // clinician a sense of what the patient is actually noticing.
  const symptomSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    let daysLogged = 0;
    for (const s of signalRows) {
      const hasAny = (s.symptoms && s.symptoms.length > 0) || (s.mood && s.mood.length > 0) || (s.notes && s.notes.trim().length > 0);
      if (hasAny) daysLogged++;
      for (const sym of s.symptoms ?? []) {
        counts[sym] = (counts[sym] ?? 0) + 1;
      }
    }
    const ranked = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, n]) => ({ key: k, label: SYMPTOM_LABEL[k] ?? k.replace(/_/g, ' '), count: n }));
    return { daysLogged, ranked };
  }, [signalRows]);

  // Hot-flash count from notes (parsed from "Hot flashes: N" segments)
  // — useful for menopause-mode visits.
  const hotFlashCount = useMemo(() => {
    let total = 0;
    let daysWith = 0;
    for (const s of signalRows) {
      const m = (s.notes ?? '').match(/Hot flashes:\s*(\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > 0) {
          total += n;
          daysWith++;
        }
      }
    }
    return { total, daysWith };
  }, [signalRows]);

  const flagged = useMemo<Item[]>(() => {
    const flaggedRows = items.filter(
      i => i.status === 'critical' || i.status === 'abnormal'
    );
    flaggedRows.sort((a, b) => {
      const sev = (a.status === 'critical' ? 0 : 1) - (b.status === 'critical' ? 0 : 1);
      if (sev !== 0) return sev;
      const ta = a.date_recorded ? Date.parse(a.date_recorded) : 0;
      const tb = b.date_recorded ? Date.parse(b.date_recorded) : 0;
      return tb - ta;
    });
    return flaggedRows;
  }, [items]);

  const docName = useCallback((id: string | null): string => {
    if (!id) return '—';
    const d = docs.find(x => x.id === id);
    return d ? (d.ai_suggested_name || d.file_name) : '—';
  }, [docs]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const today = format(new Date(), 'MMMM d, yyyy');
  const totalLabResults = items.filter(i => i.data_type === 'lab_result').length;

  return (
    <div className="min-h-screen bg-white text-black print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="border-b border-gray-200 print:hidden">
        <div className="px-4 py-3 flex items-center gap-3 max-w-4xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard/medical-history')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <p className="text-sm font-medium">Full health-record print preview</p>
            <p className="text-[11px] text-muted-foreground">Use Cmd/Ctrl + P or the button to save as PDF.</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-10 print:px-0 print:py-0">
        <header className="mb-6 pb-4 border-b border-gray-300">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Womanie · Health record summary</p>
          <h1 className="text-2xl font-bold mb-1">{profile?.full_name || user?.name || 'Patient'}</h1>
          <div className="text-sm text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
            {user?.email && <span>{user.email}</span>}
            {profile?.life_stage && <span>· {profile.life_stage.replace(/-/g, ' ')}</span>}
            {profile?.pregnancy_due_date && <span>· pregnancy due {format(new Date(profile.pregnancy_due_date), 'MMM d, yyyy')}</span>}
            {profile?.ivf_phase && <span>· IVF {profile.ivf_phase}</span>}
            <span>· printed {today}</span>
          </div>
        </header>

        <section className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">Snapshot</h2>
          <p className="text-sm leading-relaxed">
            {docs.length} {docs.length === 1 ? 'document' : 'documents'} on file · {totalLabResults} extracted lab {totalLabResults === 1 ? 'value' : 'values'}
            {flagged.length > 0 && ` · ${flagged.length} flagged for attention`}.
          </p>
        </section>

        {(cycleStats || symptomSummary.daysLogged > 0 || hotFlashCount.daysWith > 0) && (
          <section className="mb-6 break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">
              Patient-tracked context
            </h2>

            {cycleStats && (
              <div className="mb-3">
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">Last period:</span>{' '}
                  {format(cycleStats.lastPeriodDate, 'MMM d, yyyy')}{' '}
                  ({cycleStats.daysSinceLast === 0
                    ? 'today'
                    : cycleStats.daysSinceLast === 1
                      ? '1 day ago'
                      : cycleStats.monthsSinceLast >= 2
                        ? `${cycleStats.monthsSinceLast} months ago`
                        : `${cycleStats.daysSinceLast} days ago`}).
                  {cycleStats.mean !== null && cycleStats.sd !== null && (
                    <>
                      {' '}
                      <span className="font-medium">Cycle length:</span>{' '}
                      mean {cycleStats.mean.toFixed(1)} d, SD ±{cycleStats.sd.toFixed(1)} d (last {cycleStats.recent.length - 1} cycles).
                    </>
                  )}
                </p>
                {cycleStats.recent.length > 1 && (
                  <table className="w-full text-xs border-collapse mt-2">
                    <thead>
                      <tr className="border-b border-gray-300 text-[10px] text-gray-500">
                        <th className="text-left py-1 font-medium">Period start</th>
                        <th className="text-left py-1 font-medium">Period end</th>
                        <th className="text-right py-1 font-medium">Cycle length</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycleStats.recent.map((p, i) => {
                        const prev = cycleStats.recent[i + 1];
                        const len = prev
                          ? differenceInDays(parseISO(p.period_start_date), parseISO(prev.period_start_date))
                          : null;
                        return (
                          <tr key={p.period_start_date} className="border-b border-gray-100">
                            <td className="py-1 pr-2 font-mono">{format(parseISO(p.period_start_date), 'yyyy-MM-dd')}</td>
                            <td className="py-1 pr-2 font-mono text-gray-600">
                              {p.period_end_date ? format(parseISO(p.period_end_date), 'yyyy-MM-dd') : '—'}
                            </td>
                            <td className="py-1 text-right font-mono">{len !== null ? `${len} d` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {symptomSummary.daysLogged > 0 && symptomSummary.ranked.length > 0 && (
              <div className="mb-3">
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">Symptoms logged in the last 90 days</span>{' '}
                  ({symptomSummary.daysLogged} {symptomSummary.daysLogged === 1 ? 'day' : 'days'} logged):
                </p>
                <ul className="text-sm text-gray-700 mt-1">
                  {symptomSummary.ranked.map(s => (
                    <li key={s.key}>
                      · {s.label} on {s.count} {s.count === 1 ? 'day' : 'days'}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hotFlashCount.daysWith > 0 && (
              <p className="text-sm leading-relaxed">
                <span className="font-medium">Hot flashes:</span>{' '}
                {hotFlashCount.total} total over {hotFlashCount.daysWith} {hotFlashCount.daysWith === 1 ? 'day' : 'days'} in the last 90 days
                ({(hotFlashCount.total / hotFlashCount.daysWith).toFixed(1)} per logged day).
              </p>
            )}
          </section>
        )}

        {flagged.length > 0 && (
          <section className="mb-6 break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">
              Flagged findings — please review with clinician
            </h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-300 text-xs text-gray-500">
                  <th className="text-left py-1.5 font-medium">Test</th>
                  <th className="text-right py-1.5 font-medium">Value</th>
                  <th className="text-right py-1.5 font-medium">Range</th>
                  <th className="text-right py-1.5 font-medium">Status</th>
                  <th className="text-right py-1.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {flagged.slice(0, 30).map(f => (
                  <tr key={f.id} className="border-b border-gray-100 align-top">
                    <td className="py-1.5 pr-2 font-medium">{getFriendlyName(f.title)}</td>
                    <td className="py-1.5 text-right font-mono whitespace-nowrap">
                      {f.value ?? '—'}{f.unit ? ` ${f.unit}` : ''}
                    </td>
                    <td className="py-1.5 text-right text-gray-600 whitespace-nowrap">
                      {f.reference_range ?? '—'}
                    </td>
                    <td className={`py-1.5 text-right whitespace-nowrap ${
                      f.status === 'critical' ? 'text-red-700 font-semibold' :
                      f.status === 'abnormal' ? 'text-amber-700 font-semibold' : ''
                    }`}>
                      {f.status ? STATUS_LABEL[f.status] ?? f.status : '—'}
                    </td>
                    <td className="py-1.5 text-right text-gray-600 whitespace-nowrap">
                      {f.date_recorded ? format(new Date(f.date_recorded), 'yyyy-MM-dd') : '—'}
                    </td>
                  </tr>
                ))}
                {flagged.length > 30 && (
                  <tr>
                    <td colSpan={5} className="py-1.5 text-xs italic text-gray-500">
                      + {flagged.length - 30} earlier flagged result{flagged.length - 30 > 1 ? 's' : ''} (see individual document prints).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {doctorNotes.length > 0 && (
          <section className="mb-6 break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">
              Notes from your doctors
            </h2>
            <div className="space-y-3">
              {doctorNotes.slice(0, 10).map(n => {
                const docLabel = [n.doctor_title, n.doctor_name].filter(Boolean).join(' ') || 'Doctor';
                const spec = Array.isArray(n.doctor_specialties) && n.doctor_specialties.length > 0
                  ? `, ${n.doctor_specialties[0]}`
                  : '';
                const prettyType = (n.note_type ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                return (
                  <div key={n.id} className="border-l-2 border-gray-300 pl-3 text-sm">
                    <p className="font-medium">
                      {n.title}
                      {prettyType && <span className="text-[10px] text-gray-500 ml-2 uppercase tracking-wide">{prettyType}</span>}
                    </p>
                    <p className="text-[11px] text-gray-600 mb-1">
                      {docLabel}{spec} · {format(new Date(n.created_at), 'MMM d, yyyy')}
                    </p>
                    <p className="text-[12px] text-gray-700 whitespace-pre-line leading-relaxed">{n.content}</p>
                  </div>
                );
              })}
              {doctorNotes.length > 10 && (
                <p className="text-[10px] text-gray-500 italic">
                  + {doctorNotes.length - 10} earlier note{doctorNotes.length - 10 > 1 ? 's' : ''} in your Womanie account.
                </p>
              )}
            </div>
          </section>
        )}

        {docs.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Documents</h2>
            <div className="space-y-5">
              {docs.map(doc => {
                const docItems = items.filter(i => i.document_id === doc.id && i.data_type === 'lab_result');
                const byPanel = new Map<string, Item[]>();
                for (const it of docItems) {
                  const panel = panelOf(it);
                  const list = byPanel.get(panel) ?? [];
                  list.push(it);
                  byPanel.set(panel, list);
                }
                const panelEntries = [...byPanel.entries()].sort((a, b) => {
                  if (a[0] === 'Other') return 1;
                  if (b[0] === 'Other') return -1;
                  return b[1].length - a[1].length;
                });
                return (
                  <div key={doc.id} className="break-inside-avoid">
                    <h3 className="text-sm font-semibold mb-1">
                      {doc.ai_suggested_name || doc.file_name}
                    </h3>
                    <p className="text-[11px] text-gray-600 mb-2">
                      {doc.ai_suggested_category && (
                        <span className="capitalize">{doc.ai_suggested_category.replace(/_/g, ' ')}</span>
                      )}
                      {doc.uploaded_at && (
                        <>
                          {' · '}
                          uploaded {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                        </>
                      )}
                    </p>
                    {doc.ai_summary && (
                      <p className="text-[12px] text-gray-700 leading-relaxed mb-2 whitespace-pre-line">
                        {doc.ai_summary}
                      </p>
                    )}
                    {panelEntries.length > 0 && (
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-gray-300 text-gray-500">
                            <th className="text-left py-1 font-medium">Test</th>
                            <th className="text-right py-1 font-medium">Value</th>
                            <th className="text-right py-1 font-medium">Range</th>
                            <th className="text-right py-1 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {panelEntries.map(([panel, labs]) => (
                            <>
                              <tr key={`${doc.id}-${panel}-h`} className="bg-gray-50">
                                <td colSpan={4} className="py-1 pl-1 text-[10px] uppercase tracking-wide text-gray-500">
                                  {panel} · {labs.length}
                                </td>
                              </tr>
                              {labs.map(lab => (
                                <tr key={lab.id} className="border-b border-gray-100">
                                  <td className="py-1 pr-2">
                                    {getFriendlyName(lab.title)}
                                  </td>
                                  <td className="py-1 text-right font-mono whitespace-nowrap">
                                    {lab.value ?? '—'}{lab.unit ? ` ${lab.unit}` : ''}
                                  </td>
                                  <td className="py-1 text-right text-gray-600 whitespace-nowrap">
                                    {lab.reference_range ?? '—'}
                                  </td>
                                  <td className={`py-1 text-right whitespace-nowrap ${
                                    lab.status === 'critical' ? 'text-red-700 font-semibold' :
                                    lab.status === 'abnormal' ? 'text-amber-700 font-semibold' : ''
                                  }`}>
                                    {lab.status ? STATUS_LABEL[lab.status] ?? lab.status : '—'}
                                  </td>
                                </tr>
                              ))}
                            </>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {docs.length === 0 && (
          <Card className="p-6 text-center text-sm text-gray-500 italic">
            No analyzed documents on file yet.
          </Card>
        )}

        <footer className="mt-10 pt-4 border-t border-gray-200 text-[10px] text-gray-500 leading-relaxed">
          This summary was produced by Womanie's AI document analyzer from documents the patient uploaded. It is intended to help the patient discuss their results with a clinician. It is not a medical record and is not a substitute for professional medical advice, diagnosis, or treatment. Document IDs (for cross-reference): {docs.length} ↦ <span className="font-mono break-all">{docs.map(d => d.id.slice(0, 8)).join(', ')}</span>.
        </footer>
      </div>
    </div>
  );
}
