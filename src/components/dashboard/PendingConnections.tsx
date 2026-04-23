import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Check, X, Stethoscope, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { errorMessage } from '@/lib/errors';

// Pending-doctor-connection approvals.
//
// A doctor who entered one of the patient's access codes shows up as
// a pending row in doctor_patient_connections. This card lists them
// with the doctor's public profile fields and lets the patient
// approve (unlocks /api/doctors/patient for that doctor) or reject
// (deletes the row). Hides itself entirely when there's nothing
// pending.

interface PendingRow {
  id: string;
  doctor_id: string;
  connection_type: string | null;
  created_at: string;
  full_name: string | null;
  title: string | null;
  specialties: string[] | null;
  years_experience: number | null;
  avatar_url: string | null;
  is_verified: boolean | null;
}

export default function PendingConnections() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const resp = await fetch('/api/connections/pending');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      setRows((payload.pending ?? []) as PendingRow[]);
    } catch (e) {
      console.error('Failed to load pending connections:', e);
    } finally {
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const respond = async (connectionId: string, action: 'approve' | 'reject') => {
    setBusyId(connectionId);
    try {
      const resp = await fetch('/api/connections/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, action }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      toast({
        title: action === 'approve' ? 'Doctor approved' : 'Request rejected',
        description: action === 'approve'
          ? 'They can now view the records you uploaded.'
          : 'The request was declined and removed.',
      });
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Something went wrong',
        description: errorMessage(error, 'Please try again.'),
      });
    } finally {
      setBusyId(null);
    }
  };

  if (!loaded || rows.length === 0) return null;

  return (
    <Card className="p-4 border-l-4 border-l-secondary">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center">
          <Stethoscope className="h-4 w-4 text-secondary" />
        </div>
        <div>
          <p className="text-sm font-semibold">
            {rows.length === 1 ? 'A doctor wants to view your records' : `${rows.length} doctors want to view your records`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Approve to let them see what you've uploaded. You can revoke access anytime.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map(r => {
          const name = [r.title, r.full_name].filter(Boolean).join(' ') || 'A doctor';
          const specialty = Array.isArray(r.specialties) && r.specialties.length > 0 ? r.specialties[0] : null;
          const ago = r.created_at ? formatDistanceToNow(new Date(r.created_at), { addSuffix: true }) : null;
          return (
            <li key={r.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              {r.avatar_url ? (
                <img
                  src={r.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                  <Stethoscope className="h-5 w-5 text-secondary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium truncate">{name}</span>
                  {r.is_verified && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-300">
                      <ShieldCheck className="h-3 w-3" />
                      Verified
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {specialty || 'Doctor'}
                  {r.years_experience ? ` · ${r.years_experience}y experience` : ''}
                  {ago ? ` · requested ${ago}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => respond(r.id, 'reject')}
                  disabled={busyId === r.id}
                >
                  <X className="h-3.5 w-3.5" />
                  Decline
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => respond(r.id, 'approve')}
                  disabled={busyId === r.id}
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
