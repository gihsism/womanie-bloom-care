import { useCallback, useEffect, useMemo, useState } from 'react';
import SubPageHeader from '@/components/SubPageHeader';
import { Checkbox } from '@/components/ui/checkbox';
import { Printer, Loader2 } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getFriendlyName } from '@/lib/medical-utils';
import { normalizeLifeStage } from '@/lib/lifeStage';
import {
  SUMMARY_SECTIONS, SECTION_ORDER, type SummarySection, defaultSelection, selectedSections,
  stageLines, lastCycles, medicineLines, summariseSignals, countSentence, openQuestions,
  recentResults, documentNames, footerLine, localDate, isoDay, SYMPTOM_WINDOW_DAYS,
  type PeriodRow, type MedicineRow, type SignalRow, type ResultRow, type DocumentRow,
} from '@/lib/visitSummary';

// "Share with any doctor": a one-page visit summary for a gynaecologist who
// is not on Womanie. She ticks the sections she wants to share (all ticked
// by default; nothing leaves the device), then prints or saves as PDF with
// the browser. The ticks and the toolbar are hidden on paper. Same print
// decisions as PrintHealthRecord: white page, black text, no fills.

export interface VisitSummaryData {
  name: string | null;
  stage: string | null;
  dueDate: string | null;
  periods: PeriodRow[];
  medicines: MedicineRow[];
  signals: SignalRow[];
  questionRows: Array<{ questions: unknown }>;
  results: ResultRow[];
  documents: DocumentRow[];
}

const H2 = 'text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1';
const NONE = <p className="text-sm text-gray-500">None recorded.</p>;

