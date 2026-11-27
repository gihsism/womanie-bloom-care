import { useState } from 'react';
import { FileText, FlaskConical, ThumbsDown, ThumbsUp } from '@/components/icons';
import type { RecordRef } from '@/lib/recordCitations';
import { FEEDBACK_REASON_LABELS, FEEDBACK_REASONS, MAX_FEEDBACK_COMMENT, type FeedbackReason } from '@/lib/chatFeedback';

// Small extras under an Ask AI answer: "From your records" chips,
// follow-up question chips and the 👍/👎 feedback row.

/** Her records the answer used, each linking to its source in Records. */
export function RecordChips({ records, onOpen }: { records: RecordRef[]; onOpen: (href: string) => void }) {
  if (!records.length) return null;
  return (
    <div className="mt-3 pt-2.5 border-t border-border/70" aria-label="From your records" data-testid="record-chips">
      <p className="label-mono !text-[10px] mb-1.5">From your records</p>
      <div className="flex flex-wrap gap-1.5">
        {records.map((r) => {
          const Icon = r.kind === 'document' ? FileText : FlaskConical;
          const detail = [r.count && r.count > 1 ? `${r.count} values` : null, r.date].filter(Boolean).join(' · ');
          return (
            <button
              key={`${r.kind}:${r.id}`}
              type="button"
              onClick={() => onOpen(r.href)}
              className="inline-flex items-center gap-1 max-w-full rounded-full border border-border bg-background px-2.5 py-1 text-[11px] leading-tight hover:border-primary hover:text-primary"
              title={r.kind === 'document' ? 'Open this document in Records' : 'Open the report this value came from'}
            >
              <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              <span className="truncate">{r.label}</span>
              {detail && <span className="text-muted-foreground shrink-0">{detail}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 2-3 follow-up questions; a tap asks it. */
export function FollowUpChips({ questions, onAsk, disabled }: { questions: string[]; onAsk: (q: string) => void; disabled?: boolean }) {
  if (questions.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2 pl-10" aria-label="Suggested follow-up questions" data-testid="followups">
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onAsk(q)}
          className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-left max-w-full hover:bg-primary/10 disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

/** 👍 / 👎 with an optional reason (👎 only). Ratings are re-editable. */
export function AnswerFeedback({
  rating,
  onRate,
}: {
  rating: 1 | -1 | null;
  onRate: (rating: 1 | -1, reason: FeedbackReason | null, comment: string | null) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [comment, setComment] = useState('');

  const btn = (active: boolean) =>
    `inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-background hover:text-foreground ${active ? 'text-primary' : 'text-muted-foreground'}`;

  return (
    <div className="mt-2" data-testid="answer-feedback">
      <div className="flex items-center gap-1">
        <button type="button" className={btn(rating === 1)} aria-label="Helpful answer" aria-pressed={rating === 1}
          onClick={() => { setAsking(false); onRate(1, null, null); }}>
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn(rating === -1)} aria-label="Not helpful" aria-pressed={rating === -1}
          onClick={() => { onRate(-1, null, null); setAsking(true); }}>
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
        {rating !== null && !asking && <span className="text-[10.5px] text-muted-foreground ml-1">Thanks for the feedback</span>}
      </div>
      {asking && (
        <div className="mt-2 rounded-lg border border-border bg-background p-2.5 space-y-2">
          <p className="text-[11px] text-muted-foreground">What was wrong? (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_REASONS.map((r) => (
              <button key={r} type="button" aria-pressed={reason === r}
                onClick={() => setReason(reason === r ? null : r)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${reason === r ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>
                {FEEDBACK_REASON_LABELS[r]}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={MAX_FEEDBACK_COMMENT}
            rows={2}
            placeholder="Anything else? Please don't include names or other personal details."
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            aria-label="Optional comment"
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setAsking(false)}>Skip</button>
            <button type="button" className="rounded-md bg-primary px-2.5 py-1 text-[11px] text-primary-foreground"
              onClick={() => { onRate(-1, reason, comment.trim() || null); setAsking(false); }}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
