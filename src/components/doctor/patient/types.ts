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
  file_path?: string | null;
  document_type: string;
  ai_summary: string | null;
  ai_suggested_name: string | null;
  uploaded_at: string | null;
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

export interface PeriodRecord {
  period_start_date: string;
  cycle_length: number;
}
