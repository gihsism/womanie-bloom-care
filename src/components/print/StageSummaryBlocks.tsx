// The stage-specific blocks shared by the printable pages: the
// menopause "Symptom diary, last 4 weeks", the trying-to-conceive
// "Cycles and ovulation tests", the IVF "Treatment dates" and the
// contraception "Method and dates". Used by the visit prep sheet (one booked
// visit) and the general visit summary (no visit needed). Body only - each
// page wraps it in its own <section> and heading. Print styling: white
// page, black text, no fills (same as the pages around it).

import { weekLabel, type DiaryWeek, type SymptomDiary } from '@/lib/menopauseDiary';
import { lhText, type TtcCycleSummary } from '@/lib/ttcPrep';
import { localDate } from '@/lib/visitSummary';
import { ivfDateList, localDateTime, parseIvfPlan, DEFAULT_IVF_TZ } from '@/lib/ivfJourney';
import { isMethodId, methodSummaryLines, parseMethodDates } from '@/lib/contraceptionSchedule';

export const MENOPAUSE_STAGES = ['menopause', 'post-menopause'];

export function DiaryBlock({ diary }: { diary: SymptomDiary }) {
  type Row = [label: string, cell: (w: DiaryWeek) => string, show: boolean];
  const dash = (v: number | null) => (v == null ? '—' : String(v));
  const rows = ([
    ['Days logged', w => String(w.daysLogged), true],
    ['Hot flushes (days)', w => String(w.hotFlushDays), true],
    ['Hot flushes counted', w => dash(w.hotFlushCount), diary.hasHotCounts],
    ['Poor-sleep nights', w => String(w.poorSleepNights), true],
    ['Sleep, hours a night', w => dash(w.sleepHours), diary.hasSleepHours],
    ['Low-mood days', w => String(w.lowMoodDays), true],
  ] as Row[]).filter(r => r[2]);
  return (
    <>
      <p className="text-sm mb-1">{diary.sentence}</p>
      {diary.daysLogged > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-300 text-xs text-gray-500">
              <th className="text-left py-1 font-medium">Week</th>
              {diary.weeks.map(w => {
                const [a, b] = weekLabel(w).split(' – ');
                return <th key={a} className="text-right py-1 pl-2 font-medium leading-tight">{a}<span className="block">– {b}</span></th>;
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cell]) => (
              <tr key={label} className="border-b border-gray-100">
                <td className="py-1 pr-2">{label}</td>
                {diary.weeks.map(w => <td key={w.from.getTime()} className="py-1 pl-2 text-right tabular-nums">{cell(w)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-gray-500 mt-1">From the daily log in Womanie. Days with nothing logged are not counted.</p>
    </>
  );
}

export function TtcCyclesBlock({ ttc }: { ttc: TtcCycleSummary }) {
  return (
    <>
      <p className="text-sm mb-1">{ttc.sentence}</p>
      {ttc.cycles.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-300 text-xs text-gray-500">
              <th className="text-left py-1 font-medium">Period started</th>
              <th className="text-right py-1 pl-2 font-medium">Cycle</th>
              <th className="text-right py-1 pl-2 font-medium">Period</th>
              <th className="text-left py-1 pl-2 font-medium">Ovulation tests</th>
            </tr>
          </thead>
          <tbody>
            {ttc.cycles.map(c => (
              <tr key={c.start.getTime()} className="border-b border-gray-100 align-top">
                <td className="py-1 pr-2 whitespace-nowrap">{localDate(c.start)}</td>
                <td className="py-1 pl-2 text-right whitespace-nowrap">{c.current ? 'current' : c.cycleLength != null ? `${c.cycleLength} d` : '—'}</td>
                <td className="py-1 pl-2 text-right whitespace-nowrap">{c.periodLength != null ? `${c.periodLength} d` : '—'}</td>
                <td className="py-1 pl-2">{lhText(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-gray-500 mt-1">Cycle = days from one period start to the next. Ovulation tests as logged in Womanie; cycle day 1 is the first day of the period.</p>
    </>
  );
}

const isoToLocal = (d: string) => { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day); };

/** IVF: the treatment dates she entered from her clinic's plan. */
export function IvfDatesBlock({ plan, tz = DEFAULT_IVF_TZ }: { plan: unknown; tz?: string }) {
  const rows = ivfDateList(parseIvfPlan(plan), tz);
  if (!rows.length) return <p className="text-sm text-gray-500">No treatment dates entered in Womanie.</p>;
  return (
    <>
      <table className="w-full text-sm border-collapse">
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className="border-b border-gray-100">
              <td className="py-1 pr-2">{r.label}</td>
              <td className="py-1 pl-2 text-right whitespace-nowrap">
                {localDate(isoToLocal(r.date))}{r.at ? `, ${localDateTime(new Date(r.at), tz).time}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-1">As entered in Womanie from the clinic's treatment plan.</p>
    </>
  );
}

/** Contraception: the method and the dates she entered for it. */
export function ContraceptionBlock({ method, dates, now }: { method: unknown; dates: unknown; now: Date }) {
  const id = isMethodId(method) ? method : null;
  const lines = methodSummaryLines(id, id ? parseMethodDates(dates)[id] : undefined, now);
  if (!lines.length) return <p className="text-sm text-gray-500">Method not entered in Womanie.</p>;
  return (
    <>
      <ul className="text-sm space-y-0.5">{lines.map(l => <li key={l}>{l}</li>)}</ul>
      {lines.length > 1 && <p className="text-xs text-gray-500 mt-1">Dates as entered in Womanie.</p>}
    </>
  );
}
