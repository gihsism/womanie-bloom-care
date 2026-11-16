// Lab results that belong on the current Home page. In pregnancy only
// results dated within this pregnancy count — a cholesterol test from two
// years ago is not pregnancy information. Undated results are left out
// there too (we can't tell when they were taken). `since` = null means no
// window (all other modes).
export function withinWindow<T extends { date_recorded?: string | null }>(rows: T[], since: Date | null | undefined): T[] {
  if (!since) return rows;
  const t = since.getTime();
  return rows.filter(r => {
    if (!r.date_recorded) return false;
    const d = Date.parse(r.date_recorded);
    return Number.isFinite(d) && d >= t;
  });
}

/** Start of the current pregnancy (due date − 280 days). */
export function pregnancyStart(dueDate: Date | null | undefined): Date | null {
  return dueDate ? new Date(dueDate.getTime() - 280 * 86400000) : null;
}
