import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { pushAccountData, useAccountDataVersion } from '@/lib/account-data';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, HeartPulse, Phone } from 'lucide-react';
import {
  CHECK_ITEMS, CHECKIN_WEEKS, RECOVERY_CHECKINS_KEY, RED_FLAGS, SELF_HARM_SUPPORT, URGENT_MESSAGE,
  assessCheckin, checkItemTitle, entryForWeek, isComplete, parseCheckins, recoveryTrend,
  redFlagLabel, upsertCheckin, weekPostpartum,
  type CheckinEntry, type ItemTrend, type RedFlagId, type Score,
} from '@/lib/postpartumRecovery';

// Weekly one-minute recovery check for the first 12 weeks after birth:
// bleeding, pain, wound/stitches, pelvic floor, sleep, mood. Red flags
// (NHS) always show "call your doctor or 144 now" while they apply. Mood
// here is a quick pulse; the full EPDS mood check lives on the same page
// (#mood-check) and is linked, not duplicated. Stored per account under
// postpartum:{uid}:recovery-checkins.

const SCORE_DOT: Record<Score, string> = {
  0: 'bg-primary/40',
  1: 'bg-amber-400',
  2: 'bg-orange-500',
  3: 'bg-red-600',
};
const SCORE_WORD: Record<Score, string> = {
  0: 'as expected',
  1: 'keep an eye on it',
  2: 'talk to your Hebamme or doctor',
  3: 'urgent',
};

function UrgentBanner({ flags }: { flags: RedFlagId[] }) {
  const selfHarm = flags.includes('self-harm');
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 p-3 space-y-1.5" data-testid="recovery-urgent">
      <p className="text-sm font-semibold flex items-center gap-2 text-red-800 dark:text-red-200">
        <Phone className="h-4 w-4" />
        {URGENT_MESSAGE}
      </p>
      <ul className="text-xs text-red-900/90 dark:text-red-100/90 list-disc pl-5 space-y-0.5">
        {flags.map(f => <li key={f}>{redFlagLabel(f)}</li>)}
      </ul>
      <p className="text-xs text-red-900/80 dark:text-red-100/80">
        These can be signs of a problem that needs to be seen today. You are not overreacting by calling.
      </p>
      {selfHarm && <p className="text-xs font-medium text-red-900 dark:text-red-100">{SELF_HARM_SUPPORT}</p>}
    </div>
  );
}

function TrendDirection({ d }: { d: ItemTrend['direction'] }) {
  if (d === 'better') return <span className="inline-flex items-center gap-0.5 text-[11px] text-primary"><ArrowDownRight className="h-3 w-3" />better</span>;
  if (d === 'worse') return <span className="inline-flex items-center gap-0.5 text-[11px] text-orange-600 dark:text-orange-400"><ArrowUpRight className="h-3 w-3" />worse</span>;
  if (d === 'same') return <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><ArrowRight className="h-3 w-3" />same</span>;
  return null;
}

const goToMoodCheck = () => {
  const el = document.getElementById('mood-check');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.location.hash = 'mood-check';
};

interface Props {
  birthDate: Date;
  now?: Date;
}

