import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Shield, Loader2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { shouldShowConsentGate } from '@/lib/consentGate';
import { PRIVACY_POLICY_VERSION } from '@/lib/policyVersion';

// One-time privacy consent screen.
//
// Shown instead of the page whenever /api/auth/me says she has not accepted
// the CURRENT privacy-policy version: the first Google sign-in of a new
// account (Google skips the sign-up form's tick), an existing account
// without a consent row, or after the version was bumped. The tick is
// required to continue; the acceptance is recorded in consent_log via
// POST /api/me/consents (source 'consent_gate'). The policy link opens in
// a new tab and /dashboard/privacy is never gated, so she can read it.

export function ConsentGate({ children }: { children: ReactNode }) {
  const { user, markConsentAccepted } = useAuth();
  const { pathname } = useLocation();
  const [ticked, setTicked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!shouldShowConsentGate(user, pathname)) return <>{children}</>;

  const updated = user?.consentReason === 'updated';

  const accept = async () => {
    if (!ticked || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/me/consents', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: 'privacy_policy', version: PRIVACY_POLICY_VERSION, context: 'gate' }),
      });
      if (r.ok) {
        markConsentAccepted();
        return;
      }
      const body = await r.json().catch(() => ({}));
      if (body?.code === 'policy_outdated') {
        setError('The privacy policy changed a moment ago. Reload the page to see the latest version.');
      } else {
        setError('We could not save your answer. Please check your connection and try again.');
      }
    } catch {
      setError('We could not save your answer. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10" data-testid="consent-gate">
      <Card className="w-full max-w-md p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <h1 className="font-display text-xl font-medium">
            {updated ? 'Our privacy policy has changed' : 'One step before you start'}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {updated
            ? 'We updated the privacy policy since you last agreed to it. Please read the new version and confirm to keep using Womanie. Your data is untouched.'
            : 'Womanie stores health information such as your cycle, lab results and documents. Before we do, we need your agreement to the privacy policy, which explains what we store, where, and how you can export or delete it.'}
        </p>
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm text-primary underline underline-offset-2"
          data-testid="consent-gate-policy-link"
        >
          Read the privacy policy
        </a>
        <div className="flex items-start gap-2">
          <Checkbox id="consent-gate-tick" checked={ticked} onCheckedChange={v => setTicked(v === true)} className="mt-0.5" />
          <Label htmlFor="consent-gate-tick" className="text-xs font-normal leading-relaxed text-muted-foreground">
            I have read the privacy policy and agree that Womanie stores and processes my health information as it describes.
          </Label>
        </div>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        <Button className="w-full" disabled={!ticked || saving} onClick={accept} data-testid="consent-gate-continue">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Continue
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Don't agree?{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => { window.location.href = '/api/auth/logout'; }}>
            Sign out
          </button>
          . To have your account and data deleted without continuing, write to{' '}
          <a href="mailto:privacy@womanie.info" className="underline underline-offset-2">privacy@womanie.info</a>.
        </p>
      </Card>
    </div>
  );
}

export default ConsentGate;
