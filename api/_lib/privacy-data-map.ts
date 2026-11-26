// The one list of every database table that holds data about a person,
// and what "Download my data" (api/_routes/me/export.ts) and "Delete my
// account" (api/_routes/me/delete-account.ts) do with it.
//
// api/_lib/privacy-coverage.test.ts reads db/migrations and the /api/db
// ownership map and FAILS when a table with a user / patient / doctor id
// or an email column is not listed here, or when export.ts / delete-
// account.ts does not touch a table the way this list says. Adding a new
// personal table therefore means: add it here, add it to export and to
// delete-account, and add a row to docs/privacy-data-map.md.
//
// export:  'rows'     = her rows are in the export file
//          'excluded' = not exported; `why` says why (no personal content,
//                       secret, or someone else's record)
// erase:   'delete'    = her rows are deleted
//          'pseudonymise' = the row is kept, the parts that identify her are
//                        removed or replaced by a one-way hash (`why` says why it is kept)
//          'view'      = a database view, nothing stored of its own

export type ExportRule = 'rows' | 'excluded';
export type EraseRule = 'delete' | 'pseudonymise' | 'view';

export interface TableRule {
  export: ExportRule;
  erase: EraseRule;
  why?: string;
}

export const PRIVACY_TABLES: Record<string, TableRule> = {
  // Account
  auth_users: { export: 'rows', erase: 'delete', why: 'password_hash is never exported' },
  auth_sessions: { export: 'rows', erase: 'delete', why: 'exported without the session id' },
  profiles: { export: 'rows', erase: 'delete' },
  user_roles: { export: 'rows', erase: 'delete' },
  consent_log: { export: 'rows', erase: 'delete', why: 'migration 024; deleted with the account (no processing remains to justify)' },
  newsletter_subscribers: { export: 'rows', erase: 'delete', why: 'keyed by email, matched through auth_users' },

  // Health records
  health_documents: { export: 'rows', erase: 'delete', why: 'file bytes are in Vercel Blob, deleted by prefix; uploaded_by_doctor_id kept on patient rows when a doctor deletes her account (provenance of the patient\'s record)' },
  document_analyses: { export: 'rows', erase: 'delete' },
  medical_extracted_data: { export: 'rows', erase: 'delete' },
  current_extracted_data: { export: 'excluded', erase: 'view', why: 'a view over medical_extracted_data' },
  pending_jobs: { export: 'rows', erase: 'delete' },
  period_tracking: { export: 'rows', erase: 'delete' },
  daily_health_signals: { export: 'rows', erase: 'delete' },
  ivf_events: { export: 'rows', erase: 'delete' },
  life_events: { export: 'rows', erase: 'delete' },
  medications: { export: 'rows', erase: 'delete', why: 'SELECT * includes stopped_on (migration 018)' },
  babies: { export: 'rows', erase: 'delete' },
  birth_records: { export: 'rows', erase: 'delete' },
  birth_plans: { export: 'rows', erase: 'delete' },
  user_app_data: { export: 'rows', erase: 'delete' },
  visit_questions: { export: 'rows', erase: 'delete' },
  chat_messages: { export: 'rows', erase: 'delete' },
  llm_cache: { export: 'rows', erase: 'delete', why: 'only her summary / panel-summary entries (key embeds her id); document-analysis entries are content-addressed, shared, expire after 30 days' },

  // Doctor relationship
  patient_access_codes: { export: 'rows', erase: 'delete' },
  doctor_patient_connections: { export: 'rows', erase: 'delete' },
  appointments: { export: 'rows', erase: 'delete' },
  doctor_notes: { export: 'rows', erase: 'delete', why: 'a patient exports only notes marked visible to her; internal notes belong to the doctor' },
  chart_access_log: { export: 'rows', erase: 'delete' },
  doctor_profiles: { export: 'rows', erase: 'delete' },
  doctor_schedule: { export: 'rows', erase: 'delete' },
  consultation_settings: { export: 'rows', erase: 'delete' },

  // Phone notifications
  push_subscriptions: { export: 'rows', erase: 'delete', why: 'exported without the device keys / endpoint URL (secrets)' },
  push_sent_log: { export: 'rows', erase: 'delete' },

  // Security records
  rate_limit_counters: { export: 'excluded', erase: 'delete', why: 'only a SHA-256 hash of the id / email and a hit count, deleted after 2 days' },
  admin_audit_log: { export: 'rows', erase: 'pseudonymise', why: 'proof of who approved / rejected a doctor licence must outlive the account: her id is replaced by a one-way hash, her email, licence number and free-text reasons are removed; the action and date stay' },
  doctor_invites: { export: 'rows', erase: 'delete', why: 'the invite link sent to her email; the admin_audit_log row (anonymised) keeps the accountability trail' },
};