const PostpartumRecoveryCheckin = ({ birthDate, now }: Props) => {
  const { user } = useAuth();
  const uid = user?.id ?? '';
  const [list, setList] = useState<CheckinEntry[]>([]);
  const [draft, setDraft] = useState<Pick<CheckinEntry, 'answers' | 'redFlags'>>({ answers: {}, redFlags: [] });
  const [editing, setEditing] = useState(false);

  const week = weekPostpartum(birthDate, now ?? new Date());
  const accountVersion = useAccountDataVersion([uid ? RECOVERY_CHECKINS_KEY(uid) : null]);
  useEffect(() => {
    if (!uid) return;
    try { setList(parseCheckins(localStorage.getItem(RECOVERY_CHECKINS_KEY(uid)))); } catch { /* ignore */ }
  }, [uid, accountVersion]);

  const thisWeek = entryForWeek(list, week);
  const showForm = editing || !thisWeek;
  const draftAssessment = useMemo(() => assessCheckin(draft), [draft]);
  const savedAssessment = useMemo(() => (thisWeek ? assessCheckin(thisWeek) : null), [thisWeek]);
  const trend = useMemo(() => recoveryTrend(list), [list]);
  const lastWeek = list.reduce((m, e) => Math.max(m, e.week), 0);

  if (week === null || week > CHECKIN_WEEKS) return null;

  const startEdit = () => {
    setDraft(thisWeek ? { answers: { ...thisWeek.answers }, redFlags: [...thisWeek.redFlags] } : { answers: {}, redFlags: [] });
    setEditing(true);
  };

  const save = () => {
    if (!isComplete(draft.answers)) return;
    const entry: CheckinEntry = { week, date: format(now ?? new Date(), 'yyyy-MM-dd'), answers: draft.answers, redFlags: draft.redFlags };
    const next = upsertCheckin(list, entry);
    setList(next);
    setEditing(false);
    if (!uid) return;
    try {
      localStorage.setItem(RECOVERY_CHECKINS_KEY(uid), JSON.stringify(next));
      pushAccountData(uid, RECOVERY_CHECKINS_KEY(uid));
    } catch { /* private mode: in memory only */ }
  };

  const toggleFlag = (id: RedFlagId, on: boolean) =>
    setDraft(d => ({ ...d, redFlags: on ? [...d.redFlags.filter(f => f !== id), id] : d.redFlags.filter(f => f !== id) }));

  const shownUrgent = showForm ? draftAssessment.urgent : savedAssessment?.urgent ?? [];

  return (
    <Card className="p-4 space-y-4" data-testid="recovery-checkin">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-primary" />
          Recovery check-in
        </h4>
        <Badge variant="outline" className="text-[10px]">Week {week} of {CHECKIN_WEEKS}</Badge>
      </div>

      {/* Red flags: while any applies, the call-now message stays up. */}
      {shownUrgent.length > 0 && <UrgentBanner flags={shownUrgent} />}

      {showForm ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            One minute, once a week. Your answers stay in your account and build a picture of how
            you're healing. Your Hebamme's home visits after the birth are covered by basic
            insurance; bring anything that worries you.
          </p>

          {CHECK_ITEMS.map(item => (
            <fieldset key={item.id} className="space-y-1.5">
              <legend className="text-sm font-medium">{item.question}</legend>
              <div className="flex flex-wrap gap-1.5">
                {item.options.map(o => {
                  const on = draft.answers[item.id] === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraft(d => ({ ...d, answers: { ...d.answers, [item.id]: o.id } }))}
                      className={`rounded-full border px-3 py-1.5 text-xs text-left transition-colors ${
                        on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground/80 hover:bg-muted/50'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {item.id === 'mood' && (
                <p className="text-[11px] text-muted-foreground">
                  For a fuller picture, the{' '}
                  <button type="button" onClick={goToMoodCheck} className="underline underline-offset-2 hover:text-foreground">mood check (EPDS)</button>{' '}
                  on this page takes two minutes.
                </p>
              )}
            </fieldset>
          ))}

          <fieldset className="space-y-2 rounded-lg bg-muted/40 p-3">
            <legend className="text-sm font-medium px-1">Any of these right now?</legend>
            {RED_FLAGS.map(f => (
              <label key={f.id} className="flex items-start gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={draft.redFlags.includes(f.id)}
                  onCheckedChange={v => toggleFlag(f.id, v === true)}
                  aria-label={f.label}
                  className="mt-0.5"
                />
                <span>{f.label}</span>
              </label>
            ))}
          </fieldset>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={!isComplete(draft.answers)}>Save this week</Button>
            {editing && thisWeek && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
            {!isComplete(draft.answers) && (
              <span className="text-[11px] text-muted-foreground">Answer all six to save.</span>
            )}
          </div>
        </div>
      ) : savedAssessment && (
        <div className="space-y-2.5">
          {savedAssessment.level === 'ok' && (
            <p className="text-sm">Everything you noted this week sounds like normal healing. Keep resting when you can.</p>
          )}
          {savedAssessment.talk.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
              <p className="text-xs">
                <span className="font-medium">Mention to your Hebamme or doctor in the next day or two:</span>{' '}
                {savedAssessment.talk.map(checkItemTitle).join(', ').toLowerCase()}. It is common and there is help for it.
              </p>
            </div>
          )}
          {savedAssessment.watch.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Keep an eye on: {savedAssessment.watch.map(checkItemTitle).join(', ').toLowerCase()}. If it isn't easing
              by next week, bring it up at your next visit.
            </p>
          )}
          {savedAssessment.suggestEpds && (
            <Button size="sm" variant="outline" onClick={goToMoodCheck}>Take the mood check (EPDS)</Button>
          )}
          <div>
            <button type="button" onClick={startEdit} className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Change this week's answers
            </button>
          </div>
        </div>
      )}

      {lastWeek >= 1 && (
        <div className="space-y-2" data-testid="recovery-trend">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Over the weeks</p>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-normal pr-3 py-1">Week</th>
                  {trend[0].points.map(p => <th key={p.week} className="font-normal w-6 text-center">{p.week}</th>)}
                  <th className="pl-2" />
                </tr>
              </thead>
              <tbody>
                {trend.map(t => (
                  <tr key={t.item}>
                    <td className="pr-3 py-1 whitespace-nowrap">{t.title}</td>
                    {t.points.map(p => (
                      <td key={p.week} className="text-center">
                        {p.score === null
                          ? <span className="text-muted-foreground/50" aria-label={`Week ${p.week}: no check`}>·</span>
                          : <span className={`inline-block h-2.5 w-2.5 rounded-full ${SCORE_DOT[p.score]}`} aria-label={`Week ${p.week}: ${SCORE_WORD[p.score]}`} />}
                      </td>
                    ))}
                    <td className="pl-2 whitespace-nowrap"><TrendDirection d={t.direction} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
            {([0, 1, 2] as Score[]).map(s => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded-full ${SCORE_DOT[s]}`} />{SCORE_WORD[s]}
              </span>
            ))}
          </p>
        </div>
      )}

      {/* Always visible, per NHS: these never wait for next week's check. */}
      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
        <Phone className="h-3 w-3 mt-0.5 flex-shrink-0" />
        Heavy bleeding, fever, a painful swollen leg, chest pain or thoughts of harming yourself: call your doctor or 144 now, any day of the week.
      </p>
    </Card>
  );
};

export default PostpartumRecoveryCheckin;
