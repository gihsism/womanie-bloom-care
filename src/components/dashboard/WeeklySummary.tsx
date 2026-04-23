import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { onHealthDataChange } from '@/lib/data-events';
import { formatDistanceToNow } from 'date-fns';
import { BookOpen, RefreshCw, Sparkles } from 'lucide-react';
import { errorMessage } from '@/lib/errors';

// Weekly narrative summary card on the patient dashboard.
//
// POSTs /api/summary/generate, renders the resulting markdown.
// The endpoint caches the first call of each week keyed on the
// user's content, so repeated visits inside a week come back
// instantly with `cached: true`. A "Refresh" action sends
// `force: true` to bypass the cache — handy when the user has
// just uploaded something new and wants the narrative to include
// it immediately.

interface ApiResponse {
  summary: string | null;
  empty?: boolean;
  message?: string;
  generatedAt?: string;
  cached?: boolean;
}

export default function WeeklySummary() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const COLLAPSED_MAX_PX = 240;

  const load = useCallback(async (force: boolean) => {
    if (!user) return;
    setLoading(true);
    try {
      const resp = await fetch('/api/summary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const payload = (await resp.json()) as ApiResponse;
      setData(payload);
      if (force && payload.summary) {
        toast({ title: 'Summary refreshed', description: 'Reflecting your latest results.' });
      }
    } catch (error) {
      console.error('Weekly summary error:', error);
      toast({
        variant: 'destructive',
        title: 'Could not load summary',
        description: errorMessage(error, 'Please try again.'),
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) load(false);
  }, [user, load]);

  // When a new analysis lands, nudge the summary to refresh so it
  // reflects the new data instead of showing a stale weekly cache.
  useEffect(() => onHealthDataChange(() => load(true)), [load]);

  // Measure the rendered summary and only show the fade + "Read more"
  // when it's actually taller than the collapsed max-height. Prevents
  // the gradient from appearing over a three-line response.
  useLayoutEffect(() => {
    if (!data?.summary) {
      setOverflows(false);
      return;
    }
    const el = contentRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > COLLAPSED_MAX_PX + 4);
  }, [data?.summary]);

  if (!data) {
    if (loading) {
      return (
        <Card className="p-4 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            <p className="text-sm text-muted-foreground">Reading your records…</p>
          </div>
        </Card>
      );
    }
    return null;
  }

  if (data.empty) return null;
  if (!data.summary) return null;

  const generatedLabel = data.generatedAt
    ? formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })
    : null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Your health story, this week</p>
            <p className="text-[11px] text-muted-foreground">
              A plain-language read across all your uploaded documents
              {generatedLabel ? ` · updated ${generatedLabel}` : ''}
              {data.cached ? '' : ' · fresh'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1"
          onClick={() => load(true)}
          disabled={loading}
          aria-label="Regenerate summary"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          <span className="text-xs">Refresh</span>
        </Button>
      </div>

      <div
        ref={contentRef}
        className={`prose prose-sm dark:prose-invert max-w-none ${overflows && !expanded ? 'max-h-60 overflow-hidden relative' : ''}`}
      >
        <ReactMarkdown>{data.summary}</ReactMarkdown>
        {overflows && !expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-card pointer-events-none" />
        )}
      </div>
      {overflows && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-7 text-xs"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? 'Show less' : 'Read more'}
        </Button>
      )}
    </Card>
  );
}
