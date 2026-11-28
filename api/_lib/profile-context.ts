// The "Patient: ..." lines at the top of the AI assistant's context.
// Stage anchors are given only for the stage she is in now: profiles keep
// pregnancy_due_date and ivf_phase after she moves on (IVF -> pregnancy is
// the usual path), and a stale "IVF phase: stimulation" made the assistant
// tell a 31-weeks-pregnant user she was "in IVF stimulation".

type Row = Record<string, unknown>;

const DAY = 86_400_000;

// A date as a whole-day number (UTC calendar date). Profile dates come
// back from the database as 'YYYY-MM-DD' or as a Date at UTC midnight.
function dayNumber(v: unknown): number | null {
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY;
}

// "Today" as her calendar date. The app sends her local date; it is
// trusted only when it is within a day of the server clock, otherwise
// the server's UTC date is used. Counting from the current UTC time
// instead made "days to go" one short every evening in Europe.
export function todayNumber(now: Date, clientToday?: unknown): number {
  const server = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / DAY;
  if (typeof clientToday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(clientToday)) {
    const c = dayNumber(clientToday);
    if (c != null && Math.abs(c - server) <= 1) return c;
  }
  return server;
}

export function buildProfileContext(profile: Row, now: Date, clientToday?: unknown): string {
  const today = todayNumber(now, clientToday);
  const stage = typeof profile.life_stage === 'string' ? profile.life_stage : '';
  // First name only: enough to address her, and her surname adds nothing
  // to an answer (less personal data sent to the model provider).
  const firstName = typeof profile.full_name === 'string' ? profile.full_name.trim().split(/\s+/)[0] : '';
  let out = `Patient: ${firstName || 'Unknown'}, Life stage: ${stage || 'Not specified'}`;

  if (stage === 'pregnancy' && profile.pregnancy_due_date) {
    const due = new Date(profile.pregnancy_due_date as string);
    const dueDay = dayNumber(profile.pregnancy_due_date);
    if (dueDay != null) {
      const daysUntilDue = dueDay - today;
      const totalDays = 280 - daysUntilDue;
      const weeksPregnant = Math.max(0, Math.min(42, Math.floor(totalDays / 7)));
      const daysExtra = Math.max(0, totalDays % 7);
      out += `\nPregnancy: due ${due.toISOString().split('T')[0]} (week ${weeksPregnant}${daysExtra ? ` + ${daysExtra}d` : ''}, ${daysUntilDue} days to go)`;
    }
  }
  if (stage === 'ivf' && profile.ivf_phase) {
    out += `\nIVF phase: ${profile.ivf_phase}`;
    if (profile.ivf_start_date) {
      const startDay = dayNumber(profile.ivf_start_date);
      if (startDay != null) {
        const days = Math.max(0, today - startDay);
        out += ` (day ${days + 1} of journey)`;
      }
    }
  }
  return out + '\n\n';
}