/** The printable page itself (pure: data + ticks in, page out). */
export function VisitSummarySheet({ data, sections, now = new Date() }: {
  data: VisitSummaryData;
  sections: SummarySection[];
  now?: Date;
}) {
  const cycles = lastCycles(data.periods);
  const meds = medicineLines(data.medicines);
  const signals = summariseSignals(data.signals, now);
  const questions = openQuestions(data.questionRows);
  const results = recentResults(data.results, getFriendlyName);
  const docs = documentNames(data.documents);
  const day = (d: Date | null) => (d ? localDate(d) : '—');

  const body: Record<SummarySection, JSX.Element> = {
    stage: (
      <div className="text-sm space-y-0.5">
        {stageLines({ stage: data.stage, dueDate: data.dueDate, lastPeriodStart: cycles[0] ? isoDay(cycles[0].start) : null, now })
          .map(l => <p key={l}>{l}</p>)}
      </div>
    ),
    cycles: cycles.length === 0 ? NONE : (
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-300 text-xs text-gray-500">
            <th className="text-left py-1 font-medium">Period started</th>
            <th className="text-right py-1 font-medium">Period length</th>
            <th className="text-right py-1 font-medium">Cycle length</th>
          </tr>
        </thead>
        <tbody>
          {cycles.map((c, i) => (
            <tr key={c.start.getTime()} className="border-b border-gray-100">
              <td className="py-1">{day(c.start)}</td>
              <td className="py-1 text-right">{c.periodLength != null ? `${c.periodLength} days` : '—'}</td>
              <td className="py-1 text-right">{c.cycleLength != null ? `${c.cycleLength} days` : i === 0 ? 'current cycle' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
    medicines: meds.length === 0 ? NONE : (
      <ul className="text-sm list-disc pl-5">{meds.map(m => <li key={m}>{m}</li>)}</ul>
    ),
    symptoms: signals.daysLogged === 0 ? <p className="text-sm text-gray-500">Nothing logged in the last {SYMPTOM_WINDOW_DAYS} days.</p> : (
      <div className="text-sm space-y-0.5">
        <p>Days with an entry: {signals.daysLogged} of the last {SYMPTOM_WINDOW_DAYS}.</p>
        {signals.symptoms.length > 0 && <p>Symptoms: {countSentence(signals.symptoms)}.</p>}
        {signals.moods.length > 0 && <p>Mood: {countSentence(signals.moods)}.</p>}
      </div>
    ),
    questions: questions.length === 0 ? <p className="text-sm text-gray-500">No open questions saved.</p> : (
      <ol className="text-sm list-decimal pl-5">{questions.map(q => <li key={q}>{q}</li>)}</ol>
    ),
    results: results.length === 0 ? NONE : (
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-300 text-xs text-gray-500">
            <th className="text-left py-1 font-medium">Test</th>
            <th className="text-right py-1 font-medium">Result</th>
            <th className="text-right py-1 font-medium">Reference</th>
            <th className="text-right py-1 font-medium">Note</th>
            <th className="text-right py-1 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {results.map(r => (
            <tr key={r.name} className="border-b border-gray-100 align-top">
              <td className="py-1 pr-2">{r.name}</td>
              <td className="py-1 text-right whitespace-nowrap">{r.value}</td>
              <td className="py-1 text-right text-gray-600 whitespace-nowrap">{r.range || '—'}</td>
              <td className="py-1 text-right text-gray-600">{r.flag || '—'}</td>
              <td className="py-1 text-right text-gray-600 whitespace-nowrap">{day(r.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
    documents: docs.names.length === 0 ? NONE : (
      <ul className="text-sm list-disc pl-5">
        {docs.names.map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}
        {docs.more > 0 && <li className="text-gray-500">and {docs.more} more</li>}
      </ul>
    ),
  };

  return (
    <article className="max-w-3xl my-4 mx-4 md:mx-auto rounded-2xl bg-white text-black px-5 py-6 sm:px-8 sm:py-8 shadow-sm print:m-0 print:rounded-none print:shadow-none print:px-0 print:py-0" data-testid="visit-summary-sheet">
      <header className="mb-4 pb-3 border-b border-gray-300">
        <p className="text-xs uppercase tracking-wide text-gray-500">Visit summary</p>
        <h1 className="text-xl font-bold">{data.name || 'Patient'}</h1>
        <p className="text-xs text-gray-600">Prepared {localDate(now)}</p>
      </header>
      {sections.length === 0 && <p className="text-sm text-gray-500">No sections selected.</p>}
      {sections.map(k => (
        <section key={k} className="mb-4 break-inside-avoid" data-section={k}>
          <h2 className={H2}>{SUMMARY_SECTIONS[k]}</h2>
          {body[k]}
        </section>
      ))}
      <footer className="mt-6 pt-2 border-t border-gray-200 text-[10px] text-gray-500">{footerLine(now)}</footer>
    </article>
  );
}

export default function PrintVisitSummary() {
  usePageTitle('Visit summary');
  const { user } = useAuth();
  const [data, setData] = useState<VisitSummaryData | null>(null);
  const [sel, setSel] = useState(defaultSelection);

  const load = useCallback(async () => {
    if (!user) return;
    const since = new Date(Date.now() - (SYMPTOM_WINDOW_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
    const rows = <T,>(r: { data: unknown }) => (Array.isArray(r.data) ? r.data : []) as T[];
    const [profileRes, periodRes, medsRes, signalRes, qRes, resultRes, docsRes] = await Promise.all([
      db.from('profiles').select('full_name, life_stage, pregnancy_due_date').eq('id', user.id).maybeSingle(),
      db.from('period_tracking').select('period_start_date, period_end_date').eq('user_id', user.id)
        .order('period_start_date', { ascending: false }).limit(12),
      db.from('medications').select('name, dose, times_per_day, active').eq('user_id', user.id).eq('active', true),
      db.from('daily_health_signals').select('signal_date, symptoms, mood').eq('user_id', user.id).gte('signal_date', since),
      // Absent before migration 012 is applied: the section then says "none saved".
      db.from('visit_questions').select('questions, updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }),
      db.from('current_extracted_data').select('title, value, unit, reference_range, status, date_recorded, data_type')
        .eq('user_id', user.id).eq('data_type', 'lab_result'),
      db.from('health_documents').select('file_name, ai_suggested_name, uploaded_at').eq('user_id', user.id),
    ]);
    const p = (profileRes.data ?? null) as { full_name: string | null; life_stage: string | null; pregnancy_due_date: string | null } | null;
    setData({
      name: p?.full_name || user.name || null,
      stage: p?.life_stage ? normalizeLifeStage(p.life_stage) : null,
      dueDate: p?.pregnancy_due_date ?? null,
      periods: rows<PeriodRow>(periodRes),
      medicines: rows<MedicineRow>(medsRes),
      signals: rows<SignalRow>(signalRes),
      questionRows: qRes.error ? [] : rows<{ questions: unknown }>(qRes),
      results: rows<ResultRow>(resultRes),
      documents: rows<DocumentRow>(docsRes),
    });
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  const sections = useMemo(() => selectedSections(sel), [sel]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      <div className="print:hidden">
        <SubPageHeader
          title="Visit summary"
          subtitle="For any doctor · pick, then print"
          backTo="/dashboard/settings"
          backLabel="Me"
          action={(
            <button type="button" className="btn-stage h-11 px-4" onClick={() => window.print()} disabled={sections.length === 0} data-testid="visit-summary-print">
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print
            </button>
          )}
        />
        <fieldset className="max-w-3xl mx-auto px-4 pt-4 pb-2" data-testid="visit-summary-choices">
          <legend className="text-[14px] text-muted-foreground mb-2">What to include. Only ticked parts print.</legend>
          <div className="row-group grid grid-cols-1 sm:grid-cols-2">
            {SECTION_ORDER.map(k => (
              <label key={k} className="flex min-h-[48px] items-center gap-3 px-4 text-[15px] cursor-pointer">
                <Checkbox checked={sel[k]} onCheckedChange={v => setSel(s => ({ ...s, [k]: v === true }))} aria-label={SUMMARY_SECTIONS[k]} />
                {SUMMARY_SECTIONS[k]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <VisitSummarySheet data={data} sections={sections} />
    </div>
  );
}
