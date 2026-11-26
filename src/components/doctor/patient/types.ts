// Shapes returned by /api/doctors/patient (consent-gated chart fetch).

export interface PatientProfile {
  id: string;
  full_name: string | null;
  life_stage: string | null;
  pregnancy_due_date: string | null;
  ivf_phase: string | null;
}

export interface HealthSignal {
  id: string;
  signal_date: string;
  symptoms: string[] | null;
  mood: string[] | null;
  discharge: string | null;
  notes: string | null;
}

export interface HealthDocument {
  id: string;
  file_name: string;
  /** Whether there is an original file to open (via /api/docs/file). */
  has_file?: boolean;
  document_type: string;
  ai_summary: string | null;
  ai_suggested_name: string | null;
  uploaded_at: string | null;
  /** This doctor sent it into her Records ("Sent by you"). */
  sent_by_me?: boolean;
  /** The note this doctor sent with it (only on her own sends). */
  sent_note?: string | null;
}

export interface DoctorNote {
  id: string;
  title: string;
  content: string;
  note_type: string | null;
  created_at: string;
  is_visible_to_patient: boolean | null;
}

export interface PatientAppointment {
  id: string;
  scheduled_at: string;
  status: string | null;
  consultation_type: string | null;
  notes: string | null;
  duration?: number | null;
}

export interface MedicalDataRow {
  id: string;
  document_id: string;
  title: string;
  value: string | number | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  data_type: string | null;
  date_recorded: string | null;
  notes: string | null;
  raw_data: { panel?: string | null } | null;
}

export interface NoteDraft {
  title: string;
  content: string;
  note_type: string;
  is_visible_to_patient: boolean;
}

export const EMPTY_DRAFT: NoteDraft = {
  title: '',
  content: '',
  note_type: 'observation',
  is_visible_to_patient: true,
};

// Questions the patient saved for an upcoming visit with this doctor
// (read-only; table visit_questions, migration 012).
export interface PatientVisitQuestions {
  appointment_id: string;
  scheduled_at: string;
  updated_at: string | null;
  questions: unknown;
}

export interface PeriodRecord {
  period_start_date: string;
  cycle_length: number;
}

// Her active medicines (her own Medicine log), read-only.
export interface PatientMedicine {
  id: string;
  name: string;
  dose: string | null;
  times_per_day: number | null;
  started_on: string | null;
}
