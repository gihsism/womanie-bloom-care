import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  ArrowLeft, Check, X, Stethoscope, Loader2, ShieldOff, ShieldCheck, ExternalLink, Copy,
  Mail, Link2, History, Ban,
} from '@/components/icons';
import { formatDistanceToNow, format } from 'date-fns';

// Admin surface for getting doctors onboard.
//
//   Invite a doctor  - one-time 7-day link for one email (/api/admin/invites);
//                      the invited signup is approved straight away.
//   Pending          - the verification queue: licence/GLN with a format
//                      hint, a link to MedReg to look the doctor up (link
//                      only, no scraping), approve or reject with a reason.
//   Verified         - revoke (reason required).
//   Rejected/revoked - the reason the doctor sees; can be approved later.
//   Activity         - admin_audit_log: who did what, when.
//
// The doctor learns the decision in the app: a rejected/revoked doctor
// sees the reason on the doctor login screen. "Email the doctor" opens the
// admin's own mail app with a pre-written note (no email provider).
//
// Authorization lives in api/_routes/admin/* (ADMIN_EMAILS + an account
// signed in with Google at least once). This page only mirrors the 403.

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
  verification_note?: string | null;
  verified_at?: string | null;
  gln_check?: 'valid' | 'bad_check_digit' | 'not_a_gln';
}

interface InviteRow {
  id: string;
  email: string;
  note: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  status: 'open' | 'used' | 'revoked' | 'expired';
}

interface LogRow {
  id: string;
  admin_email: string | null;
  action: string;
  target_email: string | null;
  detail: { reason?: string | null } | null;
  created_at: string;
}

type Action = 'approve' | 'reject' | 'revoke';

const DEFAULT_MEDREG = 'https://www.medregom.admin.ch/';

const ACTION_LABEL: Record<string, string> = {
  doctor_approve: 'approved',
  doctor_reject: 'rejected',
  doctor_revoke: 'revoked',
  invite_create: 'invited',
  invite_revoke: 'cancelled the invite for',
  invite_redeemed: 'invite used by',
};

