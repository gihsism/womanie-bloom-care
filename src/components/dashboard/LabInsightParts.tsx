import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Upload } from 'lucide-react';
import { attentionBanner, getStatusInfo } from '@/lib/medical-utils';

// Shared pieces of the Home lab-insight cards (pregnancy, cycle, other
// modes), in the Health Records house style: Fraunces title and values,
// a small status dot per row, muted ink for in-range results and
// burnt-orange (--destructive) for out-of-range ones. No green, no
// yellow, no emoji.

const isFlagged = (status: string | null) => status === 'abnormal' || status === 'critical';

export function LabCardHeader() {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-display text-[19px] leading-tight font-medium">Your lab results</h3>
      <Button
        variant="ghost"
        size="sm"
        className="tap-target h-7 px-2 text-xs gap-1 text-primary hover:text-primary"
        onClick={() => navigate('/dashboard/medical-history')}
      >
        View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function LabAttentionBanner({ children }: { children: ReactNode }) {
  return (
    <div className={attentionBanner} role="status">
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-destructive/70 flex-shrink-0 mt-[5px]" />
      <p className="text-xs leading-snug">{children}</p>
    </div>
  );
}

interface LabRowProps {
  label: string;
  note?: string;
  value: string | number | null;
  unit: string | null;
  status: string | null;
}

export function LabRow({ label, note, value, unit, status }: LabRowProps) {
  const info = getStatusInfo(status);
  const flagged = isFlagged(status);
  return (
    <li className="flex items-center gap-2.5 py-2 border-b border-border/50 last:border-b-0">
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${info.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-tight truncate">{label}</p>
        {note && <p className="text-[11px] leading-snug text-muted-foreground mt-0.5">{note}</p>}
      </div>
      <span
        className={`font-display font-medium text-[17px] leading-none tabular-nums whitespace-nowrap ${
          flagged ? info.color : 'text-foreground/75'
        }`}
      >
        {value}
        {unit ? <span className="font-sans text-[11px] text-muted-foreground ml-1">{unit}</span> : null}
      </span>
      <span className="sr-only">{info.label}</span>
    </li>
  );
}

export function LabMissingTests({ title, labels }: { title: string; labels: string[] }) {
  return (
    <div className="pt-2.5 border-t border-border/50">
      <p className="label-mono mb-2">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((l) => (
          <span key={l} className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LabEmptyCard({ title, text }: { title: string; text: string }) {
  const navigate = useNavigate();
  return (
    <Card className="p-4 border-dashed">
      <div className="text-center space-y-2">
        <Upload className="h-5 w-5 text-primary mx-auto" aria-hidden="true" />
        <p className="font-display text-[17px] leading-tight font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
        <Button size="sm" variant="outline" onClick={() => navigate('/dashboard/medical-history')}>
          Upload documents
        </Button>
      </div>
    </Card>
  );
}
