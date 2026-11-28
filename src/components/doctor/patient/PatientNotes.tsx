import { formatDate } from '@/lib/dateFormat';
import { useConfirm } from '@/components/ConfirmDialog';
import { deleteNoteConfirm } from '@/lib/confirmCopy';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/integrations/db/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { EMPTY_DRAFT, type DoctorNote, type NoteDraft } from './types';

// Notes tab of the doctor's patient chart: write, edit, delete notes.
// The new-note form is controlled by the page so the header's
// "Write a note" button can open it from any tab.

const NOTE_TYPES: Array<[string, string]> = [
  ['observation', 'Observation'],
  ['diagnosis', 'Diagnosis'],
  ['recommendation', 'Recommendation'],
  ['follow_up', 'Follow-up'],
];
const typeLabel = (t: string | null) => NOTE_TYPES.find(([v]) => v === t)?.[1] ?? t ?? '';

const NoteFields = ({ value, onChange, idPrefix }: { value: NoteDraft; onChange: (d: NoteDraft) => void; idPrefix: string }) => (
  <div className="space-y-3">
    <div className="space-y-1.5">
      <label htmlFor={`${idPrefix}-title`} className="text-sm font-medium">Title</label>
      <Input
        id={`${idPrefix}-title`}
        value={value.title}
        onChange={e => onChange({ ...value, title: e.target.value })}
        placeholder="e.g. Visit on 12 Nov"
      />
    </div>
    <div className="space-y-1.5">
      <label htmlFor={`${idPrefix}-content`} className="text-sm font-medium">Note</label>
      <Textarea
        id={`${idPrefix}-content`}
        value={value.content}
        onChange={e => onChange({ ...value, content: e.target.value })}
        rows={5}
      />
    </div>
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Type</span>
        <Select value={value.note_type} onValueChange={v => onChange({ ...value, note_type: v })}>
          <SelectTrigger aria-label="Note type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {NOTE_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Who can see it</span>
        <Select
          value={value.is_visible_to_patient ? 'visible' : 'hidden'}
          onValueChange={v => onChange({ ...value, is_visible_to_patient: v === 'visible' })}
        >
          <SelectTrigger aria-label="Who can see this note"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="visible">You and the patient</SelectItem>
            <SelectItem value="hidden">Only you</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
);

interface Props {
  doctorId: string;
  patientId: string;
  notes: DoctorNote[];
  formOpen: boolean;
  draft: NoteDraft;
  onDraftChange: (d: NoteDraft) => void;
  onFormOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

const PatientNotes = ({ doctorId, patientId, notes, formOpen, draft, onDraftChange, onFormOpenChange, onChanged }: Props) => {
  const { toast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<NoteDraft>(EMPTY_DRAFT);
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const add = async () => {
    if (!draft.title || !draft.content) return;
    setSaving(true);
    try {
      const { error } = await db.from('doctor_notes').insert({
        doctor_id: doctorId,
        patient_id: patientId,
        ...draft,
      });
      if (error) throw error;
      toast({ title: 'Note saved' });
      onDraftChange(EMPTY_DRAFT);
      onFormOpenChange(false);
      onChanged();
    } catch (error) {
      console.error('Error adding note:', error);
      toast({ variant: 'destructive', title: 'Could not save the note', description: 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const update = async () => {
    if (!editingId || !editing.title || !editing.content) return;
    setUpdating(true);
    try {
      const { error } = await db.from('doctor_notes').update({ ...editing }).eq('id', editingId);
      if (error) throw error;
      toast({ title: 'Note updated' });
      setEditingId(null);
      onChanged();
    } catch (error) {
      console.error('Error updating note:', error);
      toast({ variant: 'destructive', title: 'Could not update the note', description: 'Please try again.' });
    } finally {
      setUpdating(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm(deleteNoteConfirm()))) return;
    setDeletingId(id);
    try {
      const { error } = await db.from('doctor_notes').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Note deleted' });
      onChanged();
    } catch (error) {
      console.error('Error deleting note:', error);
      toast({ variant: 'destructive', title: 'Could not delete the note', description: 'Please try again.' });
    } finally {
      setDeletingId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const visible = q
    ? notes.filter(n => (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q))
    : notes;

  return (
    <div className="space-y-4">
    {confirmDialog}
      {formOpen && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New note</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <NoteFields value={draft} onChange={onDraftChange} idPrefix="new-note" />
            <div className="flex gap-2">
              <Button
                onClick={add}
                className="bg-secondary hover:bg-secondary/90"
                disabled={!draft.title || !draft.content || saving}
              >
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save note'}
              </Button>
              <Button variant="outline" onClick={() => onFormOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {notes.length > 5 && (
        <Input
          placeholder="Search notes"
          aria-label="Search notes"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      )}

      {notes.length === 0 ? (
        !formOpen && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No notes yet. Use “Write a note” at the top.
          </Card>
        )
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">No notes match “{query}”.</p>
      ) : (
        <div className="space-y-3">
          {visible.map(note => editingId === note.id ? (
            <Card key={note.id} className="p-4 bg-muted/30 space-y-3">
              <NoteFields value={editing} onChange={setEditing} idPrefix={`edit-${note.id}`} />
              <div className="flex gap-2">
                <Button size="sm" onClick={update} disabled={!editing.title || !editing.content || updating}>
                  {updating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save changes'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditingId(null)} disabled={updating}>
                  Cancel
                </Button>
              </div>
            </Card>
          ) : (
            <Card key={note.id} className="p-4">
              <div className="flex items-start justify-between mb-2 gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{note.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(note.created_at)} · {typeLabel(note.note_type)}
                  </p>
                </div>
                <Badge variant={note.is_visible_to_patient ? 'default' : 'outline'} className="shrink-0">
                  {note.is_visible_to_patient ? 'Patient can see' : 'Only you'}
                </Badge>
              </div>
              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              <div className="flex gap-1 mt-2 -ml-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={deletingId === note.id}
                  onClick={() => {
                    setEditingId(note.id);
                    setEditing({
                      title: note.title,
                      content: note.content,
                      note_type: note.note_type || 'observation',
                      is_visible_to_patient: note.is_visible_to_patient ?? true,
                    });
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => remove(note.id)}
                  disabled={deletingId === note.id}
                  aria-label={`Delete note: ${note.title}`}
                >
                  {deletingId === note.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Delete'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default PatientNotes;
