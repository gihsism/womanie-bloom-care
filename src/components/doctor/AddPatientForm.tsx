import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="patient-code" className="text-sm font-medium block">
          Patient's access code
        </label>
        <p className="text-xs text-muted-foreground">
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
            className="flex-1 min-w-0 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary bg-background tracking-widest"
          />
          <Button type="submit" disabled={!isAccessCodeComplete(code) || busy} className="bg-secondary hover:bg-secondary/90">
            {busy ? 'Sending…' : 'Send request'}
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </form>
    </Card>
  );
};

export default AddPatientForm;
