import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useUserHealthContext } from '@/hooks/useUserHealthContext';
import { db } from '@/integrations/db/client';
import { computeCyclePhase } from '@/lib/cycle-phase';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { NO_REMOTE_IMAGES, tablesToLists } from '@/lib/safeMarkdown';
import {
  Send,
  Bot,
  User,
  Loader2,
  Trash2,
  Download,
  BookOpen,
  History,
  MoreHorizontal,
  Plus,
  ArrowLeft,
  Copy,
  Check,
} from 'lucide-react';
import { ChatSources } from '@/components/chat/ChatSources';
import { PastChats } from '@/components/chat/PastChats';
import { groupIntoChats, newConversationId, type PastChat, type StoredChatMessage } from '@/lib/chatSessions';
import { pickSuggestions } from '@/lib/chatSuggestions';
import { citedSources, linkCitations, splitSourcesFooter, stripSourcesFooter, stripUnknownCitations, type ChatSource } from '@/lib/research-sources';

// `sources`: research-library items the server gave the model for this
// answer (live replies); reloaded replies carry them in a text footer.
type Msg = { role: 'user' | 'assistant'; content: string; sources?: ChatSource[] };

const CHAT_URL = '/api/ai-doctor-chat';

const AI_MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku', description: 'Fast responses' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet', description: 'Best analysis' },
  { id: 'claude-opus-5-5', label: 'Claude Opus', description: 'Most capable' },
];

interface PersonalContext {
  age?: number | null;
  amhSummary?: string | null;
  flags?: string | null;
  postpartumWeeks?: number | null;
  cyclePhase?: string | null;
}

