/** Which reminder times are due now (passed today, not yet covered by a logged dose). */
export function dueReminders(reminderTimes: string[], dosesToday: number, now: Date): string[] {
  const passed = [...reminderTimes]
    .filter(t => /^\d{2}:\d{2}$/.test(t))
    .sort()
    .filter(t => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m <= now.getHours() * 60 + now.getMinutes();
    });
  return passed.slice(dosesToday);
}
