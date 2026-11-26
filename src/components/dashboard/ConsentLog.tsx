import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileCheck2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

// Me -> Privacy: when she accepted the privacy policy, and which version
// (consent_log, migration 024, via /api/me/consents). If the policy has a
// newer version than the one she accepted (or nothing is recorded yet,
// e.g. she signed up with Google), she can read and accept it here.

interface ConsentRow {
  document: string;
  version: string;
  accepted_at: string;
  source: string;
}
interface Current {
  version: string;
  url: string;
}

const LABELS: Record<string, string> = { privacy_policy: 'Privacy policy', terms: 'Terms of service' };
const SOURCES: Record<string, string> = { signup: 'when you signed up', me_privacy: 'in Me → Privacy', consent_gate: 'when you signed in' };

export default function ConsentLog() {
  const [history, setHistory] = useState<ConsentRow[]>([]);
  const [current, setCurrent] = useState<Record<string, Current>>({});
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const resp = await fetch('/api/me/consents', { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      setHistory((payload.history ?? []) as ConsentRow[]);
      setCurrent((payload.current ?? {}) as Record<string, Current>);
      setAvailable(payload.available !== false);
    } catch (e) {
      console.error('Failed to load consents:', e);
      setAvailable(false);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const accept = async (document: string) => {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch('/api/me/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ document }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await load();
    } catch {
      setError('Could not save your acceptance. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="consent-log">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck2 className="h-5 w-5" />
          Your agreements
        </CardTitle>
        <CardDescription>
          When you accepted the privacy policy, and which version.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loaded ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !available ? (
          <p className="text-sm text-muted-foreground">Not available yet.</p>
        ) : (
          <>
            {Object.entries(current).map(([doc, cur]) => {
              const latest = history.find(h => h.document === doc);
              const upToDate = latest?.version === cur.version;
              return (
                <div key={doc} className="rounded-xl border border-border p-3 space-y-2">
                  <p className="text-sm font-medium">
                    {LABELS[doc] ?? doc} <span className="text-muted-foreground font-normal">· version {cur.version}</span>
                  </p>
                  {upToDate && latest ? (
                    <p className="text-[13px] text-muted-foreground">
                      Accepted on {format(new Date(latest.accepted_at), 'd MMM yyyy, HH:mm')} {SOURCES[latest.source] ?? ''}.
                    </p>
                  ) : (
                    <>
                      <p className="text-[13px] text-muted-foreground">
                        {latest
                          ? `You accepted version ${latest.version}. The policy has changed since.`
                          : 'No acceptance recorded yet.'}{' '}
                        <a href={cur.url} className="text-primary underline underline-offset-2">Read it</a>
                      </p>
                      <Button size="sm" onClick={() => accept(doc)} disabled={saving} className="gap-1.5">
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        I have read and accept it
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
            {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
            {history.length > 1 && (
              <details className="text-[13px] text-muted-foreground">
                <summary className="cursor-pointer">Earlier acceptances</summary>
                <ul className="mt-2 space-y-1">
                  {history.slice(1).map((h, i) => (
                    <li key={i}>
                      {LABELS[h.document] ?? h.document} {h.version}: {format(new Date(h.accepted_at), 'd MMM yyyy')}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
