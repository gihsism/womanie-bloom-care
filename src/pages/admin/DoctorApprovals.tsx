import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ArrowLeft, Check, X, Stethoscope, Loader2, ShieldOff, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Admin surface for managing doctor accounts.
//
// Pending: inbox for new signups, approve/reject.
// Verified: currently-approved doctors, revoke (drops their role and
// hides them from the directory).
//
// Endpoint-level authorization lives in api/admin/doctors.ts. This
// page 403-guards for UX but never for trust.

interface DoctorRow {
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

type Action = 'approve' | 'reject' | 'revoke';

function DoctorCard({
  doctor,
  busy,
  onAction,
  actions,
}: {
  doctor: DoctorRow;
  busy: boolean;
  onAction: (userId: string, action: Action, label: string) => void;
  actions: Array<{ action: Action; label: string; variant?: 'default' | 'outline' | 'destructive-outline'; icon: typeof Check }>;
}) {
  const d = doctor;
  const specialty = Array.isArray(d.specialties) && d.specialties.length > 0 ? d.specialties[0] : null;
  const ago = d.created_at ? formatDistanceToNow(new Date(d.created_at), { addSuffix: true }) : null;
  const label = d.full_name || d.email;

  return (
    <Card className="p-4">
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
        {actions.map(a => {
          const Icon = a.icon;
          const className = a.variant === 'destructive-outline'
            ? 'h-8 gap-1 text-destructive hover:text-destructive'
            : 'h-8 gap-1';
          return (
            <Button
              key={a.action}
              variant={a.variant === 'default' ? 'default' : 'outline'}
              size="sm"
              className={className}
              onClick={() => onAction(d.user_id, a.action, label)}
              disabled={busy}
            >
              <Icon className="h-3.5 w-3.5" />
              {a.label}
            </Button>
          );
        })}
      </div>
    </Card>
  );
}

export default function DoctorApprovals() {
  usePageTitle('Doctor Approvals');
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pending, setPending] = useState<DoctorRow[]>([]);
  const [approved, setApproved] = useState<DoctorRow[]>([]);
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
      setPending((payload.pending ?? []) as DoctorRow[]);
      setApproved((payload.approved ?? []) as DoctorRow[]);
    } catch (e) {
      console.error('Failed to load doctors:', e);
      toast({ variant: 'destructive', title: 'Load failed', description: 'Could not load doctors.' });
    } finally {
      setLoaded(true);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const respond = async (userId: string, action: Action, label: string) => {
    if (action === 'revoke' && !window.confirm(`Revoke ${label}'s doctor verification? They'll lose access to the doctor portal.`)) {
      return;
    }
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
      const titleByAction: Record<Action, string> = {
        approve: `Approved ${label}`,
        reject: `Rejected ${label}`,
        revoke: `Revoked ${label}`,
      };
      const descByAction: Record<Action, string> = {
        approve: 'They can now log into the doctor portal.',
        reject: 'Their signup was marked rejected.',
        revoke: 'They no longer have doctor access.',
      };
      toast({ title: titleByAction[action], description: descByAction[action] });
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Action failed',
        description: error instanceof Error ? error.message : 'Try again.',
      });
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
            <h1 className="text-base font-bold">Doctor accounts</h1>
            <p className="text-xs text-muted-foreground">
              {pending.length} pending · {approved.length} verified
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            Pending — {pending.length}
          </h2>
          {pending.length === 0 ? (
            <Card className="p-4 text-center text-sm text-muted-foreground">
              No pending signups.
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map(d => (
                <DoctorCard
                  key={d.user_id}
                  doctor={d}
                  busy={busyId === d.user_id}
                  onAction={respond}
                  actions={[
                    { action: 'reject', label: 'Reject', variant: 'destructive-outline', icon: X },
                    { action: 'approve', label: 'Approve', variant: 'default', icon: Check },
                  ]}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified — {approved.length}
          </h2>
          {approved.length === 0 ? (
            <Card className="p-4 text-center text-sm text-muted-foreground">
              No verified doctors yet.
            </Card>
          ) : (
            <div className="space-y-3">
              {approved.map(d => (
                <DoctorCard
                  key={d.user_id}
                  doctor={d}
                  busy={busyId === d.user_id}
                  onAction={respond}
                  actions={[
                    { action: 'revoke', label: 'Revoke', variant: 'destructive-outline', icon: ShieldOff },
                  ]}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
