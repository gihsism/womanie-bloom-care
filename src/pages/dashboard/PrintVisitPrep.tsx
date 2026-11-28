import { formatTime } from '@/lib/timeFormat';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getFriendlyName } from '@/lib/medical-utils';
import { normalizeLifeStage } from '@/lib/lifeStage';
import { readTtcStartLocal } from '@/hooks/useTtcStart';
import { UNSCHEDULED_VISIT_ID } from '@/lib/hrtQuestions';
import { formatLabDay } from '@/lib/health-trends';
import { recheckHints, type RecheckRow } from '@/lib/labRecheck';
import { prepQuestions, resultsToDiscuss, type PrepResultRow } from '@/lib/visitPrep';
import { symptomDiary } from '@/lib/menopauseDiary';
import type { SignalInput } from '@/lib/menopauseInsights';
import { ttcCycleSummary } from '@/lib/ttcPrep';
import { DiaryBlock, TtcCyclesBlock, IvfDatesBlock, ContraceptionBlock, MENOPAUSE_STAGES } from '@/components/print/StageSummaryBlocks';
import { deviceTz } from '@/components/dashboard/ivf/ivfFormat';
import { IVF_PLAN_LOCAL_KEY } from '@/lib/ivfJourney';
import { METHOD_DATES_KEY } from '@/lib/contraceptionSchedule';
import {
  stageLines, lastCycles, medicineLines, footerLine, localDate, isoDay,
  type PeriodRow, type MedicineRow,
} from '@/lib/visitSummary';

// Visit prep sheet: one printable page for ONE upcoming visit, opened from
// that visit on Visits ("Prep sheet"). Her open questions for the visit,
// current medicines, results worth bringing up, and the cycle / pregnancy
// line. Read-only; same print decisions as PrintVisitSummary (white page,
// black text, toolbar hidden on paper). Nothing leaves the device.

export interface VisitPrepData {
  name: string | null;
  visit: { scheduled_at: string; doctor: string | null } | null;
  stage: string | null;
  dueDate: string | null;
  ttcStartDate?: string | null;
  periods: PeriodRow[];
  medicines: MedicineRow[];
  visitQuestions: { questions: unknown } | null;
  unscheduledQuestions: { questions: unknown } | null;
  results: PrepResultRow[];
  /** daily_health_signals of the last ~200 days: the menopause diary and the TTC LH tests. */
  signals?: SignalInput[];
  /** IVF: her treatment plan (ivf_plans.plan, or the device copy). */
  ivfPlan?: unknown;
  /** Contraception: the method and its dates (account-synced device keys). */
  contraception?: { method: unknown; dates: unknown } | null;
}

