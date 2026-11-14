// Builds the "life-cycle logs" section of the AI assistant's context:
// medicines, labour & birth record, baby tracker, recent contractions and
// kick counts. Pure function over database rows so it can be unit-tested.
// Times are given in UTC; the assistant is told so.

type Row = Record<string, unknown>;

export interface LifeContextInput {
  now: Date;
  medications: Row[]; // active medications
  events: Row[]; // life_events from the last 7 days, any kind
  birth: Row | null; // latest birth record
  babies: Row[];
}

const iso = (v: unknown) => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16).replace('T', ' ');
};
const mins = (a: unknown, b: unknown) => (Date.parse(String(b)) - Date.parse(String(a))) / 60000;
const fmtMin = (m: number) => {
  const h = Math.floor(m / 60); const r = Math.round(m % 60);
  return h === 0 ? `${r}m` : r === 0 ? `${h}h` : `${h}h ${r}m`;
};
const dataOf = (e: Row): Row => {
  const d = e.data;
  if (typeof d === 'string') { try { return JSON.parse(d) as Row; } catch { return {}; } }
  return (d && typeof d === 'object') ? d as Row : {};
};
const clean = (v: unknown, max = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function buildLifeContext({ now, medications, events, birth, babies }: LifeContextInput): string {
  const out: string[] = [];
  const nowMs = now.getTime();
  const within = (e: Row, hours: number) => nowMs - Date.parse(String(e.occurred_at)) <= hours * 3600_000;
  const ofKind = (k: string) => events.filter(e => e.kind === k);

  // Medicines & supplements
  if (medications.length) {
    out.push('\n## Medicines & supplements (logged by the patient)');
    const doses = ofKind('med_dose');
    for (const m of medications.slice(0, 15)) {
      const mine = doses.filter(d => dataOf(d).medication_id === m.id);
      const times = Array.isArray(m.reminder_times) && m.reminder_times.length ? `, reminders ${(m.reminder_times as string[]).join(', ')}` : '';
      const last = mine.length ? `, last taken ${iso(mine[0].occurred_at)} UTC` : '';
      out.push(`- ${clean(m.name)}${m.dose ? ` ${clean(m.dose, 40)}` : ''}${times}; taken ${mine.length} time(s) in the last 7 days${last}`);
    }
  }

  // Labour & birth
  if (birth) {
    out.push('\n## Labour & birth record');
    const parts = [
      birth.birth_at ? `born ${iso(birth.birth_at)} UTC` : null,
      birth.labour_started_at ? `labour started ${iso(birth.labour_started_at)} UTC` : null,
      birth.delivery_type ? clean(birth.delivery_type) : null,
      Array.isArray(birth.pain_relief) && birth.pain_relief.length ? `pain relief: ${(birth.pain_relief as string[]).join(', ')}` : null,
      birth.birth_weight_g ? `birth weight ${birth.birth_weight_g} g` : null,
      birth.birth_length_cm ? `length ${birth.birth_length_cm} cm` : null,
      birth.apgar_1 != null || birth.apgar_5 != null ? `Apgar ${birth.apgar_1 ?? '?'}/${birth.apgar_5 ?? '?'}` : null,
      birth.place ? `place: ${clean(birth.place)}` : null,
    ].filter(Boolean);
    if (parts.length) out.push(`- ${parts.join('; ')}`);
    if (birth.complications) out.push(`- Complications noted: ${clean(birth.complications, 300)}`);
    const meds = ofKind('labour_med');
    if (meds.length) out.push(`- Medicines during labour: ${meds.map(e => `${clean(dataOf(e).name, 40)}${dataOf(e).dose ? ` ${clean(dataOf(e).dose, 20)}` : ''} at ${iso(e.occurred_at)}`).join('; ')}`);
  }

  // Baby tracker, per baby
  for (const b of babies.slice(0, 3)) {
    const mine = events.filter(e => e.baby_id === b.id);
    if (!mine.length && !b.birth_date) continue;
    out.push(`\n## Baby: ${clean(b.name, 40)}${b.birth_date ? ` (born ${clean(b.birth_date, 10)})` : ''}`);
    const feeds24 = mine.filter(e => e.kind === 'feed' && within(e, 24));
    if (feeds24.length) {
      const m = (k: string) => feeds24.filter(f => dataOf(f).method === k).length;
      const ml = feeds24.reduce((s, f) => s + (Number(dataOf(f).ml) > 0 ? Number(dataOf(f).ml) : 0), 0);
      const starts = feeds24.map(f => Date.parse(String(f.occurred_at))).sort((a, c) => a - c);
      const gaps = starts.slice(1).map((t, i) => (t - starts[i]) / 60000).filter(g => g > 0 && g <= 720);
      const gapTxt = gaps.length ? `, average gap ${fmtMin(gaps.reduce((s, g) => s + g, 0) / gaps.length)}, longest ${fmtMin(Math.max(...gaps))}` : '';
      out.push(`- Last 24h feeds: ${feeds24.length} (left ${m('breast_l')}, right ${m('breast_r')}, bottle ${m('bottle')}${ml ? `, ${ml} ml` : ''})${gapTxt}`);
    }
    const feeds7 = mine.filter(e => e.kind === 'feed').length;
    if (feeds7) out.push(`- Feeds logged in the last 7 days: ${feeds7}`);
    const nap24 = mine.filter(e => e.kind === 'nappy' && within(e, 24));
    if (nap24.length) {
      const t = (x: string) => nap24.filter(n => dataOf(n).type === x).length;
      out.push(`- Last 24h nappies: ${t('wet') + t('both')} wet, ${t('dirty') + t('both')} dirty`);
    }
    const sleep24 = mine.filter(e => e.kind === 'baby_sleep' && e.ended_at && within(e, 24));
    if (sleep24.length) out.push(`- Last 24h sleep: ${fmtMin(sleep24.reduce((s, e) => s + Math.max(0, mins(e.occurred_at, e.ended_at)), 0))} over ${sleep24.length} sleeps`);
    const growth = mine.filter(e => e.kind === 'baby_growth');
    if (growth.length) {
      const g = dataOf(growth[0]);
      out.push(`- Latest growth (${iso(growth[0].occurred_at).slice(0, 10)}): ${[g.weight_g ? `${g.weight_g} g` : null, g.length_cm ? `${g.length_cm} cm long` : null, g.head_cm ? `head ${g.head_cm} cm` : null].filter(Boolean).join(', ')}`);
    }
    const vax = mine.filter(e => e.kind === 'baby_vaccine');
    if (vax.length) out.push(`- Vaccines logged (last 7 days): ${vax.map(v => `${clean(dataOf(v).name, 40)} ${iso(v.occurred_at).slice(0, 10)}`).join('; ')}`);
  }

  // Pregnancy self-monitoring (last 48h)
  const contr = ofKind('contraction').filter(e => within(e, 48) && e.ended_at);
  if (contr.length) {
    const durs = contr.map(e => mins(e.occurred_at, e.ended_at) * 60);
    const starts = contr.map(e => Date.parse(String(e.occurred_at))).sort((a, c) => a - c);
    const gaps = starts.slice(1).map((t, i) => (t - starts[i]) / 60000);
    out.push('\n## Pregnancy self-monitoring (last 48h)');
    out.push(`- Contractions timed: ${contr.length}, average length ${Math.round(durs.reduce((s, d) => s + d, 0) / durs.length)} s${gaps.length ? `, average start-to-start ${fmtMin(gaps.reduce((s, g) => s + g, 0) / gaps.length)}` : ''}, latest ${iso(contr[0].occurred_at)} UTC`);
  }
  const kicks = ofKind('kick_session').filter(e => within(e, 48) && e.ended_at);
  if (kicks.length) {
    if (!contr.length) out.push('\n## Pregnancy self-monitoring (last 48h)');
    const k = kicks[0];
    out.push(`- Latest kick count: ${Number(dataOf(k).count) || 0} movements in ${fmtMin(mins(k.occurred_at, k.ended_at))} (${iso(k.occurred_at)} UTC); ${kicks.length} session(s) in 48h`);
  }

  if (!out.length) return '';
  return `${out.join('\n')}\n(Logs above are self-reported by the patient in the app; times in UTC.)\n`;
}
