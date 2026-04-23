import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Share2, Copy, Check, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Patient flow for sharing health records with a doctor.
//
// Pairs with /api/connections/redeem-code on the doctor side:
//   1. Patient clicks "Generate code" here.
//   2. We insert a patient_access_codes row owned by the patient's
//      user_id (ownership enforcement on /api/db injects that).
//   3. Patient reads the code out loud / sends it to the doctor.
//   4. Doctor enters it in their dashboard → that endpoint creates a
//      pending doctor_patient_connections row.
//   5. (Future) Patient approves the pending connection.
//
// Codes are 8 random uppercase alphanumerics, expire in 24 hours,
// single-use. Active codes are listed with their countdown so the
// patient can see what they've shared.

interface AccessCode {
  id: string;
  code: string;
  expires_at: string;
  is_used: boolean;
  created_at?: string;
}

// Readable-aloud alphabet: no 0/O, no 1/I, no ambiguous lowercase.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_TTL_HOURS = 24;

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export default function ShareWithDoctor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadActiveCodes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await db
      .from('patient_access_codes')
      .select('id, code, expires_at, is_used')
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true });
    setCodes((data ?? []) as AccessCode[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (open) loadActiveCodes();
  }, [open, loadActiveCodes]);

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const code = generateCode();
      const expiresAt = new Date(Date.now() + CODE_TTL_HOURS * 60 * 60 * 1000).toISOString();
      const { error } = await db
        .from('patient_access_codes')
        .insert({
          patient_id: user.id,
          code,
          expires_at: expiresAt,
          is_used: false,
        });
      if (error) throw error;
      toast({
        title: 'Code ready',
        description: 'Share this code with your doctor to link your records.',
      });
      await loadActiveCodes();
    } catch (error: any) {
      console.error('Code generation error:', error);
      toast({
        variant: 'destructive',
        title: 'Could not generate code',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(c => (c === code ? null : c)), 1500);
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Copy the code manually.' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Share2 className="h-3.5 w-3.5" />
          Share with doctor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Share your records with a doctor</DialogTitle>
          <DialogDescription>
            Generate a one-time code, then send it to your doctor. They'll enter it in their portal to request access. You'll still need to approve the request before they can see anything.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Button onClick={handleGenerate} disabled={generating} className="w-full">
            {generating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
            ) : (
              <>Generate new code</>
            )}
          </Button>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center">Loading your codes…</p>
          ) : codes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center">
              No active codes. Generate one to share.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Active codes
              </p>
              <ul className="space-y-2">
                {codes.map(c => {
                  const isCopied = copiedCode === c.code;
                  const expiresLabel = formatDistanceToNow(new Date(c.expires_at), { addSuffix: true });
                  return (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-muted/40"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-mono font-bold tracking-wider">{c.code}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Expires {expiresLabel}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 h-8"
                        onClick={() => copy(c.code)}
                      >
                        {isCopied ? (
                          <><Check className="h-3.5 w-3.5" />Copied</>
                        ) : (
                          <><Copy className="h-3.5 w-3.5" />Copy</>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Each code can be used once and expires after {CODE_TTL_HOURS} hours. You can generate as many as you need.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
