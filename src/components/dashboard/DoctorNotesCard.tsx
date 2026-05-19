import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Stethoscope, NotebookPen, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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

function noteTypeBadgeClass(type: string | null): string {
  switch ((type || '').toLowerCase()) {
    case 'diagnosis':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
    case 'treatment_plan':
    case 'treatment':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200';
    case 'recommendation':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200';
    case 'observation':
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function prettyNoteType(type: string | null): string {
  if (!type) return 'Note';
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

  if (!loaded || rows.length === 0) return null;

  const visible = showAll ? rows : rows.slice(0, VISIBLE_LIMIT);
  const hidden = rows.length - visible.length;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <NotebookPen className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {rows.length === 1 ? 'Note from your doctor' : `${rows.length} notes from your doctors`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Clinical notes your doctors have shared with you.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {visible.map(note => {
          const doctorLabel = [note.doctor_title, note.doctor_name].filter(Boolean).join(' ') || 'A doctor';
          const specialty = Array.isArray(note.doctor_specialties) && note.doctor_specialties.length > 0
            ? note.doctor_specialties[0]
            : null;
          const isExpanded = expandedId === note.id;
          const created = new Date(note.created_at);
          return (
            <li key={note.id} className="border rounded-lg p-3 bg-muted/20">
              <div className="flex items-start gap-3">
                {note.doctor_avatar_url ? (
                  <img src={note.doctor_avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Stethoscope className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium truncate">{note.title}</span>
                    <Badge
                      variant="outline"
                      className={`h-4 px-1.5 text-[9px] capitalize ${noteTypeBadgeClass(note.note_type)}`}
                    >
                      {prettyNoteType(note.note_type)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground mt-0.5">
                    <span className="truncate">{doctorLabel}</span>
                    {note.doctor_verified && (
                      <span className="inline-flex items-center gap-0.5 text-green-700 dark:text-green-300">
                        <ShieldCheck className="h-3 w-3" />
                      </span>
                    )}
                    {specialty && <span>· {specialty}</span>}
                    <span>· {formatDistanceToNow(created, { addSuffix: true })}</span>
                  </div>
                  <p className={`text-sm mt-2 whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-3'}`}>
                    {note.content}
                  </p>
                  {note.content.length > 180 && (
                    <button
                      type="button"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      onClick={() => setExpandedId(isExpanded ? null : note.id)}
                    >
                      {isExpanded ? (
                        <><ChevronUp className="h-3 w-3" />Show less</>
                      ) : (
                        <><ChevronDown className="h-3 w-3" />Show more</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {hidden > 0 && (
        <div className="mt-2 text-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowAll(true)}
          >
            Show {hidden} more
          </Button>
        </div>
      )}
      {showAll && rows.length > VISIBLE_LIMIT && (
        <div className="mt-2 text-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowAll(false)}
          >
            Show fewer
          </Button>
        </div>
      )}
    </Card>
  );
}
