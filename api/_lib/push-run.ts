import {
  planUserReminders,
  type ApptRow, type DoseRow, type MedRow, type PeriodRow, type PushPayload,
  type SubscriptionRow, type UserData, type BabyRow,
} from './push-schedule.js';
import type { SendResult } from './push-send.js';

// One scheduler run: load every opted-in device, work out each user's due
// reminders from THAT user's own rows, claim each reminder once in
// push_sent_log, send it to that user's devices only. DB and network are
// injected so the whole run is unit-tested.

export type Query = (text: string, params?: unknown[]) => Promise<unknown[]>;
export type Sender = (sub: SubscriptionRow, payload: PushPayload) => Promise<SendResult>;

export interface RunSummary { users: number; planned: number; sent: number; skippedAlreadySent: number; removedDevices: number; failed: number }

const triggerIso = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const by = <T extends { user_id?: string | null }>(rows: T[], uid: string) => rows.filter(r => r.user_id === uid);

export async function runSendDue(query: Query, send: Sender, now: Date): Promise<RunSummary> {
  const summary: RunSummary = { users: 0, planned: 0, sent: 0, skippedAlreadySent: 0, removedDevices: 0, failed: 0 };
  const subs = await query(
    'SELECT id, user_id, endpoint, p256dh, auth, timezone, prefs, updated_at FROM push_subscriptions',
  ) as SubscriptionRow[];
  const userIds = [...new Set(subs.map(s => s.user_id).filter(Boolean))];
  summary.users = userIds.length;
  if (!userIds.length) return summary;

  const since = new Date(now.getTime() - 36 * 3_600_000).toISOString();
  const until = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  // Visits since before the postnatal window (8 weeks + slack), for the
  // "6-week check booked yet?" rule: any visit after the birth hides it.
  const visitsSince = new Date(now.getTime() - 70 * 86_400_000).toISOString();
  const [meds, doses, periods, profiles, appts, triggers, appData, babies, babyVax, births, visits] = await Promise.all([
    // '*': the supply columns (ends_on, pack_size, pack_started_on) exist
    // only once migration 027 is applied; before that they are absent and
    // no run-out reminder is planned.
    query('SELECT * FROM medications WHERE active = true AND user_id = ANY($1)', [userIds]) as Promise<Array<MedRow & { user_id: string }>>,
    query(
      `SELECT user_id, data->>'medication_id' AS medication_id, occurred_at
         FROM life_events WHERE kind = 'med_dose' AND occurred_at >= $2 AND user_id = ANY($1)`,
      [userIds, since],
    ) as Promise<Array<DoseRow & { user_id: string }>>,
    query(
      `SELECT DISTINCT ON (user_id) user_id, period_start_date::text AS period_start_date, cycle_length
         FROM period_tracking WHERE user_id = ANY($1)
        ORDER BY user_id, period_start_date DESC`,
      [userIds],
    ) as Promise<Array<PeriodRow & { user_id: string }>>,
    query('SELECT id AS user_id, life_stage, pregnancy_due_date::text AS pregnancy_due_date FROM profiles WHERE id = ANY($1)', [userIds]) as Promise<Array<{ user_id: string; life_stage: string | null; pregnancy_due_date: string | null }>>,
    query(
      `SELECT id::text AS id, patient_id AS user_id, scheduled_at, status FROM appointments
        WHERE patient_id = ANY($1) AND scheduled_at >= $2 AND scheduled_at < $3
          AND COALESCE(status, 'scheduled') <> 'cancelled'`,
      [userIds, now.toISOString(), until],
    ) as Promise<Array<ApptRow & { user_id: string }>>,
    // IVF trigger shots in the next ~2 hours (migration 022). Before that
    // migration is applied the table is missing: no trigger reminders,
    // everything else still runs.
    (query(
      `SELECT user_id, trigger_at FROM ivf_plans
        WHERE user_id = ANY($1) AND trigger_at > $2 AND trigger_at <= $3`,
      [userIds, now.toISOString(), new Date(now.getTime() + 2 * 3_600_000).toISOString()],
    ) as Promise<Array<{ user_id: string; trigger_at: string | Date | null }>>).catch(() => []),
    // The check-up reminders below: a failed read gives null ("unknown"), and
    // the planner then skips that reminder rather than guess (a vaccination
    // she already marked must not be pushed). Medicine / period / visit
    // reminders always run.
    (query(
      `SELECT user_id, key, value FROM user_app_data
        WHERE user_id = ANY($1) AND key IN ('preg_vaccinations', 'postpartum:milestones')`,
      [userIds],
    ) as Promise<Array<{ user_id: string; key: string; value: unknown }>>).catch(() => null),
    (query('SELECT id::text AS id, user_id, name, birth_date FROM babies WHERE user_id = ANY($1)', [userIds]) as Promise<Array<BabyRow & { user_id: string }>>).catch(() => null),
    (query(
      `SELECT user_id, baby_id::text AS baby_id, MAX(occurred_at) AS last_at FROM life_events
        WHERE kind = 'baby_vaccine' AND baby_id IS NOT NULL AND user_id = ANY($1)
        GROUP BY user_id, baby_id`,
      [userIds],
    ) as Promise<Array<{ user_id: string; baby_id: string; last_at: string | Date | null }>>).catch(() => null),
    (query(
      `SELECT DISTINCT ON (user_id) user_id, birth_at FROM birth_records
        WHERE user_id = ANY($1) ORDER BY user_id, created_at DESC`,
      [userIds],
    ) as Promise<Array<{ user_id: string; birth_at: string | Date | null }>>).catch(() => null),
    (query(
      `SELECT patient_id AS user_id, scheduled_at FROM appointments
        WHERE patient_id = ANY($1) AND scheduled_at >= $2
          AND COALESCE(status, 'scheduled') <> 'cancelled'`,
      [userIds, visitsSince],
    ) as Promise<Array<{ user_id: string; scheduled_at: string | Date }>>).catch(() => null),
  ]);

  for (const uid of userIds) {
    const data: UserData = {
      userId: uid,
      lifeStage: by(profiles, uid)[0]?.life_stage ?? null,
      meds: by(meds, uid),
      doses: by(doses, uid),
      period: by(periods, uid)[0] ?? null,
      appointments: by(appts, uid),
      ivfTriggerAt: triggerIso(by(triggers, uid)[0]?.trigger_at),
      pregnancyDueDate: by(profiles, uid)[0]?.pregnancy_due_date ?? null,
      // undefined = could not be read (skip); null = nothing saved.
      pregVaccines: appData ? by(appData, uid).find(r => r.key === 'preg_vaccinations')?.value ?? null : undefined,
      postpartumMilestones: appData ? by(appData, uid).find(r => r.key === 'postpartum:milestones')?.value ?? null : undefined,
      babies: babies && babyVax
        ? by(babies, uid).map(b => ({
          id: b.id,
          name: b.name,
          birth_date: b.birth_date ? String(b.birth_date).slice(0, 10) : null,
          lastVaccineAt: triggerIso(by(babyVax, uid).find(v => v.baby_id === b.id)?.last_at),
        }))
        : undefined,
      birthAt: births ? triggerIso(by(births, uid)[0]?.birth_at) : undefined,
      visitTimes: visits ? by(visits, uid).map(v => triggerIso(v.scheduled_at)).filter((v): v is string => !!v) : undefined,
    };
    const planned = planUserReminders(data, by(subs, uid), now);
    summary.planned += planned.length;

    for (const r of planned) {
      const claimed = await query(
        'INSERT INTO push_sent_log (user_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING key',
        [uid, r.key],
      );
      if (!claimed.length) { summary.skippedAlreadySent++; continue; }
      // Medicine: the dose slot must be new as well (an edited time is a
      // new key, but the same dose of the day). The time key stays claimed.
      if (r.slotKey) {
        const slot = await query(
          'INSERT INTO push_sent_log (user_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING key',
          [uid, r.slotKey],
        );
        if (!slot.length) { summary.skippedAlreadySent++; continue; }
      }
      let delivered = 0;
      let failed = 0;
      for (const s of r.subscriptions) {
        if (s.user_id !== uid) continue; // never another user's device
        const result = await send(s, r.payload);
        if (result === 'sent') delivered++;
        else if (result === 'gone') {
          await query('DELETE FROM push_subscriptions WHERE id = $1 AND user_id = $2', [s.id, uid]);
          summary.removedDevices++;
        } else failed++;
      }
      summary.sent += delivered;
      summary.failed += failed;
      if (delivered) {
        await query('UPDATE push_subscriptions SET last_sent_at = now() WHERE user_id = $1', [uid]);
      } else if (failed) {
        // Temporary failure everywhere: release the claim so the next run retries.
        await query('DELETE FROM push_sent_log WHERE user_id = $1 AND key = $2', [uid, r.key]);
        if (r.slotKey) await query('DELETE FROM push_sent_log WHERE user_id = $1 AND key = $2', [uid, r.slotKey]);
      }
    }
  }

  await query("DELETE FROM push_sent_log WHERE sent_at < now() - interval '60 days'");
  return summary;
}
