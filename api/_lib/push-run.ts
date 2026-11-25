import {
  planUserReminders,
  type ApptRow, type DoseRow, type MedRow, type PeriodRow, type PushPayload,
  type SubscriptionRow, type UserData,
} from './push-schedule.js';
import type { SendResult } from './push-send.js';

// One scheduler run: load every opted-in device, work out each user's due
// reminders from THAT user's own rows, claim each reminder once in
// push_sent_log, send it to that user's devices only. DB and network are
// injected so the whole run is unit-tested.

export type Query = (text: string, params?: unknown[]) => Promise<unknown[]>;
export type Sender = (sub: SubscriptionRow, payload: PushPayload) => Promise<SendResult>;

export interface RunSummary { users: number; planned: number; sent: number; skippedAlreadySent: number; removedDevices: number; failed: number }

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
  const [meds, doses, periods, profiles, appts] = await Promise.all([
    query('SELECT id, user_id, reminder_times FROM medications WHERE active = true AND user_id = ANY($1)', [userIds]) as Promise<Array<MedRow & { user_id: string }>>,
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
    query('SELECT id AS user_id, life_stage FROM profiles WHERE id = ANY($1)', [userIds]) as Promise<Array<{ user_id: string; life_stage: string | null }>>,
    query(
      `SELECT id::text AS id, patient_id AS user_id, scheduled_at, status FROM appointments
        WHERE patient_id = ANY($1) AND scheduled_at >= $2 AND scheduled_at < $3
          AND COALESCE(status, 'scheduled') <> 'cancelled'`,
      [userIds, now.toISOString(), until],
    ) as Promise<Array<ApptRow & { user_id: string }>>,
  ]);

  for (const uid of userIds) {
    const data: UserData = {
      userId: uid,
      lifeStage: by(profiles, uid)[0]?.life_stage ?? null,
      meds: by(meds, uid),
      doses: by(doses, uid),
      period: by(periods, uid)[0] ?? null,
      appointments: by(appts, uid),
    };
    const planned = planUserReminders(data, by(subs, uid), now);
    summary.planned += planned.length;

    for (const r of planned) {
      const claimed = await query(
        'INSERT INTO push_sent_log (user_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING key',
        [uid, r.key],
      );
      if (!claimed.length) { summary.skippedAlreadySent++; continue; }
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
      }
    }
  }

  await query("DELETE FROM push_sent_log WHERE sent_at < now() - interval '60 days'");
  return summary;
}
