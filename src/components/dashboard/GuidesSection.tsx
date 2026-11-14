import { useState, type ReactNode } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';

// Folds reading material (nutrition, movement and other guides) into one
// closed section, so the dashboard leads with the things people log and
// the guides are one tap away instead of several screens of scrolling.
export default function GuidesSection({ title = 'Guides: nutrition, movement & more', children }: { title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border bg-card">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left">
        <span className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
        </span>
        <span className="flex-1 font-semibold text-sm">{title}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div className="px-3 pb-3 space-y-4">{children}</div>}
    </div>
  );
}
