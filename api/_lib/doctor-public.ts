// What a patient may see about a doctor. Every patient-facing doctor
// endpoint (directory, profile page) builds its response through these
// functions, which copy named fields only: a row that carries email,
// phone, licence number, verification status or any internal flag can
// never leak just because a SELECT grew a column.

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

export interface PublicDoctor {
  user_id: string;
  full_name: string;
  title: string | null;
  specialties: string[];
  years_experience: number | null;
  bio: string | null;
  avatar_url: string | null;
  rating: number | null;
  review_count: number | null;
  languages: string[];
  credentials: string[];
  practice_address: string | null;
  // Only approved doctors are ever returned, so this is always true; kept
  // because the cards show the "verified" tick from it.
  is_verified: true;
}

export function publicDoctor(d: Row): PublicDoctor {
  return {
    user_id: String(d.user_id),
    full_name: str(d.full_name) ?? 'Doctor',
    title: str(d.title),
    specialties: strList(d.specialties),
    years_experience: num(d.years_experience),
    bio: str(d.bio),
    avatar_url: str(d.avatar_url),
    rating: num(d.rating),
    review_count: num(d.review_count),
    languages: strList(d.languages),
    credentials: strList(d.credentials),
    practice_address: str(d.practice_address),
    is_verified: true,
  };
}

export type VisitType = 'video' | 'in_person';

export interface PublicConsultation {
  consultation_price: number | null;
  currency: string;
  consultation_duration: number;
  video_enabled: boolean;
  is_available: true;
  visit_types: VisitType[];
}

export function publicConsultation(s: Row): PublicConsultation {
  const duration = num(s.consultation_duration);
  const video = s.video_enabled !== false;
  return {
    consultation_price: num(s.consultation_price),
    currency: str(s.currency) ?? 'CHF',
    consultation_duration: duration && duration > 0 ? Math.min(Math.floor(duration), 240) : 30,
    video_enabled: video,
    is_available: true,
    visit_types: video ? ['in_person', 'video'] : ['in_person'],
  };
}

export interface PublicScheduleRow { day_of_week: number; start_time: string; end_time: string; is_active: boolean }

export function publicSchedule(rows: unknown): PublicScheduleRow[] {
  let list: unknown = rows;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = []; }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((r): r is Row => !!r && typeof r === 'object' && (r as Row).is_active !== false)
    .map(r => ({
      day_of_week: Number(r.day_of_week),
      start_time: String(r.start_time ?? ''),
      end_time: String(r.end_time ?? ''),
      is_active: true,
    }))
    .filter(r => Number.isInteger(r.day_of_week) && r.day_of_week >= 0 && r.day_of_week <= 6);
}

// SQL fragment (table alias dp = doctor_profiles): an approved doctor.
// Admin approval sets is_verified=true together with
// verification_status='approved'; a revoked, rejected or pending doctor
// never shows, even if a flag was left behind.
export const APPROVED_DOCTOR_SQL =
  `dp.is_verified = true AND COALESCE(dp.verification_status, 'approved') = 'approved'`;
