import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Stethoscope, ShieldCheck, ShieldOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { errorMessage } from '@/lib/errors';
import { emitHealthDataChange, onHealthDataChange } from '@/lib/data-events';

// Approved doctor connections with a Revoke action. Pairs with
// PendingConnections: that one handles "doctor wants in", this one
// handles "doctor is in, I want them out".

interface Row {
  id: string;
  doctor_id: string;
  approved_at: string | null;
  full_name: string | null;
  title: string | null;
  specialties: string[] | null;
  years_experience: number | null;
  avatar_url: string | null;
  is_verified: boolean | null;
}

export default function ConnectedDoctors() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const resp = await fetch('/api/connections/approved');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      setRows((payload.approved ?? []) as Row[]);
    } catch (e) {
      console.error('Failed to load approved connections:', e);
    } finally {
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const revoke = async (connectionId: string, label: string) => {
    if (!window.confirm(`Revoke access for ${label}? They'll no longer be able to view your records.`)) return;
    setBusyId(connectionId);
    try {
      const resp = await fetch('/api/connections/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, action: 'revoke' }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      toast({ title: 'Access revoked', description: `${label} no longer has access to your records.` });
      emitHealthDataChange();
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not revoke',
        description: errorMessage(error, 'Please try again.'),
      });
    } finally {
      setBusyId(null);
    }
  };

  if (!loaded || rows.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">
            {rows.length === 1 ? 'Connected doctor' : `${rows.length} connected doctors`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            These doctors can view the records you've uploaded. Revoke any time.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map(r => {
          const name = [r.title, r.full_name].filter(Boolean).join(' ') || 'A doctor';
          const specialty = Array.isArray(r.specialties) && r.specialties.length > 0 ? r.specialties[0] : null;
          const since = r.approved_at ? `connected ${formatDistanceToNow(new Date(r.approved_at), { addSuffix: true })}` : null;
          return (
            <li key={r.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
              {r.avatar_url ? (
                <img src={r.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Stethoscope className="h-5 w-5 text-primary" />
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
                  {since ? ` · ${since}` : ''}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-destructive hover:text-destructive"
                onClick={() => revoke(r.id, name)}
                disabled={busyId === r.id}
              >
                <ShieldOff className="h-3.5 w-3.5" />
                Revoke
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
