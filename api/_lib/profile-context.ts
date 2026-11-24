// The "Patient: ..." lines at the top of the AI assistant's context.
// Stage anchors are given only for the stage she is in now: profiles keep
// pregnancy_due_date and ivf_phase after she moves on (IVF -> pregnancy is
// the usual path), and a stale "IVF phase: stimulation" made the assistant
// tell a 31-weeks-pregnant user she was "in IVF stimulation".

type Row = Record<string, unknown>;

export function buildProfileContext(profile: Row, now: Date): string {
  const stage = typeof profile.life_stage === 'string' ? profile.life_stage : '';
  let out = `Patient: ${profile.full_name || 'Unknown'}, Life stage: ${stage || 'Not specified'}`;

  if (stage === 'pregnancy' && profile.pregnancy_due_date) {
    const due = new Date(profile.pregnancy_due_date as string);
    if (!Number.isNaN(due.getTime())) {
      const daysUntilDue = Math.round((due.getTime() - now.getTime()) / 86_400_000);
      const totalDays = 280 - daysUntilDue;
      const weeksPregnant = Math.max(0, Math.min(42, Math.floor(totalDays / 7)));
      const daysExtra = Math.max(0, totalDays % 7);
      out += `\nPregnancy: due ${due.toISOString().split('T')[0]} (week ${weeksPregnant}${daysExtra ? ` + ${daysExtra}d` : ''}, ${daysUntilDue} days to go)`;
    }
  }
  if (stage === 'ivf' && profile.ivf_phase) {
    out += `\nIVF phase: ${profile.ivf_phase}`;
    if (profile.ivf_start_date) {
      const startDate = new Date(profile.ivf_start_date as string);
      if (!Number.isNaN(startDate.getTime())) {
        const days = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / 86_400_000));
        out += ` (day ${days + 1} of journey)`;
      }
    }
  }
  return out + '\n\n';
}
