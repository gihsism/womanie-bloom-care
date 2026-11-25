import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { onHealthDataChange } from '@/lib/data-events';

// Notes the doctor has written and explicitly marked as visible to
// the patient. Surfaces them next to the rest of the dashboard so the
// patient actually sees the doctor's guidance — without this card, the
// visibility flag on PatientDetails has no consumer at all. Hides
// itself when there are no visible notes, so it stays out of the way
// for users who haven't yet connected with a doctor.

interface DoctorNoteRow {
  id: string;
  doctor_id: string;
  title: string;
  content: string;
  note_type: string | null;
  created_at: string;
  doctor_name: string | null;
  doctor_title: string | null;
  doctor_specialties: string[] | null;
  doctor_avatar_url: string | null;
  doctor_verified: boolean | null;
}

const VISIBLE_LIMIT = 3;

// Plain words for the note type, said in the meta line (no coloured badge).
function prettyNoteType(type: string | null): string {
  if (!type) return 'Note';
  const t = type.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function DoctorNotesCard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<DoctorNoteRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const resp = await fetch('/api/me/doctor-notes');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      setRows((payload.notes ?? []) as DoctorNoteRow[]);
    } catch (e) {
      console.error('Failed to load doctor notes:', e);
    } finally {
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  if (!loaded || rows.length === 0) return null;

  const visible = showAll ? rows : rows.slice(0, VISIBLE_LIMIT);
  const hidden = rows.length - visible.length;

  // Idea 4: a section title and one hairline list (no card around cards).
  return (
    <section className="space-y-3 mb-4">
      <h2 className="section-title">
        {rows.length === 1 ? 'Note from your doctor' : `${rows.length} notes from your doctors`}
      </h2>

      <ul className="row-group">
        {visible.map(note => {
          const doctorLabel = [note.doctor_title, note.doctor_name].filter(Boolean).join(' ') || 'A doctor';
          const isExpanded = expandedId === note.id;
          const created = new Date(note.created_at);
          return (
            <li key={note.id} className="px-4 py-3">
              <p className="text-[16px] font-semibold">{note.title}</p>
              <p className="text-[14px] text-muted-foreground mt-0.5">
                {prettyNoteType(note.note_type)} · {doctorLabel} · {formatDistanceToNow(created, { addSuffix: true })}
              </p>
              <p className={`text-[15px] leading-relaxed mt-2 whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-3'}`}>
                {note.content}
              </p>
              {note.content.length > 180 && (
                <button
                  type="button"
                  className="tap-target mt-1 inline-flex items-center gap-1 text-[14px] font-semibold text-stage-accent"
                  onClick={() => setExpandedId(isExpanded ? null : note.id)}
                >
                  {isExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {hidden > 0 && (
        <button type="button" className="tap-target block mx-auto text-[15px] font-semibold text-stage-accent" onClick={() => setShowAll(true)}>
          Show {hidden} more
        </button>
      )}
      {showAll && rows.length > VISIBLE_LIMIT && (
        <button type="button" className="tap-target block mx-auto text-[15px] font-semibold text-stage-accent" onClick={() => setShowAll(false)}>
          Show fewer
        </button>
      )}
    </section>
  );
}
