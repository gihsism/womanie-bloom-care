import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { format } from 'date-fns';
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
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [profileRes, docsRes, itemsRes] = await Promise.all([
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
    ]);
    setProfile((profileRes.data ?? null) as Profile | null);
    setDocs((docsRes.data ?? []) as Doc[]);
    setItems((itemsRes.data ?? []) as Item[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);

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
