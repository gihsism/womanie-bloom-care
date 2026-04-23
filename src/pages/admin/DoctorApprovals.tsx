import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ArrowLeft, Check, X, Stethoscope, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Minimal admin surface for approving or rejecting doctor signups.
//
// Gated at the endpoint level by ADMIN_EMAILS env check — this page is
// just UX. If /api/admin/doctors returns 403 we show a friendly
// "you're not an admin" instead of pretending to load.

interface PendingDoctor {
  user_id: string;
  email: string;
  created_at: string;
  full_name: string | null;
  specialties: string[] | null;
  license_number: string | null;
  bio: string | null;
  is_verified: boolean;
  verification_status: string;
}

export default function DoctorApprovals() {
  usePageTitle('Doctor Approvals');
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<PendingDoctor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const resp = await fetch('/api/admin/doctors');
      if (resp.status === 403) {
        setForbidden(true);
        setLoaded(true);
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      setRows((payload.pending ?? []) as PendingDoctor[]);
    } catch (e) {
      console.error('Failed to load pending doctors:', e);
      toast({ variant: 'destructive', title: 'Load failed', description: 'Could not load pending doctors.' });
    } finally {
      setLoaded(true);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const respond = async (userId: string, action: 'approve' | 'reject', label: string) => {
    setBusyId(userId);
    try {
      const resp = await fetch('/api/admin/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      toast({
        title: action === 'approve' ? `Approved ${label}` : `Rejected ${label}`,
        description: action === 'approve' ? 'They can now log into the doctor portal.' : 'Their signup was marked rejected.',
      });
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: error?.message || 'Try again.' });
    } finally {
      setBusyId(null);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 max-w-md w-full text-center space-y-3">
          <p className="text-lg font-semibold">Admin only</p>
          <p className="text-sm text-muted-foreground">
            Your account isn't on the admin list. If you believe this is wrong, check the <code className="text-xs">ADMIN_EMAILS</code> env var on Vercel.
          </p>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold">Doctor approvals</h1>
            <p className="text-xs text-muted-foreground">
              {rows.length === 0 ? 'No doctors waiting.' : `${rows.length} pending`}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 max-w-3xl mx-auto space-y-3">
        {rows.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nothing to approve right now.
          </Card>
        ) : (
          rows.map(d => {
            const specialty = Array.isArray(d.specialties) && d.specialties.length > 0 ? d.specialties[0] : null;
            const ago = d.created_at ? formatDistanceToNow(new Date(d.created_at), { addSuffix: true }) : null;
            const label = d.full_name || d.email;
            return (
              <Card key={d.user_id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                    <Stethoscope className="h-5 w-5 text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{d.full_name || '(no name)'}</p>
                    <p className="text-xs text-muted-foreground break-all">{d.email}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {specialty ? specialty : 'Specialty not set'}
                      {d.license_number ? ` · License ${d.license_number}` : ' · No license number'}
                      {ago ? ` · signed up ${ago}` : ''}
                    </p>
                    {d.bio && (
                      <p className="text-[11px] text-muted-foreground mt-2 line-clamp-3">{d.bio}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-destructive hover:text-destructive"
                    onClick={() => respond(d.user_id, 'reject', label)}
                    disabled={busyId === d.user_id}
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1"
                    onClick={() => respond(d.user_id, 'approve', label)}
                    disabled={busyId === d.user_id}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
