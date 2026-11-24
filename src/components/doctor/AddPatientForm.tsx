import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ACCESS_CODE_MAX, isAccessCodeComplete, normalizeAccessCode } from '@/lib/doctorDashboard';

// "Add a patient": the doctor types the 8-character code the patient
// created under Share with doctor. The server redeems it and creates a
// PENDING connection; the patient still has to approve it before the
// doctor can open her chart.

interface Props {
  onAdded: () => void;
  onClose: () => void;
}

const AddPatientForm = ({ onAdded, onClose }: Props) => {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAccessCodeComplete(code)) return;
    setBusy(true);
    try {
      const resp = await fetch('/api/connections/redeem-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const title = resp.status === 404 ? 'Code not found'
          : resp.status === 409 ? 'Already connected'
          : resp.status === 403 ? 'Not allowed'
          : 'Could not add the patient';
        toast({ variant: 'destructive', title, description: data.error || 'Please check the code and try again.' });
        return;
      }
      toast({ title: 'Request sent', description: 'You can open her chart once she approves.' });
      setCode('');
      onAdded();
      onClose();
    } catch (error) {
      console.error('Error submitting code:', error);
      toast({ variant: 'destructive', title: 'Could not add the patient', description: 'Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-4">
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="patient-code" className="text-[17px] font-semibold block">
          Patient's access code
        </label>
        <p className="text-[14px] text-muted-foreground">
          The patient creates it in Womanie under “Share with doctor”.
        </p>
        <div className="flex gap-2">
          <input
            id="patient-code"
            type="text"
            autoComplete="off"
            autoFocus
            placeholder="e.g. ABCD2345"
            value={code}
            onChange={e => setCode(normalizeAccessCode(e.target.value))}
            maxLength={ACCESS_CODE_MAX + 4}
            className="flex-1 min-w-0 h-[3.25rem] px-4 text-[17px] font-semibold border border-input rounded-full focus:outline-none focus:ring-2 focus:ring-stage-accent bg-background tracking-widest"
          />
          <button type="submit" disabled={!isAccessCodeComplete(code) || busy} className="btn-stage shrink-0">
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </div>
        <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={onClose}>
          Cancel
        </Button>
      </form>
    </div>
  );
};

export default AddPatientForm;
