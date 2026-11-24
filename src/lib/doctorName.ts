/**
 * How a clinician's name is shown to patients: their own title if they
 * set one ("Dr.", "Prof."), otherwise just the name. Find a doctor used
 * to put "Dr." before everyone, so a midwife read as "Dr. Sara Rossi",
 * and a name stored as "Dr. Laura Meier" became "Dr. Dr. Laura Meier".
 */
export function doctorDisplayName(title: string | null | undefined, fullName: string): string {
  const name = fullName.trim();
  const t = (title ?? '').trim();
  if (!t) return name;
  if (name.toLowerCase().startsWith(t.toLowerCase())) return name;
  return `${t} ${name}`;
}
