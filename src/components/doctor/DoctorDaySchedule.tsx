import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { ChevronRight, ClipboardList, Sparkles } from 'lucide-react';
import { buildDaySchedule, dayWindow, type DayVisit, type ScheduleRow } from '@/lib/doctorDay';
import type { DoctorAppointment, DoctorPatientConnection } from '@/lib/doctorDashboard';

// The doctor's day: today's and tomorrow's visits in time order. Each row:
// time, patient, where she is (stage line), open questions, and a flag
// when something is new since the last completed visit (documents,
// out-of-range results, a low-mood run). One tap opens the chart on the
// "Before the visit" card (Summary tab).
//
// The visits come from the appointments the dashboard already loaded; the
// per-patient facts come from the consent-gated /api/doctors/day, so a
// patient who has not approved the doctor shows only her name and time.

interface Props {
  appointments: DoctorAppointment[];
  patients: DoctorPatientConnection[];
  /** For tests. */
  now?: number;
}

const timeLabel = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const Row = ({ row, onOpen }: { row: ScheduleRow; onOpen: (r: ScheduleRow) => void }) => {
  const meta = [row.kind, row.duration ? `${row.duration} min` : null].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className={`w-[4.5rem] shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums ${row.past ? 'text-muted-foreground' : ''}`}>
        {timeLabel(row.start)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{row.name}</span>
        <span className="block text-xs text-muted-foreground truncate">
          {row.approved ? [row.stageLine, meta].filter(Boolean).join(' · ') : `${meta} · waiting for her approval`}
        </span>
        {row.approved && (row.openQuestions > 0 || row.newSince.length > 0 || row.firstVisit) && (
          <span className="mt-1 flex flex-wrap gap-1.5">
            {row.newSince.length > 0 && (
              <span className="inline-flex max-w-full items-start gap-1 rounded-xl bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                <Sparkles className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
                <span>New: {row.newSince.join(', ')}</span>
              </span>
            )}
            {row.openQuestions > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                <ClipboardList className="h-3 w-3" aria-hidden="true" />
                {row.openQuestions} open question{row.openQuestions === 1 ? '' : 's'}
              </span>
            )}
            {row.firstVisit && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                First visit with you
              </span>
            )}
          </span>
        )}
      </span>
    </>
  );

  if (!row.approved) {
    return <div className={`flex items-start gap-3 p-3 ${row.past ? 'opacity-60' : ''}`}>{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className={`flex w-full items-start gap-3 p-3 text-left hover:bg-muted/40 transition-colors ${row.past ? 'opacity-60' : ''}`}
    >
      {body}
      <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
};

const DoctorDaySchedule = ({ appointments, patients, now: fixedNow }: Props) => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => fixedNow ?? Date.now());
  const [dayVisits, setDayVisits] = useState<DayVisit[]>([]);

  useEffect(() => {
    if (fixedNow !== undefined) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [fixedNow]);

  // Refetch when the visit list changes or the date rolls over.
  const dayKey = new Date(now).toDateString();
  const apptKey = appointments.map(a => `${a.id}:${a.status}:${a.scheduled_at}`).join('|');
  useEffect(() => {
    let cancelled = false;
    const { from, to } = dayWindow(Date.parse(dayKey) || Date.now());
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    fetch(`/api/doctors/day?${params.toString()}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(body => {
        if (!cancelled && body && Array.isArray(body.visits)) setDayVisits(body.visits as DayVisit[]);
      })
      .catch(() => {
        // The schedule still shows from the appointment list, just without the flags.
      });
    return () => { cancelled = true; };
  }, [dayKey, apptKey]);

  const { today, tomorrow } = buildDaySchedule({ appointments, patients, dayVisits, now });
  const dateLabel = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const open = (r: ScheduleRow) => navigate(`/doctor/patient/${r.patientId}?tab=summary`);

  const section = (label: string, rows: ScheduleRow[], empty: string) => (
    <div>
      <h3 className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">{label}</h3>
      {rows.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y">
          {rows.map(r => <Row key={r.appointmentId} row={r} onOpen={open} />)}
        </div>
      )}
    </div>
  );

  return (
    <section aria-labelledby="doctor-day-heading" className="space-y-2">
      <h2 id="doctor-day-heading" className="text-lg font-semibold">Your day</h2>
      <Card className="divide-y" data-testid="doctor-day-schedule">
        {section(`Today · ${dateLabel(0)}`, today, 'No visits today.')}
        {section(`Tomorrow · ${dateLabel(1)}`, tomorrow, 'No visits tomorrow.')}
      </Card>
    </section>
  );
};

export default DoctorDaySchedule;
