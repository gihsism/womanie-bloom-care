// Words for a document's stored category (health_documents
// ai_suggested_category / document_type). Health statistics showed the raw
// key ("lab_results") as its badge.
const LABELS: Record<string, string> = {
  lab_results: 'Lab results',
  imaging: 'Imaging',
  prescription: 'Prescription',
  consultation_notes: 'Doctor notes',
  vaccination_record: 'Vaccinations',
  discharge_summary: 'Discharge summary',
  other: 'Other',
};

export function documentCategoryLabel(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return 'Document';
  if (LABELS[v]) return LABELS[v];
  const text = v.replace(/[_-]+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
