// The sub-pages of Me. Each is opened as /dashboard/settings#<id>, so the
// /dashboard/settings route keeps working and Home can deep-link to
// /dashboard/settings#life-stage (the ONLY place the life stage changes).

export const ME_SECTIONS = {
  'life-stage': 'Life stage',
  profile: 'Your profile',
  medicines: 'Medicines & supplements',
  reminders: 'Reminders',
  password: 'Password & sign-in',
  privacy: 'Privacy & your data',
} as const;

export type MeSection = keyof typeof ME_SECTIONS;

// Old names people (or other pages) may still link to.
const ALIASES: Record<string, MeSection> = {
  'life-stage-mode': 'life-stage',
  lifestage: 'life-stage',
  stage: 'life-stage',
  account: 'profile',
  'personal-info': 'profile',
  notifications: 'reminders',
  security: 'privacy',
};

/** '#life-stage' -> 'life-stage'; unknown or empty -> null (the list). */
export function meSectionFromHash(hash: string | null | undefined): MeSection | null {
  const v = (hash ?? '').replace(/^#/, '').trim().toLowerCase();
  if (!v) return null;
  if (v in ME_SECTIONS) return v as MeSection;
  return ALIASES[v] ?? null;
}
