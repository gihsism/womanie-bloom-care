import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ExternalLink, Loader2 } from '@/components/icons';
import { EVIDENCE_LABEL } from '@/lib/research-library';
import { RESEARCH_DISCLAIMER } from '@/lib/research-sources';
import { libraryLink, type EvidenceSpec } from '@/lib/evidenceTopics';
import { loadEvidenceNote, readableTitle, registerEvidenceNote, type EvidenceNoteData } from '@/lib/evidence-notes';

// "What the research says": a calm, collapsible note under the user's
// own data (a lab result, a tracker). Collapsed it is one line, so cards
// don't get longer; opened it shows 1-2 published items, each with a
// one-line takeaway, the evidence label and year, a PubMed link, and a
// deep link into the /library page. Nothing is fetched until opened.
//
// Pass one spec (up to 2 items from it) or two specs (the top item of
// each, labelled). Specs come from src/lib/evidenceTopics.ts.

interface EvidenceNoteProps {
  specs: (EvidenceSpec | null | undefined)[];
  className?: string;
  /** Optional words after the title, for a note that stands alone (e.g. "on timing sex"). */
  about?: string;
}

export default function EvidenceNote({ specs: rawSpecs, className = 'mt-3 border-t border-border/60', about }: EvidenceNoteProps) {
  const specs = rawSpecs.filter((s): s is EvidenceSpec => Boolean(s)).slice(0, 2);
  const ids = specs.map((s) => s.note).join(',');
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<(EvidenceNoteData | null)[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ids) return;
    const cleanups = ids.split(',').map((id) => registerEvidenceNote(id));
    return () => cleanups.forEach((c) => c());
  }, [ids]);

  // Different data (e.g. a new flagged result) = different notes.
  useEffect(() => {
    setNotes(null);
    setFailed(false);
  }, [ids]);

  useEffect(() => {
    if (!open || notes || !ids) return;
    let cancelled = false;
    Promise.all(ids.split(',').map((id) => loadEvidenceNote(id))).then((res) => {
      if (cancelled) return;
      if (res.every((n) => !n || n.items.length === 0)) setFailed(true);
      else setNotes(res);
    });
    return () => { cancelled = true; };
  }, [open, notes, ids]);

  if (specs.length === 0) return null;

  const perSpec = specs.length === 1 ? 2 : 1;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full min-h-[36px] flex items-center gap-1.5 text-left text-[12.5px] text-primary hover:text-primary/80"
      >
        <span aria-hidden className="text-[10px] leading-none">&#10022;</span>
        <span>What the research says{about ? <span className="text-muted-foreground"> {about}</span> : null}</span>
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
      </button>

      {open && (
        <div id={panelId} className="pb-1">
          {!notes && !failed && (
            <p className="flex items-center gap-2 py-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading
            </p>
          )}
          {failed && (
            <p className="py-2 text-[12px] text-muted-foreground">The research notes couldn&rsquo;t load right now.</p>
          )}
          {notes && (
            <div className="space-y-3">
              {specs.map((spec, i) => {
                const items = notes[i]?.items.slice(0, perSpec) ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={spec.note}>
                    {specs.length > 1 && <p className="label-mono !text-[10px] mb-1">{spec.label}</p>}
                    <ul className="space-y-2.5">
                      {items.map((it) => (
                        <li key={it.id} className="min-w-0">
                          <p className="text-[13px] leading-snug text-foreground break-words">{it.takeaway}</p>
                          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground line-clamp-2 break-words">{readableTitle(it.title)}</p>
                          <p className="mt-1 label-mono !text-[10px] !tracking-[0.08em] truncate" title={it.source}>
                            <span className="!text-primary">{EVIDENCE_LABEL[it.evidenceLevel]}</span>
                            {' · '}{it.year}{' · '}{it.source}
                          </p>
                          <a
                            href={it.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 min-h-[32px] text-[12px] text-primary underline-offset-2 hover:underline"
                          >
                            Read the source <span className="sr-only">(PubMed, opens in a new tab)</span>
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={libraryLink(spec)}
                      className="inline-flex items-center min-h-[32px] text-[12px] text-primary underline-offset-2 hover:underline"
                    >
                      More in the library &rarr;
                    </Link>
                  </div>
                );
              })}
              <p className="text-[10.5px] leading-snug text-muted-foreground">{RESEARCH_DISCLAIMER}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