const H2 = 'text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1';
export function VisitPrepSheet({ data, now = new Date(), tz }: { data: VisitPrepData; now?: Date; tz?: string }) {
  const cycles = lastCycles(data.periods);
  const meds = medicineLines(data.medicines);
  const { questions, fromVisit } = prepQuestions(data.visitQuestions, data.unscheduledQuestions);
  const results = resultsToDiscuss(data.results, getFriendlyName);
  const due = data.dueDate ? new Date(`${String(data.dueDate).slice(0, 10)}T00:00:00`) : null;
  const hints = recheckHints(data.results as RecheckRow[], { stage: data.stage, dueDate: due, now });
  const when = data.visit ? new Date(data.visit.scheduled_at) : null;
  const diary = MENOPAUSE_STAGES.includes(data.stage ?? '') ? symptomDiary(data.signals ?? [], now) : null;
  const ttc = data.stage === 'conception' ? ttcCycleSummary(data.periods, data.signals ?? [], now) : null;

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8 print:px-0 print:py-0" data-testid="visit-prep-sheet">
      <header className="mb-4 pb-3 border-b border-gray-300">
        <p className="text-xs uppercase tracking-wide text-gray-500">Visit prep</p>
        <h1 className="text-xl font-bold">{data.name || 'Patient'}</h1>
        {when && (
          <p className="text-sm">
            Visit on {localDate(when)} at {formatTime(when)}
            {data.visit?.doctor ? ` with ${data.visit.doctor}` : ''}
          </p>
        )}
        <p className="text-xs text-gray-600">Prepared {localDate(now)}</p>
      </header>

      <section className="mb-4 break-inside-avoid" data-section="stage">
        <h2 className={H2}>Where things stand</h2>
        <div className="text-sm space-y-0.5">
          {stageLines({ stage: data.stage, dueDate: data.dueDate, ttcStartDate: data.ttcStartDate, lastPeriodStart: cycles[0] ? isoDay(cycles[0].start) : null, now })
            .map(l => <p key={l}>{l}</p>)}
        </div>
      </section>

      {diary && (
        <section className="mb-4 break-inside-avoid" data-section="symptom-diary">
          <h2 className={H2}>Symptom diary, last 4 weeks</h2>
          <DiaryBlock diary={diary} />
        </section>
      )}

      {data.stage === 'ivf' && (
        <section className="mb-4 break-inside-avoid" data-section="ivf-dates">
          <h2 className={H2}>Treatment dates</h2>
          <IvfDatesBlock plan={data.ivfPlan ?? null} tz={tz} />
        </section>
      )}

      {data.stage === 'contraception' && (
        <section className="mb-4 break-inside-avoid" data-section="contraception">
          <h2 className={H2}>Contraception</h2>
          <ContraceptionBlock method={data.contraception?.method ?? null} dates={data.contraception?.dates ?? null} now={now} />
        </section>
      )}

      {ttc && (
        <section className="mb-4 break-inside-avoid" data-section="ttc-cycles">
          <h2 className={H2}>Cycles and ovulation tests</h2>
          <TtcCyclesBlock ttc={ttc} />
        </section>
      )}

      <section className="mb-4 break-inside-avoid" data-section="questions">
        <h2 className={H2}>My questions</h2>
        {questions.length === 0 ? (
          <p className="text-sm text-gray-500">No open questions saved for this visit.</p>
        ) : (
          <>
            {!fromVisit && <p className="text-xs text-gray-500 mb-1">Saved before this visit was booked.</p>}
            <ol className="text-sm list-decimal pl-5">{questions.map(q => <li key={q}>{q}</li>)}</ol>
          </>
        )}
      </section>

      <section className="mb-4 break-inside-avoid" data-section="medicines">
        <h2 className={H2}>Current medicines</h2>
        {meds.length === 0 ? <p className="text-sm text-gray-500">None recorded.</p> : (
          <ul className="text-sm list-disc pl-5">{meds.map(m => <li key={m}>{m}</li>)}</ul>
        )}
      </section>

      <section className="mb-4 break-inside-avoid" data-section="results">
        <h2 className={H2}>Results to bring up</h2>
        {results.length === 0 ? (
          <p className="text-sm text-gray-500">No results outside the range or changed since the previous test.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-300 text-xs text-gray-500">
                <th className="text-left py-1 font-medium">Test</th>
                <th className="text-right py-1 pl-2 font-medium">Latest</th>
                <th className="text-right py-1 pl-2 font-medium">Reference</th>
                <th className="text-right py-1 pl-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.name} className="border-b border-gray-100 align-top">
                  <td className="py-1 pr-2 min-w-[6.5rem]">
                    {r.name}
                    <span className="block text-xs text-gray-600">{r.note}</span>
                  </td>
                  <td className="py-1 pl-2 text-right whitespace-nowrap">{r.value}</td>
                  <td className="py-1 pl-2 text-right text-gray-600">{r.range || '—'}</td>
                  <td className="py-1 pl-2 text-right text-gray-600 whitespace-nowrap">{r.date ? formatLabDay(r.date) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {hints.length > 0 && (
        <section className="mb-4 break-inside-avoid" data-section="last-checked">
          <h2 className={H2}>When these were last checked</h2>
          <ul className="text-sm list-disc pl-5">{hints.map(h => <li key={h.key}>{h.text}</li>)}</ul>
        </section>
      )}

      <footer className="mt-6 pt-2 border-t border-gray-200 text-[10px] text-gray-500">{footerLine(now)}</footer>
    </article>
  );
}

export default function PrintVisitPrep() {
  usePageTitle('Visit prep');
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<VisitPrepData | null>(null);

  const load = useCallback(async () => {
    if (!user || !id) return;
    const rows = <T,>(r: { data: unknown }) => (Array.isArray(r.data) ? r.data : []) as T[];
    const since = new Date(Date.now() - 200 * 86_400_000);
    const [aptResp, profileRes, periodRes, medsRes, qRes, resultRes, signalRes, ivfRes] = await Promise.all([
      fetch('/api/me/appointments').then(r => (r.ok ? r.json() : { appointments: [] })).catch(() => ({ appointments: [] })),
      // '*': ttc_start_date exists only once migration 025 is applied.
      db.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      db.from('period_tracking').select('period_start_date, period_end_date').eq('user_id', user.id)
        .order('period_start_date', { ascending: false }).limit(12),
      db.from('medications').select('name, dose, times_per_day, active').eq('user_id', user.id).eq('active', true),
      // Absent before migration 012: the section then says "none saved".
      db.from('visit_questions').select('appointment_id, questions').eq('user_id', user.id)
        .in('appointment_id', [String(id), UNSCHEDULED_VISIT_ID]),
      db.from('current_extracted_data').select('title, value, unit, reference_range, status, date_recorded, data_type, document_id')
        .eq('user_id', user.id).eq('data_type', 'lab_result'),
      // Menopause diary (last 4 weeks) and TTC ovulation tests (last 6 cycles).
      db.from('daily_health_signals').select('signal_date, symptoms, mood, notes').eq('user_id', user.id)
        .gte('signal_date', isoDay(since)),
      // IVF treatment dates (absent before migration 022: the device copy is used).
      db.from('ivf_plans').select('plan').eq('user_id', user.id).maybeSingle(),
    ]);
    const device = (k: string): unknown => {
      try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; } catch { return null; }
    };
    const ivfRow = (ivfRes.error ? null : ivfRes.data) as { plan: unknown } | null;
    const apts = (Array.isArray(aptResp?.appointments) ? aptResp.appointments : []) as Array<{ id: string; scheduled_at: string; doctor_name: string | null; doctor_title: string | null }>;
    const apt = apts.find(a => String(a.id) === String(id)) ?? null;
    const p = (profileRes.data ?? null) as { full_name: string | null; life_stage: string | null; pregnancy_due_date: string | null; ttc_start_date?: string | null } | null;
    const qs = qRes.error ? [] : rows<{ appointment_id: string; questions: unknown }>(qRes);
    setData({
      name: p?.full_name || user.name || null,
      visit: apt ? { scheduled_at: apt.scheduled_at, doctor: [apt.doctor_title, apt.doctor_name].filter(Boolean).join(' ') || null } : null,
      stage: p?.life_stage ? normalizeLifeStage(p.life_stage) : null,
      dueDate: p?.pregnancy_due_date ?? null,
      ttcStartDate: p?.ttc_start_date ? String(p.ttc_start_date).slice(0, 10) : readTtcStartLocal(user.id),
      periods: rows<PeriodRow>(periodRes),
      medicines: rows<MedicineRow>(medsRes),
      visitQuestions: qs.find(r => r.appointment_id === String(id)) ?? null,
      unscheduledQuestions: qs.find(r => r.appointment_id === UNSCHEDULED_VISIT_ID) ?? null,
      results: rows<PrepResultRow>(resultRes),
      signals: rows<SignalInput>(signalRes),
      ivfPlan: ivfRow?.plan ?? device(IVF_PLAN_LOCAL_KEY(user.id)),
      contraception: { method: device(`contraception:${user.id}:method`), dates: device(METHOD_DATES_KEY(user.id)) },
    });
  }, [user, id]);

  useEffect(() => { void load(); }, [load]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="border-b border-gray-200 print:hidden">
        <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <p className="text-sm font-medium">Prep sheet for this visit</p>
            <p className="text-[11px] text-muted-foreground">Print it or save as PDF to take along.</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => window.print()} data-testid="visit-prep-print">
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>
      <VisitPrepSheet data={data} tz={deviceTz()} />
    </main>
  );
}
