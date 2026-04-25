import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { format } from 'date-fns';
import { getFriendlyName } from '@/lib/medical-utils';

// Print-friendly single-document view.
//
// Used when a patient wants to share or save just one analyzed doc
// — opening it in a new tab and hitting Cmd+P (or the in-page Print
// button) gives them a clean A4-shaped PDF without the dashboard
// chrome, without the AI doctor button bar, without the mode picker.
//
// Layout choices made for printability:
//   * No sticky headers (they stack on every page break in print).
//   * Black/grey on white; status-color highlights kept but printed
//     with high contrast.
//   * Tables grouped by panel with row borders, not background fills
//     (saves toner).
//   * Footer disclaimer + the patient's email so a doctor can
//     correlate which patient this came from.

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
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  data_type: string | null;
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

export default function PrintDoc() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  usePageTitle(doc?.ai_suggested_name || doc?.file_name || 'Print document');

  const load = useCallback(async () => {
    if (!user || !id) return;
    const [docRes, itemsRes] = await Promise.all([
      db.from('health_documents')
        .select('id, file_name, ai_suggested_name, ai_suggested_category, ai_summary, uploaded_at')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle(),
      db.from('medical_extracted_data')
        .select('id, title, value, unit, reference_range, status, data_type, notes, raw_data')
        .eq('user_id', user.id)
        .eq('document_id', id),
    ]);
    setDoc((docRes.data ?? null) as Doc | null);
    setItems((itemsRes.data ?? []) as Item[]);
    setLoaded(true);
  }, [user, id]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const byPanel = new Map<string, Item[]>();
    for (const item of items) {
      if (item.data_type !== 'lab_result') continue;
      const panel = panelOf(item);
      const list = byPanel.get(panel) ?? [];
      list.push(item);
      byPanel.set(panel, list);
    }
    // Critical/abnormal counts at the top of each panel for sort.
    const ranked = [...byPanel.entries()].sort((a, b) => {
      if (a[0] === 'Other') return 1;
      if (b[0] === 'Other') return -1;
      return b[1].length - a[1].length;
    });
    return ranked;
  }, [items]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 max-w-md w-full text-center space-y-3">
          <p className="text-sm">Document not found.</p>
          <Button variant="outline" onClick={() => navigate('/dashboard/medical-history')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Health Records
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="border-b border-gray-200 print:hidden">
        <div className="px-4 py-3 flex items-center gap-3 max-w-4xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard/medical-history')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <p className="text-sm font-medium">Print preview</p>
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
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Womanie · Health document</p>
          <h1 className="text-2xl font-bold mb-1">{doc.ai_suggested_name || doc.file_name}</h1>
          <div className="text-sm text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
            {doc.ai_suggested_category && (
              <span className="capitalize">{doc.ai_suggested_category.replace(/_/g, ' ')}</span>
            )}
            {doc.uploaded_at && <span>Uploaded {format(new Date(doc.uploaded_at), 'MMMM d, yyyy')}</span>}
            {user?.email && <span>· {user.email}</span>}
          </div>
        </header>

        {doc.ai_summary && (
          <section className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">Summary</h2>
            <div className="text-sm whitespace-pre-line leading-relaxed">{doc.ai_summary}</div>
          </section>
        )}

        {grouped.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Results</h2>
            <div className="space-y-5">
              {grouped.map(([panel, labs]) => (
                <div key={panel} className="break-inside-avoid">
                  <h3 className="text-sm font-semibold mb-1.5">{panel}</h3>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 text-xs text-gray-500">
                        <th className="text-left py-1.5 font-medium">Test</th>
                        <th className="text-right py-1.5 font-medium">Value</th>
                        <th className="text-right py-1.5 font-medium">Range</th>
                        <th className="text-right py-1.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labs.map(lab => (
                        <tr key={lab.id} className="border-b border-gray-100 align-top">
                          <td className="py-1.5 pr-2">
                            <div className="font-medium">{getFriendlyName(lab.title)}</div>
                            {lab.notes && (
                              <div className="text-[11px] text-gray-600 mt-0.5">{lab.notes}</div>
                            )}
                          </td>
                          <td className="py-1.5 text-right font-mono whitespace-nowrap">
                            {lab.value ?? '—'}{lab.unit ? ` ${lab.unit}` : ''}
                          </td>
                          <td className="py-1.5 text-right text-gray-600 whitespace-nowrap">
                            {lab.reference_range ?? '—'}
                          </td>
                          <td className={`py-1.5 text-right whitespace-nowrap ${
                            lab.status === 'critical' ? 'text-red-700 font-semibold' :
                            lab.status === 'abnormal' ? 'text-amber-700 font-semibold' : ''
                          }`}>
                            {lab.status ? STATUS_LABEL[lab.status] ?? lab.status : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>
        )}

        {grouped.length === 0 && !doc.ai_summary && (
          <p className="text-sm text-gray-500 italic">
            This document hasn't been analyzed yet — no data to print.
          </p>
        )}

        <footer className="mt-10 pt-4 border-t border-gray-200 text-[10px] text-gray-500 leading-relaxed">
          This summary was produced by Womanie's AI document analyzer and is intended to help you discuss your results with a clinician. It is not a medical record and is not a substitute for professional medical advice, diagnosis, or treatment.
        </footer>
      </div>
    </div>
  );
}