function mailto(to: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function decisionMail(action: Action, email: string, name: string, reason: string) {
  if (action === 'approve') {
    return mailto(email, 'Your Womanie doctor account is approved',
      `Dear ${name},\n\nyour licence is verified and your Womanie doctor account is active. Log in at https://womanie.info/auth/doctor-login: the setup checklist walks you through your profile, consultation hours and bookings.\n\nBest regards,\nWomanie`);
  }
  return mailto(email, 'Your Womanie doctor account',
    `Dear ${name},\n\nwe could not ${action === 'reject' ? 'verify' : 'keep verifying'} your doctor account. Reason: ${reason}\n\nReply to this email with updated licence details and we will check again.\n\nBest regards,\nWomanie`);
}

function GlnHint({ check }: { check?: DoctorRow['gln_check'] }) {
  if (check === 'valid') return <span className="text-[11px] text-green-700 dark:text-green-400">GLN format OK</span>;
  if (check === 'bad_check_digit') return <span className="text-[11px] text-destructive">GLN check digit wrong: likely a typo</span>;
  return <span className="text-[11px] text-muted-foreground">Not a 13-digit GLN: check by name</span>;
}

function DoctorCard({
  doctor,
  busy,
  medregUrl,
  onAction,
  actions,
}: {
  doctor: DoctorRow;
  busy: boolean;
  medregUrl: string;
  onAction: (d: DoctorRow, action: Action, reason: string) => void;
  actions: Action[];
}) {
  const { toast } = useToast();
  const d = doctor;
  const [reasonFor, setReasonFor] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const specialty = Array.isArray(d.specialties) && d.specialties.length > 0 ? d.specialties[0] : null;
  const ago = d.created_at ? formatDistanceToNow(new Date(d.created_at), { addSuffix: true }) : null;

  const copyGln = async () => {
    if (!d.license_number) return;
    try {
      await navigator.clipboard.writeText(d.license_number.replace(/[\s.-]/g, ''));
      toast({ title: 'Copied', description: 'Paste it into the MedReg search.' });
    } catch {
      toast({ variant: 'destructive', title: 'Could not copy' });
    }
  };

  const click = (a: Action) => {
    if (a === 'approve') return onAction(d, a, '');
    setReasonFor(a);
    setReason('');
  };

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
            {ago ? ` · signed up ${ago}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-mono">{d.license_number || 'No licence number'}</span>
            {d.license_number && <GlnHint check={d.gln_check} />}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {d.license_number && (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={copyGln}>
                <Copy className="h-3 w-3" /> Copy GLN
              </Button>
            )}
            <Button asChild variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <a href={medregUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" /> Check in MedReg
              </a>
            </Button>
          </div>
          {d.verification_note && (
            <p className="text-[11px] mt-2"><span className="font-medium">Reason shown to the doctor:</span> {d.verification_note}</p>
          )}
          {d.bio && <p className="text-[11px] text-muted-foreground mt-2 line-clamp-3">{d.bio}</p>}
          <p className="text-[11px] text-muted-foreground mt-2">Proof documents: not collected at signup; ask the doctor by email if MedReg is not enough.</p>
        </div>
      </div>

      {reasonFor ? (
        <div className="mt-3 space-y-2">
          <label htmlFor={`reason-${d.user_id}`} className="text-xs font-medium">
            Reason (the doctor sees this when she logs in)
          </label>
          <Textarea
            id={`reason-${d.user_id}`}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. GLN not found in MedReg"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setReasonFor(null)} disabled={busy}>Cancel</Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-destructive hover:text-destructive"
              disabled={busy || reason.trim().length < 3}
              onClick={() => onAction(d, reasonFor, reason.trim())}
            >
              {reasonFor === 'reject' ? 'Reject' : 'Revoke'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mt-3 justify-end">
          {actions.map(a => {
            const Icon = a === 'approve' ? Check : a === 'reject' ? X : ShieldOff;
            return (
              <Button
                key={a}
                variant={a === 'approve' ? 'default' : 'outline'}
                size="sm"
                className={a === 'approve' ? 'h-8 gap-1' : 'h-8 gap-1 text-destructive hover:text-destructive'}
                onClick={() => click(a)}
                disabled={busy}
              >
                <Icon className="h-3.5 w-3.5" />
                {a === 'approve' ? 'Approve' : a === 'reject' ? 'Reject' : 'Revoke'}
              </Button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function InvitePanel({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ link: string; email: string; expiresAt: string } | null>(null);
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/invites');
      if (!r.ok) { setUnavailable(r.status === 503); setInvites([]); return; }
      setInvites(((await r.json()).invites ?? []) as InviteRow[]);
    } catch {
      setInvites([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, note }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Failed');
      setCreated(data);
      setEmail('');
      setNote('');
      await load();
      onChanged();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Invite failed', description: err instanceof Error ? err.message : 'Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    const r = await fetch('/api/admin/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', id }),
    });
    if (!r.ok) toast({ variant: 'destructive', title: 'Could not cancel the invite' });
    await load();
    onChanged();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Link copied' });
    } catch {
      toast({ variant: 'destructive', title: 'Could not copy', description: 'Select the link and copy it by hand.' });
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-1.5"><Link2 className="h-4 w-4" /> Invite a doctor</h2>
        <p className="text-xs text-muted-foreground mt-1">
          A one-time link for one email, valid 7 days. The doctor registers with it and her account is
          approved at once, so check her in MedReg before you send it.
        </p>
      </div>
      {unavailable ? (
        <p className="text-xs text-muted-foreground">Invites switch on once database migration 023 is applied.</p>
      ) : (
        <form onSubmit={create} className="flex flex-col sm:flex-row gap-2">
          <Input type="email" required placeholder="doctor@praxis.ch" value={email} onChange={e => setEmail(e.target.value)} aria-label="Doctor email" />
          <Input placeholder="Note for yourself (optional)" value={note} maxLength={200} onChange={e => setNote(e.target.value)} aria-label="Note" />
          <Button type="submit" disabled={busy || !email} className="shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create link'}
          </Button>
        </form>
      )}

      {created && (
        <div className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
          <p className="text-xs">Link for <span className="font-medium">{created.email}</span>, valid until {format(new Date(created.expiresAt), 'd MMM yyyy')}. It is shown only now.</p>
          <p className="text-[11px] font-mono break-all select-all">{created.link}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => copy(created.link)}><Copy className="h-3.5 w-3.5" /> Copy link</Button>
            <Button asChild size="sm" variant="outline" className="h-8 gap-1">
              <a href={mailto(created.email, 'Your invitation to Womanie', `Hello,\n\nhere is your personal link to join Womanie as a doctor. It works once and expires on ${format(new Date(created.expiresAt), 'd MMMM yyyy')}:\n\n${created.link}\n\nAfter registering you land on a short setup checklist (profile, consultation hours, bookings).\n\nBest regards,\nWomanie`)}>
                <Mail className="h-3.5 w-3.5" /> Email it
              </a>
            </Button>
          </div>
        </div>
      )}

      {invites && invites.length > 0 && (
        <ul className="divide-y divide-border text-xs">
          {invites.slice(0, 15).map(i => (
            <li key={i.id} className="py-2 flex items-center gap-2">
              <span className="flex-1 min-w-0 break-all">{i.email}{i.note ? <span className="text-muted-foreground"> · {i.note}</span> : null}</span>
              <span className="text-muted-foreground shrink-0">
                {i.status === 'open' ? `open until ${format(new Date(i.expires_at), 'd MMM')}` : i.status}
              </span>
              {i.status === 'open' && (
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive hover:text-destructive" onClick={() => revoke(i.id)}>
                  <Ban className="h-3 w-3" /> Cancel
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function DoctorApprovals() {
  usePageTitle('Doctor Approvals');
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pending, setPending] = useState<DoctorRow[]>([]);
  const [approved, setApproved] = useState<DoctorRow[]>([]);
  const [rejected, setRejected] = useState<DoctorRow[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [medregUrl, setMedregUrl] = useState(DEFAULT_MEDREG);
  const [loaded, setLoaded] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState<{ action: Action; doctor: DoctorRow; reason: string } | null>(null);

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
      setRejected((payload.rejected ?? []) as DoctorRow[]);
      setLog((payload.log ?? []) as LogRow[]);
      if (typeof payload.medregUrl === 'string') setMedregUrl(payload.medregUrl);
    } catch (e) {
      console.error('Failed to load doctors:', e);
      toast({ variant: 'destructive', title: 'Load failed', description: 'Could not load doctors.' });
    } finally {
      setLoaded(true);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const respond = async (doctor: DoctorRow, action: Action, reason: string) => {
    const label = doctor.full_name || doctor.email;
    setBusyId(doctor.user_id);
    try {
      const resp = await fetch('/api/admin/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: doctor.user_id, action, reason }),
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
      toast({ title: titleByAction[action] });
      setLastDecision({ action, doctor, reason });
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
            Admin pages need an email on the <code className="text-xs">ADMIN_EMAILS</code> list and an account
            that has signed in with Google at least once (that is how the email is verified). Log out and use
            "Continue with Google".
          </p>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const section = (title: React.ReactNode, rows: DoctorRow[], empty: string, actions: Action[]) => (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        {title}
      </h2>
      {rows.length === 0 ? (
        <Card className="p-4 text-center text-sm text-muted-foreground">{empty}</Card>
      ) : (
        <div className="space-y-3">
          {rows.map(d => (
            <DoctorCard key={d.user_id} doctor={d} busy={busyId === d.user_id} medregUrl={medregUrl} onAction={respond} actions={actions} />
          ))}
        </div>
      )}
    </section>
  );

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
        {lastDecision && (
          <Card className="p-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="flex-1 min-w-0">
              {lastDecision.action === 'approve'
                ? 'Approved. The doctor can log in now.'
                : 'Saved. The doctor sees your reason on the login screen.'}{' '}
              Let her know by email too?
            </span>
            <Button asChild size="sm" variant="outline" className="h-7 gap-1">
              <a href={decisionMail(lastDecision.action, lastDecision.doctor.email, lastDecision.doctor.full_name || 'Doctor', lastDecision.reason)}>
                <Mail className="h-3 w-3" /> Email the doctor
              </a>
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setLastDecision(null)}>Dismiss</Button>
          </Card>
        )}

        <InvitePanel onChanged={load} />

        {section(<>Pending — {pending.length}</>, pending, 'No pending signups.', ['reject', 'approve'])}
        {section(<><ShieldCheck className="h-3.5 w-3.5" /> Verified — {approved.length}</>, approved, 'No verified doctors yet.', ['revoke'])}
        {rejected.length > 0 && section(<>Rejected or revoked — {rejected.length}</>, rejected, '', ['approve'])}

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" /> Activity
          </h2>
          {log.length === 0 ? (
            <Card className="p-4 text-center text-sm text-muted-foreground">No admin actions logged yet.</Card>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-border text-xs">
                {log.map(l => (
                  <li key={l.id} className="px-4 py-2">
                    <span className="text-muted-foreground">{format(new Date(l.created_at), 'd MMM yyyy HH:mm')}</span>{' · '}
                    <span className="font-medium">{l.admin_email || 'admin'}</span>{' '}
                    {ACTION_LABEL[l.action] || l.action}{' '}
                    <span className="break-all">{l.target_email || ''}</span>
                    {l.detail?.reason ? <span className="text-muted-foreground"> · “{l.detail.reason}”</span> : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
