import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import { NO_REMOTE_IMAGES } from '@/lib/safeMarkdown';
import { chatPrintTurns, type ChatTurn } from '@/lib/chatExport';
import { localDate } from '@/lib/visitSummary';

// One Ask AI chat as a printable page (/dashboard/ai-doctor/print), opened
// from the chat's ⋯ menu ("Print this chat"). The turns arrive in the
// navigation state (memory only); opened directly, the page says how to
// get here. Same print decisions as the other print views: white page,
// black text, toolbar hidden on paper, no tab bar.

const H2 = 'text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1';

export function ChatPrintSheet({ turns, name, now = new Date() }: { turns: ChatTurn[]; name: string | null; now?: Date }) {
  const items = chatPrintTurns(turns);
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8 print:px-0 print:py-0" data-testid="chat-print-sheet">
      <header className="mb-4 pb-3 border-b border-gray-300">
        <p className="text-xs uppercase tracking-wide text-gray-500">Ask AI chat</p>
        {name && <h1 className="text-xl font-bold">{name}</h1>}
        <p className="text-xs text-gray-600">Printed {localDate(now)}</p>
      </header>
      {items.map((t, i) => (
        <section key={i} className="mb-4" data-role={t.role}>
          <h2 className={H2}>{t.role === 'user' ? 'My question' : 'Answer'}</h2>
          {t.role === 'user' ? (
            <p className="text-sm whitespace-pre-wrap font-medium">{t.body}</p>
          ) : (
            <div className="prose prose-sm max-w-none text-sm text-black [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]} disallowedElements={NO_REMOTE_IMAGES}>{t.body}</ReactMarkdown>
            </div>
          )}
          {t.sources.length > 0 && (
            <ol className="mt-1 text-xs text-gray-600 space-y-0.5">
              {t.sources.map(s => (
                <li key={s.n}>[{s.n}] {s.title} ({s.source}{s.year ? `, ${s.year}` : ''})</li>
              ))}
            </ol>
          )}
        </section>
      ))}
      <footer className="mt-6 pt-2 border-t border-gray-200 text-[10px] text-gray-500">
        Answers from Womanie's AI assistant, for reference only. Not a substitute for advice from your doctor.
      </footer>
    </article>
  );
}

export default function PrintChat() {
  usePageTitle('Print chat');
  const navigate = useNavigate();
  const { user } = useAuth();
  const state = useLocation().state as { turns?: unknown } | null;
  const turns = (Array.isArray(state?.turns) ? state.turns : []).filter(
    (t): t is ChatTurn => !!t && typeof t === 'object' && ((t as ChatTurn).role === 'user' || (t as ChatTurn).role === 'assistant') && typeof (t as ChatTurn).content === 'string',
  );

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="border-b border-gray-200 print:hidden">
        <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Print this chat</p>
            <p className="text-[11px] text-muted-foreground">Print it or save as PDF.</p>
          </div>
          {turns.length > 0 && (
            <Button size="sm" className="gap-1.5" onClick={() => window.print()} data-testid="chat-print">
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          )}
        </div>
      </div>
      {turns.length > 0 ? (
        <ChatPrintSheet turns={turns} name={user?.name ?? null} />
      ) : (
        <div className="max-w-3xl mx-auto px-4 py-10 text-center text-sm text-gray-600">
          <p>Nothing to print here. Open a chat in Ask AI and choose Print this chat from the ⋯ menu.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/dashboard/ai-doctor')}>Go to Ask AI</Button>
        </div>
      )}
    </div>
  );
}
