import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { documentFileProblem, sendDocumentToPatient, type SentDocument } from '@/lib/documentFiles';

// Doctor -> patient: send a lab report, referral letter or image into the
// patient's Records, with a short note. She gets an in-app notice and a
// discreet push ("Dr X added a document"); the file is analysed like her
// own uploads, and it stays hers (she can delete it).

const TYPES = ['Lab Result', 'Referral Letter', 'Letter', 'Imaging Report', 'Prescription', 'Medical Record', 'Other'];
const NOTE_MAX = 500;

interface Props {
  patientId: string;
  patientName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (doc: SentDocument) => void;
}

export default function SendDocumentDialog({ patientId, patientName, open, onOpenChange, onSent }: Props) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('Lab Result');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reset = () => { setFile(null); setType('Lab Result'); setNote(''); setProblem(null); };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    const p = documentFileProblem(f);
    setProblem(p);
    setFile(p ? null : f);
  };

  const send = async () => {
    if (!file || sending) return;
    setSending(true);
    try {
      const doc = await sendDocumentToPatient(patientId, file, { note: note.trim() || undefined, documentType: type });
      onSent(doc);
      toast({ title: 'Document sent', description: `${patientName || 'The patient'} can see it in her Records now.` });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not send the document',
        description: err instanceof Error && err.message ? err.message : 'Please try again.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!sending) { if (!v) reset(); onOpenChange(v); } }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Send a document</DialogTitle>
          <DialogDescription>
            It goes into {patientName ? `${patientName}'s` : 'her'} Records, marked as sent by you. PDF, DOCX or image, up to 200 MB.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="send-doc-file">File</Label>
            <Input id="send-doc-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.docx" onChange={pick} disabled={sending} />
            {problem && <p className="text-xs text-destructive" role="alert">{problem}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="send-doc-type">Type</Label>
            <Select value={type} onValueChange={setType} disabled={sending}>
              <SelectTrigger id="send-doc-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="send-doc-note">Note for her (optional)</Label>
            <Textarea
              id="send-doc-note"
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              placeholder="e.g. Your results look good, see you in 6 months."
              onChange={e => setNote(e.target.value)}
              disabled={sending}
            />
            <p className="text-xs text-muted-foreground text-right">{note.length}/{NOTE_MAX}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={!file || sending}>{sending ? 'Sending…' : 'Send to patient'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