function localToday(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function streamChat({
  messages,
  model,
  personalContext,
  conversationId,
  onDelta,
  onSources,
  onReplace,
  onDone,
  onError,
}: {
  messages: Msg[];
  model: string;
  personalContext?: PersonalContext;
  conversationId: string;
  onDelta: (text: string) => void;
  onSources?: (sources: ChatSource[]) => void;
  /** Final text after the server's citation check; replaces the streamed text. */
  onReplace?: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    // Her own calendar date, so "days to go" / "week N" are counted in
    // her timezone, not the server's UTC.
    body: JSON.stringify({ messages, model, personalContext, conversationId, today: localToday() }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: 'Unknown error' }));
    onError(body.error || `Error ${resp.status}`);
    return;
  }

  if (!resp.body) {
    onError('No response stream');
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  while (!done) {
    const { done: readerDone, value } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') {
        done = true;
        break;
      }
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed.sources)) onSources?.(parsed.sources as ChatSource[]);
        if (typeof parsed.replace === 'string') onReplace?.(parsed.replace);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        buffer = line + '\n' + buffer;
        break;
      }
    }
  }

  if (buffer.trim()) {
    for (let raw of buffer.split('\n')) {
      if (!raw) continue;
      if (raw.endsWith('\r')) raw = raw.slice(0, -1);
      if (raw.startsWith(':') || raw.trim() === '') continue;
      if (!raw.startsWith('data: ')) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed.replace === 'string') onReplace?.(parsed.replace);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

// A new chat opens with one short line; the full history is under
// "Past chats". The disclaimer is the single line under the input.
const WELCOME_MESSAGE: Msg = {
  role: 'assistant',
  content: 'Ask me anything about your health or your records. I can see the documents you uploaded.',
};

// ─── Main Component ───
export default function AIDoctorChat() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const healthContext = useUserHealthContext();
  const { toast } = useToast();
  usePageTitle('Ask AI');
  // The chat on screen. It always starts new; stored history is listed
  // under "Past chats" (history below) and can be reopened from there.
  const [messages, setMessages] = useState<Msg[]>([WELCOME_MESSAGE]);
  // Every stored message (oldest first), as the server returns it.
  const [history, setHistory] = useState<Array<StoredChatMessage & { sources?: ChatSource[] }>>([]);
  const [showPast, setShowPast] = useState(false);
  // The chat on screen. Every turn is stored under this id, so Past chats
  // keeps separate chats apart. New chat = new id; reopening keeps its id.
  const [conversationId, setConversationId] = useState(() => newConversationId());
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [earliestCursor, setEarliestCursor] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  // Tracks which assistant message was just copied so the Copy button
  // can flip to a checkmark for 1.5s. Indexed by message position.
  const [justCopiedIdx, setJustCopiedIdx] = useState<number | null>(null);
  const copyAssistantMessage = async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setJustCopiedIdx(idx);
      setTimeout(() => setJustCopiedIdx(c => (c === idx ? null : c)), 1500);
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Your browser blocked clipboard access.' });
    }
  };

  // Model preference persists across sessions so a user who set up
  // Sonnet doesn't drop back to Haiku on every page load.
  const [selectedModel, setSelectedModel] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('womanie_chat_model') : null;
      if (saved && AI_MODELS.some(m => m.id === saved)) return saved;
    } catch { /* ignore */ }
    return 'claude-haiku-5-5';
  });
  useEffect(() => {
    try { window.localStorage.setItem('womanie_chat_model', selectedModel); } catch { /* ignore */ }
  }, [selectedModel]);
  const [medicalContext, setMedicalContext] = useState<string | null>(null);
  // Recent periods, used only to derive a coarse current-cycle-phase
  // line for the chat context. computeCyclePhase stays silent when the
  // data is stale or implausible, so this is safe to load opportunistically.
  const [recentPeriods, setRecentPeriods] = useState<{ period_start_date: string; cycle_length: number | null }[]>([]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await db
          .from('period_tracking')
          .select('period_start_date, cycle_length')
          .eq('user_id', user.id)
          .order('period_start_date', { ascending: false })
          .limit(3);
        if (!cancelled && Array.isArray(data)) setRecentPeriods(data);
      } catch { /* non-fatal — chat works without cycle context */ }
    })();
    return () => { cancelled = true; };
  }, [user]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load user's medical context for personalized AI responses
  useEffect(() => {
    if (!user) return;
    const loadContext = async () => {
      try {
        const { db } = await import('@/integrations/db/client');
        const [profileRes, docsRes, extractedRes, appointmentsResp, notesResp] = await Promise.all([
          db.from('profiles').select('life_stage').eq('id', user.id).maybeSingle(),
          db.from('health_documents').select('ai_suggested_name, ai_summary, document_type').eq('user_id', user.id).order('uploaded_at', { ascending: false }).limit(5),
          db.from('medical_extracted_data').select('title, value, unit, status, data_type').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
          fetch('/api/me/appointments?upcoming=true').then(r => (r.ok ? r.json() : { appointments: [] })),
          fetch('/api/me/doctor-notes').then(r => (r.ok ? r.json() : { notes: [] })),
        ]);

        type ExtractedRow = { title: string; value: string | null; unit: string | null; status: string | null; data_type: string };
        type DocRow = { ai_suggested_name: string | null; ai_summary: string | null; document_type: string };
        const extractedRows = (extractedRes.data ?? []) as ExtractedRow[];
        const docRows = (docsRes.data ?? []) as DocRow[];

        const parts: string[] = [];
        if (profileRes.data?.life_stage) {
          parts.push(`Life stage: ${profileRes.data.life_stage}`);
        }
        if (extractedRows.length > 0) {
          const labs = extractedRows
            .filter(d => d.data_type === 'lab_result' && d.value)
            .map(d => `${d.title}: ${d.value}${d.unit ? ' ' + d.unit : ''}${d.status && d.status !== 'normal' ? ' (' + d.status + ')' : ''}`)
            .join('; ');
          if (labs) parts.push(`Recent lab results: ${labs}`);

          const conditions = extractedRows
            .filter(d => d.data_type === 'condition')
            .map(d => d.title)
            .join(', ');
          if (conditions) parts.push(`Conditions: ${conditions}`);

          const medications = extractedRows
            .filter(d => d.data_type === 'medication')
            .map(d => `${d.title}${d.value ? ' ' + d.value : ''}`)
            .join(', ');
          if (medications) parts.push(`Medications: ${medications}`);
        }
        if (docRows.length > 0) {
          const summaries = docRows
            .filter(d => d.ai_summary)
            .map(d => `${d.ai_suggested_name || d.document_type}: ${d.ai_summary!.slice(0, 200)}`)
            .join('\n');
          if (summaries) parts.push(`Document summaries:\n${summaries}`);
        }

        // Upcoming appointments — three rows max so questions like "what
        // should I prepare for Tuesday's visit?" can be grounded.
        const apts = Array.isArray(appointmentsResp?.appointments) ? appointmentsResp.appointments : [];
        if (apts.length > 0) {
          const lines = apts.slice(0, 3).map((a: {
            scheduled_at: string;
            doctor_title: string | null;
            doctor_name: string | null;
            doctor_specialties: string[] | null;
            consultation_type: string | null;
          }) => {
            const doc = [a.doctor_title, a.doctor_name].filter(Boolean).join(' ') || 'a doctor';
            const spec = Array.isArray(a.doctor_specialties) && a.doctor_specialties.length > 0 ? `, ${a.doctor_specialties[0]}` : '';
            return `${new Date(a.scheduled_at).toLocaleString()} with ${doc}${spec} (${a.consultation_type || 'consultation'})`;
          }).join('; ');
          parts.push(`Upcoming appointments: ${lines}`);
        }

        // Doctor notes visible to the patient — last three. Lets the
        // assistant reference "as Dr. Smith noted on May 14, …" instead
        // of re-deriving advice from labs alone.
        const notes = Array.isArray(notesResp?.notes) ? notesResp.notes : [];
        if (notes.length > 0) {
          const noteLines = notes.slice(0, 3).map((n: {
            created_at: string;
            doctor_title: string | null;
            doctor_name: string | null;
            title: string;
            content: string;
            note_type: string | null;
          }) => {
            const doc = [n.doctor_title, n.doctor_name].filter(Boolean).join(' ') || 'doctor';
            return `${new Date(n.created_at).toLocaleDateString()} — ${doc} (${n.note_type || 'note'}): ${n.title} — ${n.content.slice(0, 200)}`;
          }).join('\n');
          parts.push(`Recent doctor notes:\n${noteLines}`);
        }

        if (parts.length > 0) {
          setMedicalContext(parts.join('\n'));
        }
      } catch (error) {
        console.error('Error loading medical context:', error);
      }
    };
    loadContext();
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth/login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Load history from server on mount. If localStorage has a prior
  // session and the server has nothing, migrate once then clear it.
  useEffect(() => {
    if (!user || historyLoaded) return;
    (async () => {
      try {
        const resp = await fetch('/api/chat/messages', { credentials: 'include' });
        if (!resp.ok) return;
        const data = await resp.json();
        const serverMessages: StoredChatMessage[] = (data.messages || []).map((m: { role: string; content: string; created_at?: string | null; conversation_id?: string | null }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          created_at: m.created_at ?? null,
          conversation_id: m.conversation_id ?? null,
        }));
        setHasMoreHistory(Boolean(data.hasMore));
        setEarliestCursor(typeof data.earliestCursor === 'string' ? data.earliestCursor : null);

        if (serverMessages.length > 0) {
          setHistory(serverMessages);
        } else {
          // Server empty — attempt one-time migration from localStorage
          try {
            const saved = localStorage.getItem('womanie_chat_history');
            if (saved) {
              const parsed = JSON.parse(saved) as Msg[];
              const migratable = parsed.filter(m => m.role === 'user' || m.role === 'assistant');
              if (migratable.length > 0) {
                const imp = await fetch('/api/chat/messages', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ messages: migratable }),
                });
                if (imp.ok) {
                  localStorage.removeItem('womanie_chat_history');
                  setHistory(migratable.map(m => ({ role: m.role, content: m.content, created_at: null })));
                }
              }
            }
          } catch { /* ignore migration errors */ }
        }
      } catch (error) {
        console.error('Chat history load failed:', error);
      } finally {
        setHistoryLoaded(true);
      }
    })();
  }, [user, historyLoaded]);

  // Deep-link support: landing on /dashboard/ai-doctor?q=... sends that
  // question as the first user turn automatically. Used by the "Ask
  // about this" buttons on dashboard finding / trend cards so Alena
  // drops into a running conversation instead of an empty input. Ref-
  // tracked so a re-render doesn't re-fire; we also strip the query
  // param once consumed so a refresh doesn't resend.
  const autoSendFiredRef = useRef(false);
  useEffect(() => {
    if (autoSendFiredRef.current) return;
    if (!user || !historyLoaded || isStreaming) return;
    const q = searchParams.get('q');
    if (!q) return;
    autoSendFiredRef.current = true;
    setInput(q);
    // Defer to the next tick so the input state is committed before
    // handleSend reads it.
    setTimeout(() => {
      handleSend();
      const next = new URLSearchParams(searchParams);
      next.delete('q');
      setSearchParams(next, { replace: true });
    }, 0);
    // handleSend is intentionally omitted: this is a ref-guarded one-shot
    // dispatch and memoizing the whole streaming sender for it would be
    // churn without behavior change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, historyLoaded, isStreaming, searchParams, setSearchParams]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming || !user) return;

    const userMsg: Msg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    let assistantSoFar = '';
    let sourcesSoFar: ChatSource[] = [];
    const turnConversationId = conversationId;
    const conversationForApi = newMessages
      .filter(m => m !== WELCOME_MESSAGE)
      .map(m => ({ role: m.role, content: stripSourcesFooter(m.content) }));

    // We used to prepend a synthetic "[SYSTEM CONTEXT ...]" user
    // message with a brief snapshot of the patient's records. The
    // backend already loads the full set (profile, last 20 docs,
    // last 100 extracted values) from the DB via the session user,
    // so the prepended snippet was both a strict subset and a source
    // of fragility (required content-prefix sniffing to avoid being
    // persisted as a real user message). The local `medicalContext`
    // state is still used to pick prompt suggestions below.
    // Build personalContext payload — age + AMH age-bracket assessment
    // + a flat lab-flag line — so Claude can ground answers like "is
    // my AMH normal?" in the age-aware reference, not just the lab's
    // static range. Server validates the shape and ignores anything
    // outside what it expects.
    const flagsBits: string[] = [];
    if (healthContext.tshOutOfRange && healthContext.labs.tsh) flagsBits.push(`TSH ${healthContext.labs.tsh.value} mIU/L (out of 0.4–4.0)`);
    if (healthContext.menopausalFsh && healthContext.labs.fsh) flagsBits.push(`FSH ${healthContext.labs.fsh.value} IU/L (menopausal range)`);
    else if (healthContext.highFsh && healthContext.labs.fsh) flagsBits.push(`FSH ${healthContext.labs.fsh.value} IU/L (above 10 — diminished reserve threshold)`);
    if (healthContext.pcosLhFshPattern) flagsBits.push('LH/FSH > 2 with elevated LH (PCOS pattern)');
    if (healthContext.highProlactin && healthContext.labs.prolactin) flagsBits.push(`prolactin ${healthContext.labs.prolactin.value} ng/mL (elevated)`);
    if (healthContext.highTestosterone && healthContext.labs.testosterone_total) flagsBits.push(`testosterone ${healthContext.labs.testosterone_total.value} ng/dL (above range)`);
    const amhSummary = healthContext.amhAssessment && healthContext.labs.amh
      ? `${healthContext.labs.amh.value} ng/mL for ages ${healthContext.amhAssessment.ageBracket} — ${healthContext.amhAssessment.reserveLabel.replace(/_/g, ' ')} reserve (median ${healthContext.amhAssessment.median}, p5 ${healthContext.amhAssessment.p5} – p95 ${healthContext.amhAssessment.p95})`
      : null;
    // Postpartum weeks lives in localStorage (PostpartumDashboard
     // owns it; no schema column yet). Surface it to the chat
     // backend so Claude can ground time-bound questions ("is this
     // bleeding normal at 5 weeks?") in the actual postpartum
     // window rather than asking the user to repeat herself.
    let postpartumWeeks: number | null = null;
    if (user) {
      try {
        const raw = window.localStorage.getItem(`womanie_postpartum_birth_${user.id}`);
        if (raw) {
          const d = new Date(raw);
          if (!Number.isNaN(d.getTime())) {
            const weeks = Math.floor((Date.now() - d.getTime()) / (7 * 24 * 60 * 60 * 1000));
            if (weeks >= 0 && weeks <= 104) postpartumWeeks = weeks;
          }
        }
      } catch { /* ignore */ }
    }

    // Current cycle phase, derived from recent periods. Suppressed for
    // postpartum users (their old period rows would read as a stale,
    // misleading "luteal phase") — the postpartum line above is the
    // accurate time anchor for them. computeCyclePhase itself returns
    // null on stale/implausible data, so this only ever sends a
    // grounded, current phase.
    const cyclePhase =
      postpartumWeeks === null
        ? (computeCyclePhase(recentPeriods, Date.now())?.summary ?? null)
        : null;

    const personalContext = healthContext.loaded
      ? {
          age: healthContext.age,
          amhSummary,
          flags: flagsBits.length > 0 ? flagsBits.join('; ') : null,
          postpartumWeeks,
          cyclePhase,
        }
      : undefined;

    await streamChat({
      messages: conversationForApi,
      model: selectedModel,
      personalContext,
      conversationId: turnConversationId,
      onSources: (sources) => { sourcesSoFar = sources; },
      onDelta: (chunk) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last !== WELCOME_MESSAGE) {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar, sources: sourcesSoFar } : m));
          }
          return [...prev, { role: 'assistant', content: assistantSoFar, sources: sourcesSoFar }];
        });
      },
      onReplace: (clean) => {
        // The server removed citations its sources do not support; show
        // (and keep in Past chats) the text it saved, not the raw stream.
        assistantSoFar = clean;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last !== WELCOME_MESSAGE) {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: clean, sources: sourcesSoFar } : m));
          }
          return prev;
        });
      },
      onDone: () => {
        setIsStreaming(false);
        // The server stored this turn; mirror it into Past chats without a refetch.
        if (assistantSoFar) {
          const now = new Date().toISOString();
          setHistory(h => [
            ...h,
            { role: 'user', content: text, created_at: now, conversation_id: turnConversationId },
            { role: 'assistant', content: assistantSoFar, created_at: now, conversation_id: turnConversationId, sources: sourcesSoFar },
          ]);
        }
      },
      onError: (err) => {
        // If we got partial response, keep it and add error note
        if (assistantSoFar) {
          assistantSoFar += '\n\n*[Response interrupted — try asking again]*';
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last !== WELCOME_MESSAGE) {
              return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
            }
            return prev;
          });
        }
        toast({ variant: 'destructive', title: 'AI Error', description: err });
        setIsStreaming(false);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Older stored messages for the Past chats list (50 per page).
  const loadEarlier = async () => {
    if (!earliestCursor) return;
    setLoadingEarlier(true);
    try {
      const resp = await fetch(
        `/api/chat/messages?before=${encodeURIComponent(earliestCursor)}`,
        { credentials: 'include' },
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const older: StoredChatMessage[] = (data.messages || []).map((m: { role: string; content: string; created_at?: string | null; conversation_id?: string | null }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        created_at: m.created_at ?? null,
        conversation_id: m.conversation_id ?? null,
      }));
      setHistory(prev => [...older, ...prev]);
      setHasMoreHistory(Boolean(data.hasMore));
      setEarliestCursor(typeof data.earliestCursor === 'string' ? data.earliestCursor : null);
    } catch (err) {
      console.error('Load earlier failed:', err);
    } finally {
      setLoadingEarlier(false);
    }
  };

  const pastChats = groupIntoChats(history);

  const openPastChat = (chat: PastChat<StoredChatMessage & { sources?: ChatSource[] }>) => {
    setMessages([WELCOME_MESSAGE, ...chat.messages.map(m => ({ role: m.role, content: m.content, sources: m.sources }))]);
    // Continue this chat under its id. Chats saved before ids existed
    // have none; their follow-ups start a fresh id.
    setConversationId(chat.conversationId ?? newConversationId());
    setInput('');
    setShowPast(false);
  };

  const startNewChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setConversationId(newConversationId());
    setInput('');
    setShowPast(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const clearChat = async () => {
    // Only ask for confirmation when there's real history to lose —
    // clearing an already-empty chat would just surface a pointless
    // prompt.
    const hasRealHistory = history.length > 0 || messages.some(m => m !== WELCOME_MESSAGE);
    if (hasRealHistory && !window.confirm('Delete all your past chats? This cannot be undone.')) {
      return;
    }
    setMessages([WELCOME_MESSAGE]);
    setConversationId(newConversationId());
    setHistory([]);
    setHasMoreHistory(false);
    setEarliestCursor(null);
    setInput('');
    try { localStorage.removeItem('womanie_chat_history'); } catch { /* ignore */ }
    try {
      await fetch('/api/chat/messages', { method: 'DELETE', credentials: 'include' });
    } catch { /* ignore */ }
  };

  // Export the current conversation as a markdown file. Patients often
  // want to share what the AI said with their actual doctor — until now
  // the only way was a screenshot. Markdown survives copy-paste into
  // Notes / Gmail / a clinic portal without losing the structure of
  // headings + lists Claude usually returns.
  const exportChat = () => {
    const real = messages.filter(m => m !== WELCOME_MESSAGE && m.content?.trim());
    if (real.length === 0) {
      toast({ title: 'Nothing to export', description: 'Send a message first.' });
      return;
    }
    const stamp = new Date();
    const header = [
      `# Womanie AI Health Assistant`,
      ``,
      `Exported: ${stamp.toLocaleString()}`,
      `Model: ${selectedModel}`,
      ``,
      `> This conversation is for reference only. The AI assistant on Womanie is not a substitute for medical advice from a licensed clinician.`,
      ``,
      `---`,
      ``,
    ].join('\n');
    const body = real
      .map(m => {
        const role = m.role === 'user' ? '## You' : '## Assistant';
        return `${role}\n\n${m.content.trim()}\n`;
      })
      .join('\n---\n\n');
    const blob = new Blob([header + body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `womanie-chat-${stamp.toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Chat exported', description: 'Saved a markdown file — open it anywhere or share with your doctor.' });
  };

  // At most 3 suggested first questions, from the life stage and what is
  // in the records (src/lib/chatSuggestions.ts). With no records at all,
  // the suggestions guide toward uploading instead.
  const hasContext = Boolean(medicalContext && medicalContext.length > 0);
  // Match the exact `Life stage: <key>` line the medicalContext builder emits.
  const lifeStageMatch = medicalContext?.match(/Life stage: ([\w-]+)/);
  const lifeStage = lifeStageMatch?.[1] ?? null;
  const suggestedQuestions = pickSuggestions({
    lifeStage,
    hasContext,
    hasFlaggedResults: Boolean(medicalContext?.includes('abnormal') || medicalContext?.includes('critical')),
    hasUpcomingVisit: Boolean(medicalContext?.includes('Upcoming appointments:')),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const isNewChat = !messages.some(m => m !== WELCOME_MESSAGE);

  return (
    // The mobile nav is a left rail now, so the pinned input only needs to
    // clear the phone's home-indicator safe area.
    <div className="min-h-screen bg-background flex flex-col pb-[env(safe-area-inset-bottom)]">
      {/* Header: title, Past chats / New chat, and a ⋯ menu for the rest */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2">
          {showPast && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowPast(false)} aria-label="Back to chat">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="font-display text-[17px] font-medium leading-tight flex-1 min-w-0 truncate">
            {showPast ? 'Past chats' : 'Ask AI'}
          </h1>
          {!showPast && !isNewChat && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={startNewChat} disabled={isStreaming}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              New chat
            </Button>
          )}
          {!showPast && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={() => setShowPast(true)} disabled={isStreaming}>
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Past chats
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="More options">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">AI model</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={selectedModel} onValueChange={(v) => { if (!isStreaming) setSelectedModel(v); }}>
                {AI_MODELS.map((m) => (
                  <DropdownMenuRadioItem key={m.id} value={m.id}>
                    <span className="flex flex-col">
                      <span className="text-xs font-medium">{m.label}</span>
                      <span className="text-[10px] text-muted-foreground">{m.description}</span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={exportChat}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                Export this chat
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/library')}>
                <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                Research library
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={clearChat} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Delete all chats
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Past chats list, or the chat itself */}
      {showPast ? (
        <PastChats
          chats={pastChats}
          loading={!historyLoaded}
          hasMore={hasMoreHistory && Boolean(earliestCursor)}
          loadingEarlier={loadingEarlier}
          onOpen={openPastChat}
          onLoadEarlier={loadEarlier}
        />
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`group max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 relative ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <>
                      {(() => {
                        const { body: rawBody, sources } = msg.sources
                          ? { body: msg.content, sources: msg.sources }
                          : splitSourcesFooter(msg.content);
                        // Hide [n] markers that point at no source we were given.
                        const body = stripUnknownCitations(rawBody, sources.map((s) => s.n));
                        const cited = citedSources(body, sources);
                        return (
                          <>
                            <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm [&_a]:text-primary [&_a]:no-underline [&_a]:font-medium">
                              <ReactMarkdown rehypePlugins={[rehypeSanitize]} disallowedElements={NO_REMOTE_IMAGES}>{tablesToLists(linkCitations(body, cited))}</ReactMarkdown>
                            </div>
                            {cited.length > 0 && <ChatSources sources={cited} onBrowse={() => navigate('/library')} />}
                          </>
                        );
                      })()}
                      {msg !== WELCOME_MESSAGE && msg.content.trim() && (
                        <button
                          type="button"
                          onClick={() => copyAssistantMessage(i, msg.content)}
                          className="absolute -bottom-3 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-background border border-border text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-foreground"
                          aria-label="Copy this reply"
                          title="Copy this reply"
                        >
                          {justCopiedIdx === i ? (
                            <><Check className="h-3 w-3" />Copied</>
                          ) : (
                            <><Copy className="h-3 w-3" />Copy</>
                          )}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="h-3.5 w-3.5 text-secondary" />
                  </div>
                )}
              </div>
            ))}

            {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Suggested Questions */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2" data-testid="suggestions">
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-1.5 px-3 rounded-full max-w-full whitespace-normal text-left"
                    onClick={() => {
                      setInput(q);
                      setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area — the install banner stays away while it's on screen */}
          <div className="border-t border-border bg-card p-4" data-hide-install-banner>
            <div className="max-w-4xl mx-auto flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your health records..."
                maxLength={8000}
                className="min-h-[44px] max-h-[120px] resize-none text-sm rounded-xl"
                rows={1}
                disabled={isStreaming}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                size="icon"
                className="rounded-xl h-[44px] w-[44px] flex-shrink-0"
                aria-label="Send"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-center mt-2">
              <button
                type="button"
                onClick={() => navigate('/dashboard/appointments')}
                className="text-primary hover:underline underline-offset-2"
              >
                Prefer a real doctor? Book a visit &rarr;
              </button>
            </p>
            <p className="text-[10px] text-muted-foreground text-center mt-1">
              Information only, not medical advice.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
