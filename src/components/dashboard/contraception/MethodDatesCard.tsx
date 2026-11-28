import { useEffect, useState } from 'react';
import { CalendarDays, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pushAccountData, useAccountDataVersion } from '@/lib/account-data';
import { emitHealthDataChange } from '@/lib/data-events';
import {
  METHOD_DATES_KEY, METHOD_LABELS, contraceptionRows, daysBetween, localDay, parseMethodDates, ringPatchState,
  type ContraceptionMethodId, type MethodDates,
} from '@/lib/contraceptionSchedule';
import { fmtDay, inDays } from '../ivf/ivfFormat';

// Method summary for everything but the daily pill: the dates she enters
// from her clinic card or pack (IUD check and replacement, implant end,
// injections, ring / patch cycle) and what is next. Stored per method in
// the account-synced device key contraception:{uid}:methodDates; Home's
// Today rows read the same key (lib/contraceptionSchedule.ts).

type Field = Exclude<keyof MethodDates, 'schedule'>;

const FIELDS: Record<Exclude<ContraceptionMethodId, 'pill'>, Array<{ key: Field; label: string; hint?: string }>> = {
  'iud-hormonal': [
    { key: 'fitted', label: 'Put in on' },
    { key: 'check', label: 'Check-up', hint: 'If your clinic booked a check after the fitting.' },
    { key: 'replace', label: 'Replace by', hint: 'From your clinic card or the leaflet. How long an IUD lasts depends on the device.' },
  ],
  'iud-copper': [
    { key: 'fitted', label: 'Put in on' },
    { key: 'check', label: 'Check-up', hint: 'If your clinic booked a check after the fitting.' },
    { key: 'replace', label: 'Replace by', hint: 'From your clinic card or the leaflet. How long an IUD lasts depends on the device.' },
  ],
  implant: [
    { key: 'fitted', label: 'Put in on' },
    { key: 'replace', label: 'Remove or replace by', hint: 'From your clinic card.' },
  ],
  injection: [
    { key: 'last', label: 'Last injection' },
    { key: 'next', label: 'Next injection', hint: 'The date your clinic gave you. It depends on the product, so the app does not work it out.' },
  ],
  ring: [
    { key: 'cycleStart', label: 'Current ring went in on', hint: 'Day 1 of this cycle.' },
  ],
  patch: [
    { key: 'cycleStart', label: 'First patch of this cycle on', hint: 'Day 1 of this cycle.' },
  ],
};

function readAll(userId: string) {
  try { return parseMethodDates(localStorage.getItem(METHOD_DATES_KEY(userId))); } catch { return {}; }
}

export default function MethodDatesCard({ userId, method, now = new Date() }: { userId: string; method: Exclude<ContraceptionMethodId, 'pill'>; now?: Date }) {
  const key = METHOD_DATES_KEY(userId);
  const version = useAccountDataVersion([key]);
  const [all, setAll] = useState(() => readAll(userId));
  useEffect(() => { setAll(readAll(userId)); }, [userId, version]);
  const dates: MethodDates = all[method] ?? {};
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MethodDates>(dates);

  const today = localDay(now);
  const isCycle = method === 'ring' || method === 'patch';
  const own = isCycle && dates.schedule === 'own';
  const cycle = isCycle ? ringPatchState(method, dates, today) : null;
  const rows = contraceptionRows(method, dates, now);
  const fields = FIELDS[method];
  const anySet = fields.some(f => !!dates[f.key]) || !!dates.nextChange;

  const save = () => {
    const clean: MethodDates = {};
    for (const f of [...fields.map(f => f.key), 'nextChange' as Field]) if (draft[f]) clean[f] = draft[f];
    if (isCycle) clean.schedule = draft.schedule === 'own' ? 'own' : 'usual';
    const next = { ...all, [method]: clean };
    try {
      localStorage.setItem(key, JSON.stringify(next));
      pushAccountData(userId, key);
    } catch { /* private mode: kept for this visit only */ }
    setAll(parseMethodDates(next));
    setEditing(false);
    emitHealthDataChange();
  };

  const startEdit = () => { setDraft({ schedule: 'usual', ...dates }); setEditing(true); };
  const until = (d: string) => inDays(daysBetween(today, d));

  return (
    <Card className="p-4 space-y-3" data-testid="method-dates">
      <h4 className="font-semibold flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        Your {METHOD_LABELS[method].toLowerCase().replace('iud', 'IUD')} dates
      </h4>

      {!anySet && !editing && (
        <p className="text-sm text-muted-foreground">
          {isCycle
            ? `Add the day this cycle started and the app shows your ${method} change days, with a note on Home when one is due.`
            : 'Add the dates from your clinic card. Home shows a note when a check or change is coming up.'}
        </p>
      )}

      {anySet && !editing && (
        <dl className="text-sm space-y-1">
          {isCycle && cycle?.cycleDay != null && (
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Cycle day</dt><dd className="tabular-nums">{cycle.cycleDay} of 28</dd></div>
          )}
          {isCycle && cycle?.next && (
            <div className="flex justify-between gap-2" data-testid="method-next">
              <dt className="text-muted-foreground">Next</dt>
              <dd className="text-right">{cycle.next.label} · {fmtDay(cycle.next.date)} <span className="text-muted-foreground">({cycle.next.daysUntil < 0 ? 'date passed' : until(cycle.next.date)})</span></dd>
            </div>
          )}
          {!own && fields.map(f => dates[f.key] ? (
            <div key={f.key} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="text-right tabular-nums">{fmtDay(dates[f.key]!)}</dd>
            </div>
          ) : null)}
        </dl>
      )}

      {rows.length > 0 && !editing && (
        <ul className="text-sm space-y-1" data-testid="method-due">
          {rows.map(r => <li key={r.id} className={r.urgent ? 'font-medium' : ''}>{r.label}</li>)}
        </ul>
      )}

      {isCycle && !own && anySet && !editing && (
        <p className="text-xs text-muted-foreground">Usual schedule: 3 weeks {method === 'ring' ? 'with the ring in' : 'with a new patch each week'}, then 1 week off. Your pack leaflet or doctor comes first.</p>
      )}

      {!editing ? (
        <Button variant="outline" size="sm" className="gap-2" onClick={startEdit} data-testid="method-edit-dates">
          <Pencil className="h-3.5 w-3.5" /> {anySet ? 'Edit dates' : 'Add your dates'}
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl bg-muted/40 p-3">
          {isCycle && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Schedule</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="method-schedule" checked={draft.schedule !== 'own'} onChange={() => setDraft({ ...draft, schedule: 'usual' })} />
                Usual: 3 weeks on, 1 week off
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="method-schedule" checked={draft.schedule === 'own'} onChange={() => setDraft({ ...draft, schedule: 'own' })} />
                My own schedule (I set the next change)
              </label>
            </fieldset>
          )}
          {(isCycle && draft.schedule === 'own'
            ? [{ key: 'nextChange' as Field, label: method === 'ring' ? 'Next ring change' : 'Next patch change', hint: 'Update it after each change.' }]
            : fields
          ).map(f => (
            <div key={f.key} className="space-y-1">
              <label htmlFor={`method-${f.key}`} className="text-sm font-medium">{f.label}</label>
              <Input
                id={`method-${f.key}`}
                type="date"
                value={draft[f.key] ?? ''}
                onChange={e => setDraft({ ...draft, [f.key]: e.target.value || null })}
              />
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Leave out any date you don't have. Your clinic's advice always comes first; this is your own overview.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} data-testid="method-save-dates">Save dates</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
