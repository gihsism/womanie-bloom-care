import { ExternalLink } from 'lucide-react';
import { RESEARCH_DISCLAIMER, type ChatSource } from '@/lib/research-sources';

// Compact "Sources" list under an AI answer: only the research-library
// items the answer actually cited, numbered as in the text.
export function ChatSources({ sources, onBrowse }: { sources: ChatSource[]; onBrowse?: () => void }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 pt-2.5 border-t border-line" aria-label="Sources">
      <p className="label-mono !text-[10px] mb-1.5">Sources</p>
      <ol>
        {sources.map((s) => (
          <li key={s.n} className="flex gap-1 text-[13px] leading-snug">
            <span className="font-display font-bold text-stage-accent tabular-nums w-7 shrink-0 pt-1.5">[{s.n}]</span>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 block py-1.5 group/src hover:text-primary"
            >
              <span className="line-clamp-2 break-words">{s.title}</span>
              <span className="block text-[11px] text-muted-foreground">
                {s.source} · {s.year}
                {s.fulltext && <> · Full text, {s.fulltext}</>}
                <ExternalLink className="inline h-2.5 w-2.5 ml-1 -mt-0.5 opacity-70" aria-hidden />
              </span>
            </a>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
        {RESEARCH_DISCLAIMER}
        {onBrowse && (
          <>
            {' '}
            <button type="button" onClick={onBrowse} className="relative hit-44 text-primary hover:underline underline-offset-2">
              Browse the research library
            </button>
          </>
        )}
      </p>
    </div>
  );
}
